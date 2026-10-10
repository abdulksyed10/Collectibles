begin;

-- Preserve deployed migrations. Correct cursor validation and use the last returned
-- row as the exclusive page boundary, retaining the lookahead row for the next page.

create or replace function private.social_cursor(p_cursor jsonb)
returns table(username text, publisher_id uuid)
language plpgsql immutable set search_path = '' as $$
begin
  if p_cursor is null then return; end if;
  if jsonb_typeof(p_cursor) is distinct from 'object' then
    raise exception 'Invalid page.' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_object_keys(p_cursor)) <> 2
    or jsonb_typeof(p_cursor->'username') is distinct from 'string' or jsonb_typeof(p_cursor->'publisherId') is distinct from 'string'
    or char_length(p_cursor->>'username') > 30 then
    raise exception 'Invalid page.' using errcode='22023';
  end if;
  username := p_cursor->>'username';
  begin publisher_id := (p_cursor->>'publisherId')::uuid; exception when others then raise exception 'Invalid page.' using errcode='22023'; end;
  if username !~ '^[a-z][a-z0-9_]{2,29}$' or publisher_id is null then
    raise exception 'Invalid page.' using errcode = '22023';
  end if;
  return next;
end;
$$;

create or replace function private.shared_feed_cursor(p_cursor jsonb)
returns table(created_at timestamptz, item_id uuid)
language plpgsql immutable set search_path = '' as $$
begin
  if p_cursor is null then return; end if;
  if jsonb_typeof(p_cursor) is distinct from 'object' then
    raise exception 'Invalid page.' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_object_keys(p_cursor)) <> 2
    or jsonb_typeof(p_cursor->'createdAt') is distinct from 'string' or jsonb_typeof(p_cursor->'id') is distinct from 'string'
    or char_length(p_cursor->>'createdAt') > 64 then
    raise exception 'Invalid page.' using errcode = '22023';
  end if;
  begin
    created_at := (p_cursor->>'createdAt')::timestamptz;
    item_id := (p_cursor->>'id')::uuid;
  exception when others then
    raise exception 'Invalid page.' using errcode = '22023';
  end;
  if not isfinite(created_at) or created_at is null or item_id is null then
    raise exception 'Invalid page.' using errcode = '22023';
  end if;
  return next;
end;
$$;

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
    if position = 25 then next_cursor := jsonb_build_object('username',values_json->23->>'username','publisherId',values_json->23->>'publisherId'); exit; end if;
    values_json := values_json || jsonb_build_array(private.collector_profile_json(actor, row.owner_id));
  end loop;
  return jsonb_build_object('items',values_json,'nextCursor',next_cursor);
end;
$$;

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
    if position = 25 then next_cursor := jsonb_build_object('username',values_json->23->>'username','publisherId',values_json->23->>'publisherId'); exit; end if;
    values_json := values_json || jsonb_build_array(private.collector_profile_json(actor, row.owner_id));
  end loop;
  return jsonb_build_object('items',values_json,'nextCursor',next_cursor);
end;
$$;

