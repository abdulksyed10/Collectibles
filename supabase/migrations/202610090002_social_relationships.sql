begin;

create table private.collector_follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followed_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  check (follower_id <> followed_id)
);
create index collector_follows_followed_follower on private.collector_follows(followed_id, follower_id);
revoke all on private.collector_follows from public, anon, authenticated;

create or replace function private.lock_social_pair(p_first uuid, p_second uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_first is null or p_second is null or p_first = p_second then
    raise exception 'Invalid collector.' using errcode = '22023';
  end if;
  perform 1 from auth.users where id in (p_first, p_second) order by id for update;
  if not found or (select count(*) from auth.users where id in (p_first, p_second)) <> 2 then
    raise exception 'Collector unavailable.' using errcode = '22023';
  end if;
  if exists (select 1 from private.owner_state where owner_id in (p_first, p_second) and deleting) then
    raise exception 'This collector is unavailable.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.lock_social_pair(uuid, uuid) from public, anon, authenticated;

create or replace function private.social_owner_for_public_id(p_publisher_id uuid)
returns uuid
language sql stable security definer set search_path = '' as $$
  select owner_id from private.public_publishers where public_id = p_publisher_id;
$$;
revoke all on function private.social_owner_for_public_id(uuid) from public, anon, authenticated;

create or replace function private.relationship_json(p_viewer uuid, p_target uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare follows_target boolean := false; follows_viewer boolean := false; viewer_blocked boolean := false; either_blocked boolean := false;
begin
  if p_target is null then return null; end if;
  if p_viewer is null then
    return jsonb_build_object('isFollowing', false, 'isFollower', false, 'isFriend', false, 'blockedByMe', false, 'interactionAllowed', true);
  end if;
  if p_viewer = p_target then
    return jsonb_build_object('isFollowing', false, 'isFollower', false, 'isFriend', false, 'blockedByMe', false, 'interactionAllowed', false);
  end if;
  select exists(select 1 from private.collector_follows where follower_id=p_viewer and followed_id=p_target),
         exists(select 1 from private.collector_follows where follower_id=p_target and followed_id=p_viewer),
         exists(select 1 from private.publisher_blocks where viewer_id=p_viewer and publisher_id=p_target),
         exists(select 1 from private.publisher_blocks where (viewer_id=p_viewer and publisher_id=p_target) or (viewer_id=p_target and publisher_id=p_viewer))
    into follows_target, follows_viewer, viewer_blocked, either_blocked;
  return jsonb_build_object(
    'isFollowing', follows_target,
    'isFollower', follows_viewer,
    'isFriend', follows_target and follows_viewer,
    'blockedByMe', viewer_blocked,
    'interactionAllowed', not either_blocked
  );
end;
$$;
revoke all on function private.relationship_json(uuid, uuid) from public, anon, authenticated;

create or replace function private.collector_profile_json(p_viewer uuid, p_target uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'publisherId', publisher.public_id,
    'username', profile.username,
    'relationship', private.relationship_json(p_viewer, p_target)
  )
  from private.collector_profiles profile
  join private.public_publishers publisher on publisher.owner_id = profile.owner_id
  left join private.owner_state state on state.owner_id = profile.owner_id
  where profile.owner_id = p_target
    and coalesce(state.deleting, false) = false;
$$;
revoke all on function private.collector_profile_json(uuid, uuid) from public, anon, authenticated;
create or replace function private.require_social_writes_enabled()
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce((select social_writes_enabled from private.social_config where singleton), false) then
    raise exception 'Following is not available yet.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.require_social_writes_enabled() from public, anon, authenticated;

create or replace function private.consume_social_counter(
  p_actor uuid,
  p_action text,
  p_bucket_start timestamptz,
  p_expires_at timestamptz,
  p_limit integer,
  p_message text
)
returns void
language plpgsql security definer set search_path = '' as $$
declare counter_count integer;
begin
  insert into private.social_action_counters(actor_id, action, bucket_start, expires_at)
    values (p_actor, p_action, p_bucket_start, p_expires_at)
    on conflict do nothing;
  select count into counter_count from private.social_action_counters
    where actor_id=p_actor and action=p_action and bucket_start=p_bucket_start for update;
  if counter_count >= p_limit then
    raise exception '%', p_message using errcode = '42901';
  end if;
  update private.social_action_counters
    set count=count+1
    where actor_id=p_actor and action=p_action and bucket_start=p_bucket_start;
end;
$$;
revoke all on function private.consume_social_counter(uuid, text, timestamptz, timestamptz, integer, text) from public, anon, authenticated;

create or replace function private.block_collector_owner(p_actor uuid, p_target uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform private.lock_social_pair(p_actor, p_target);
  delete from private.collector_follows
    where (follower_id=p_actor and followed_id=p_target) or (follower_id=p_target and followed_id=p_actor);
  insert into private.publisher_blocks(viewer_id, publisher_id) values (p_actor, p_target) on conflict do nothing;
  return true;
end;
$$;
revoke all on function private.block_collector_owner(uuid, uuid) from public, anon, authenticated;

create or replace function public.get_collector(p_publisher_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare target uuid;
begin
  if not coalesce((select profiles_enabled from private.social_config where singleton), false) then return null; end if;
  target := private.social_owner_for_public_id(p_publisher_id);
  if target is null then return null; end if;
  return private.collector_profile_json(auth.uid(), target);
end;
$$;
revoke all on function public.get_collector(uuid) from public, anon, authenticated;
grant execute on function public.get_collector(uuid) to anon, authenticated, service_role;

create or replace function public.set_following(p_publisher_id uuid, p_following boolean)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); target uuid; existing boolean; maximum integer; hourly integer; daily integer;
begin
  if actor is null or p_publisher_id is null or p_following is null then
    raise exception 'Sign in to follow collectors.' using errcode = '42501';
  end if;
  target := private.social_owner_for_public_id(p_publisher_id);
  if target is null or target = actor then raise exception 'You cannot follow this collector.' using errcode = '22023'; end if;
  perform private.lock_social_pair(actor, target);
  if not p_following then
    delete from private.collector_follows where follower_id=actor and followed_id=target;
    return private.relationship_json(actor, target);
  end if;
  if exists (select 1 from private.publisher_blocks where (viewer_id=actor and publisher_id=target) or (viewer_id=target and publisher_id=actor)) then
    raise exception 'You cannot follow this collector.' using errcode = '42501';
  end if;
  select exists(select 1 from private.collector_follows where follower_id=actor and followed_id=target) into existing;
  if existing then return private.relationship_json(actor, target); end if;
  perform private.require_social_writes_enabled();
  select max_follows, follows_per_hour, follows_per_day into maximum, hourly, daily from private.social_config where singleton;
  if (select count(*) from private.collector_follows where follower_id=actor) >= maximum then
    raise exception 'Follow limit reached.' using errcode = '42901';
  end if;
  perform private.consume_social_counter(actor, 'follow_hour', date_trunc('hour', now()), date_trunc('hour', now()) + interval '2 hours', hourly, 'Follow limit reached.');
  perform private.consume_social_counter(actor, 'follow_day', date_trunc('day', now()), date_trunc('day', now()) + interval '2 days', daily, 'Follow limit reached.');
  insert into private.collector_follows(follower_id, followed_id) values (actor, target);
  return private.relationship_json(actor, target);
end;
$$;
revoke all on function public.set_following(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_following(uuid, boolean) to authenticated, service_role;

create or replace function public.remove_follower(p_publisher_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); target uuid;
begin
  if actor is null or p_publisher_id is null then raise exception 'Sign in to manage followers.' using errcode='42501'; end if;
  target := private.social_owner_for_public_id(p_publisher_id);
  if target is null or target=actor then raise exception 'Collector unavailable.' using errcode='22023'; end if;
  perform private.lock_social_pair(actor, target);
  delete from private.collector_follows where follower_id=target and followed_id=actor;
  return private.relationship_json(actor, target);
end;
$$;
revoke all on function public.remove_follower(uuid) from public, anon, authenticated;
grant execute on function public.remove_follower(uuid) to authenticated, service_role;

create or replace function public.block_collector(p_publisher_id uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); target uuid;
begin
  if actor is null or p_publisher_id is null then raise exception 'Sign in to block a collector.' using errcode='42501'; end if;
  target := private.social_owner_for_public_id(p_publisher_id);
  if target is null or target=actor then raise exception 'Collector unavailable.' using errcode='22023'; end if;
  return private.block_collector_owner(actor, target);
end;
$$;
revoke all on function public.block_collector(uuid) from public, anon, authenticated;
grant execute on function public.block_collector(uuid) to authenticated, service_role;

create or replace function public.block_public_collection(p_collection_id uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); target uuid;
begin
  if actor is null or p_collection_id is null then return false; end if;
  select item.owner_id into target
    from private.resolve_shared_scope(p_collection_id) scope
    join private.visible_public_items item on item.collection_id=scope.collection_id
      and (scope.category_id is null or item.category_id=scope.category_id)
    where item.owner_id<>actor
    limit 1;
  if target is null then return false; end if;
  return private.block_collector_owner(actor, target);
end;
$$;
revoke all on function public.block_public_collection(uuid) from public, anon, authenticated;
grant execute on function public.block_public_collection(uuid) to authenticated, service_role;

create or replace function public.unblock_public_publisher(p_publisher_id uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); target uuid;
begin
  if actor is null or p_publisher_id is null then return false; end if;
  target := private.social_owner_for_public_id(p_publisher_id);
  if target is null or target=actor then return false; end if;
  perform private.lock_social_pair(actor, target);
  delete from private.publisher_blocks where viewer_id=actor and publisher_id=target;
  return found;
end;
$$;
revoke all on function public.unblock_public_publisher(uuid) from public, anon, authenticated;
grant execute on function public.unblock_public_publisher(uuid) to authenticated, service_role;

create or replace function private.social_cursor(p_cursor jsonb)
returns table(username text, publisher_id uuid)
language plpgsql immutable set search_path = '' as $$
begin
  if p_cursor is null then return; end if;
  if jsonb_typeof(p_cursor) <> 'object' or jsonb_object_length(p_cursor) <> 2
    or jsonb_typeof(p_cursor->'username') <> 'string' or jsonb_typeof(p_cursor->'publisherId') <> 'string'
    or char_length(p_cursor->>'username') > 30 then
    raise exception 'Invalid page.' using errcode='22023';
  end if;
  username := p_cursor->>'username';
  begin publisher_id := (p_cursor->>'publisherId')::uuid; exception when others then raise exception 'Invalid page.' using errcode='22023'; end;
  return next;
end;
$$;
revoke all on function private.social_cursor(jsonb) from public, anon, authenticated;

create or replace function public.search_collectors(p_query text, p_cursor jsonb default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); query_value text; cursor_username text; cursor_publisher uuid; row record; values_json jsonb := '[]'::jsonb; next_cursor jsonb := null; position integer := 0; search_limit integer;
begin
  if actor is null then raise exception 'Sign in to find collectors.' using errcode='42501'; end if;
  perform private.require_profiles_enabled();
  query_value := lower(btrim(coalesce(p_query,'')));
  if char_length(query_value) not between 2 and 30 then raise exception 'Enter at least two characters.' using errcode='22023'; end if;
  select search_per_minute into search_limit from private.social_config where singleton;
  perform private.consume_social_counter(actor, 'search_minute', date_trunc('minute',now()), date_trunc('minute',now()) + interval '2 minutes', search_limit, 'Search limit reached.');
  select username,publisher_id into cursor_username,cursor_publisher from private.social_cursor(p_cursor);
  for row in
    select profile.owner_id, profile.username, publisher.public_id
      from private.collector_profiles profile
      join private.public_publishers publisher on publisher.owner_id=profile.owner_id
      left join private.owner_state state on state.owner_id=profile.owner_id
      where profile.owner_id<>actor
        and not coalesce(state.deleting, false)
        and left(profile.username, char_length(query_value))=query_value
        and (cursor_username is null or (profile.username, publisher.public_id) > (cursor_username, cursor_publisher))
      order by profile.username, publisher.public_id
      limit 25
  loop
    position := position + 1;
    if position = 25 then next_cursor := jsonb_build_object('username',row.username,'publisherId',row.public_id); exit; end if;
    values_json := values_json || jsonb_build_array(private.collector_profile_json(actor, row.owner_id));
  end loop;
  return jsonb_build_object('items',values_json,'nextCursor',next_cursor);
end;
$$;
revoke all on function public.search_collectors(text, jsonb) from public, anon, authenticated;
grant execute on function public.search_collectors(text, jsonb) to authenticated, service_role;
create or replace function public.list_people(p_kind text, p_cursor jsonb default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); cursor_username text; cursor_publisher uuid; row record; values_json jsonb := '[]'::jsonb; next_cursor jsonb := null; position integer := 0;
begin
  if actor is null then raise exception 'Sign in to manage collectors.' using errcode='42501'; end if;
  perform private.require_profiles_enabled();
  if p_kind not in ('following','followers','friends','blocked') then raise exception 'Invalid people list.' using errcode='22023'; end if;
  select username,publisher_id into cursor_username,cursor_publisher from private.social_cursor(p_cursor);
  for row in
    select distinct profile.owner_id, profile.username, publisher.public_id
    from private.collector_profiles profile
    join private.public_publishers publisher on publisher.owner_id=profile.owner_id
    left join private.owner_state state on state.owner_id=profile.owner_id
    where not coalesce(state.deleting, false)
      and (
        (p_kind='following' and exists(select 1 from private.collector_follows f where f.follower_id=actor and f.followed_id=profile.owner_id))
        or (p_kind='followers' and exists(select 1 from private.collector_follows f where f.follower_id=profile.owner_id and f.followed_id=actor))
        or (p_kind='friends' and exists(select 1 from private.collector_follows f where f.follower_id=actor and f.followed_id=profile.owner_id) and exists(select 1 from private.collector_follows g where g.follower_id=profile.owner_id and g.followed_id=actor))
        or (p_kind='blocked' and exists(select 1 from private.publisher_blocks b where b.viewer_id=actor and b.publisher_id=profile.owner_id))
      )
      and (cursor_username is null or (profile.username, publisher.public_id) > (cursor_username, cursor_publisher))
    order by profile.username, publisher.public_id
    limit 25
  loop
    position := position + 1;
    if position = 25 then next_cursor := jsonb_build_object('username',row.username,'publisherId',row.public_id); exit; end if;
    values_json := values_json || jsonb_build_array(private.collector_profile_json(actor, row.owner_id));
  end loop;
  return jsonb_build_object('items',values_json,'nextCursor',next_cursor);
end;
$$;
revoke all on function public.list_people(text, jsonb) from public, anon, authenticated;
grant execute on function public.list_people(text, jsonb) to authenticated, service_role;
commit;