create or replace function public.list_following_entries(p_cursor jsonb default null, p_friends_only boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  cursor_created_at timestamptz;
  cursor_item_id uuid;
  row record;
  item_rows jsonb := '[]'::jsonb;
  next_cursor jsonb := null;
  position integer := 0;
begin
  if actor is null then raise exception 'Sign in to see Following.' using errcode = '42501'; end if;
  if p_friends_only is null then raise exception 'Invalid filter.' using errcode = '22023'; end if;
  perform private.require_profiles_enabled();
  select created_at, item_id into cursor_created_at, cursor_item_id from private.shared_feed_cursor(p_cursor);
  for row in
    select i.id, i.created_at
      from public.items i
      join private.collector_follows follow on follow.followed_id = i.owner_id and follow.follower_id = actor
      where i.owner_id <> actor
        and (
          (not p_friends_only and i.visibility = 'public')
          or (i.visibility = 'friends' and private.are_friends(actor, i.owner_id))
        )
        and private.can_view_shared_item(actor, i.id)
        and (cursor_created_at is null or (i.created_at, i.id) < (cursor_created_at, cursor_item_id))
      order by i.created_at desc, i.id desc
      limit 25
  loop
    position := position + 1;
    if position = 25 then
      next_cursor := jsonb_build_object('createdAt', item_rows->23->>'createdAt', 'id', item_rows->23->>'id');
      exit;
    end if;
    item_rows := item_rows || jsonb_build_array(private.shared_entry_json(actor, row.id));
  end loop;
  return jsonb_build_object('items', item_rows, 'nextCursor', next_cursor);
end;
$$;

create or replace function public.list_collector_entries(p_publisher_id uuid, p_cursor jsonb default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  target uuid := private.social_owner_for_public_id(p_publisher_id);
  cursor_created_at timestamptz;
  cursor_item_id uuid;
  row record;
  item_rows jsonb := '[]'::jsonb;
  next_cursor jsonb := null;
  position integer := 0;
begin
  if target is null then return jsonb_build_object('items', item_rows, 'nextCursor', null); end if;
  select created_at, item_id into cursor_created_at, cursor_item_id from private.shared_feed_cursor(p_cursor);
  for row in
    select i.id, i.created_at
      from public.items i
      where i.owner_id = target
        and private.can_view_shared_item(auth.uid(), i.id)
        and (cursor_created_at is null or (i.created_at, i.id) < (cursor_created_at, cursor_item_id))
      order by i.created_at desc, i.id desc
      limit 25
  loop
    position := position + 1;
    if position = 25 then
      next_cursor := jsonb_build_object('createdAt', item_rows->23->>'createdAt', 'id', item_rows->23->>'id');
      exit;
    end if;
    item_rows := item_rows || jsonb_build_array(private.shared_entry_json(auth.uid(), row.id));
  end loop;
  return jsonb_build_object('items', item_rows, 'nextCursor', next_cursor);
end;
$$;

create or replace function public.get_visible_collection(p_collection_id uuid, p_cursor jsonb default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  scope record;
  collection_row record;
  cursor_created_at timestamptz;
  cursor_item_id uuid;
  row record;
  item_rows jsonb := '[]'::jsonb;
  next_cursor jsonb := null;
  position integer := 0;
  item_total integer;
begin
  if p_collection_id is null then return null; end if;
  select * into scope from private.resolve_shared_scope(p_collection_id) limit 1;
  if not found then return null; end if;
  select c.id, c.owner_id, c.name, publisher.public_id, profile.username
    into collection_row
    from public.collections c
    join private.public_publishers publisher on publisher.owner_id = c.owner_id
    left join private.collector_profiles profile on profile.owner_id = c.owner_id
    where c.id = scope.collection_id;
  if not found then return null; end if;
  select count(*)::integer into item_total
    from public.items i
    where i.collection_id = scope.collection_id
      and (scope.category_id is null or i.category_id = scope.category_id)
      and private.can_view_shared_item(auth.uid(), i.id);
  if item_total = 0 then return null; end if;
  select created_at, item_id into cursor_created_at, cursor_item_id from private.shared_feed_cursor(p_cursor);
  for row in
    select i.id, i.created_at
      from public.items i
      where i.collection_id = scope.collection_id
        and (scope.category_id is null or i.category_id = scope.category_id)
        and private.can_view_shared_item(auth.uid(), i.id)
        and (cursor_created_at is null or (i.created_at, i.id) < (cursor_created_at, cursor_item_id))
      order by i.created_at desc, i.id desc
      limit 25
  loop
    position := position + 1;
    if position = 25 then
      next_cursor := jsonb_build_object('createdAt', item_rows->23->>'createdAt', 'id', item_rows->23->>'id');
      exit;
    end if;
    item_rows := item_rows || jsonb_build_array(private.shared_entry_json(auth.uid(), row.id));
  end loop;
  return jsonb_build_object(
    'collection', jsonb_build_object(
      'id', collection_row.id,
      'name', collection_row.name,
      'creator', jsonb_build_object('publisherId', collection_row.public_id, 'username', collection_row.username)
    ),
    'entries', jsonb_build_object('items', item_rows, 'nextCursor', next_cursor),
    'visibleItemCount', item_total
  );
end;
$$;

create or replace function public.set_item_liked(p_item_id uuid, p_liked boolean)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  target_owner uuid;
  existing boolean;
  added_rows integer := 0;
  hourly integer;
  daily integer;
begin
  if actor is null then raise exception 'sign in to like an item' using errcode = '42501'; end if;
  if p_item_id is null or p_liked is null then raise exception 'invalid item' using errcode = '22023'; end if;
  if not p_liked then
    delete from private.item_likes where item_id = p_item_id and liker_id = actor;
    return true;
  end if;
  if not coalesce((select likes_enabled from private.social_config where singleton), false) then
    raise exception 'Likes are not available yet.' using errcode = '42501';
  end if;
  perform private.require_social_writes_enabled();
  -- Lock the relationship pair before the item, as follow/block do. Re-read the
  -- item and permissions after those locks; likes cannot race a block or unfollow.
  select owner_id into target_owner from public.items where id = p_item_id;
  if target_owner is null or target_owner = actor then
    raise exception 'This item is unavailable.' using errcode = '42501';
  end if;
  perform private.lock_social_pair(actor, target_owner);
  perform 1 from public.items where id = p_item_id for update;
  if exists (select 1 from private.publisher_blocks where
    (viewer_id = actor and publisher_id = target_owner) or
    (viewer_id = target_owner and publisher_id = actor)) then
    raise exception 'This item is unavailable.' using errcode = '42501';
  end if;
  if target_owner is null or target_owner = actor or not private.can_view_shared_item(actor, p_item_id) then
    raise exception 'This item is unavailable.' using errcode = '42501';
  end if;
  select exists(select 1 from private.item_likes where item_id = p_item_id and liker_id = actor) into existing;
  if existing then return true; end if;
  select likes_per_hour, likes_per_day into hourly, daily from private.social_config where singleton;
  perform private.consume_social_counter(actor, 'like_hour', date_trunc('hour', now()), date_trunc('hour', now()) + interval '2 hours', hourly, 'Like limit reached.');
  perform private.consume_social_counter(actor, 'like_day', date_trunc('day', now()), date_trunc('day', now()) + interval '2 days', daily, 'Like limit reached.');
  insert into private.item_likes(item_id, liker_id) values (p_item_id, actor) on conflict do nothing;
  get diagnostics added_rows = row_count;
  return true;
end;
$$;

create or replace function private.purge_social_counters()
returns void language sql security definer set search_path = '' as $$
  delete from private.social_action_counters where expires_at < now();
$$;
revoke all on function private.purge_social_counters() from public, anon, authenticated;
grant execute on function private.purge_social_counters() to service_role;
-- Existing media deployments may use the restricted database role.
do $$ begin
  if exists(select 1 from pg_roles where rolname = 'pin_media') then
    grant execute on function private.resolve_member_image(uuid, uuid, text) to pin_media;
    grant execute on function private.purge_social_counters() to pin_media;
  end if;
end $$;
notify pgrst, 'reload schema';
commit;
