begin;

-- Likes are private relationship data. Counts and the current viewer's state
-- are projected only from already-authorized item reads.
create table if not exists private.item_likes (
  item_id uuid not null references public.items(id) on delete cascade,
  liker_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  primary key (item_id, liker_id)
);
create index if not exists item_likes_liker_created on private.item_likes(liker_id, created_at desc);
revoke all on private.item_likes from public, anon, authenticated;

alter table private.social_config
  add column if not exists likes_per_hour integer not null default 300 check (likes_per_hour between 1 and 100000),
  add column if not exists likes_per_day integer not null default 1000 check (likes_per_day between 1 and 1000000);

create or replace function private.shared_like_json(p_viewer uuid, p_item uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when coalesce((select likes_enabled from private.social_config where singleton), false)
    then jsonb_build_object(
      'count', (select count(*)::integer from private.item_likes likes where likes.item_id = p_item),
      'likedByMe', p_viewer is not null and exists(select 1 from private.item_likes likes where likes.item_id = p_item and likes.liker_id = p_viewer)
    )
    else jsonb_build_object('count', 0, 'likedByMe', false)
  end;
$$;
revoke all on function private.shared_like_json(uuid, uuid) from public, anon, authenticated;

create or replace function private.shared_entry_json(p_viewer uuid, p_item uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', i.id,
    'title', i.title,
    'hasPhoto', exists (select 1 from public.item_images image where image.item_id = i.id and image.owner_id = i.owner_id),
    'collectionId', collection.id,
    'collectionName', collection.name,
    'publisherId', publisher.public_id,
    'creator', jsonb_build_object('publisherId', publisher.public_id, 'username', profile.username),
    'createdAt', i.created_at,
    'audience', i.visibility,
    'relationship', private.relationship_json(p_viewer, i.owner_id),
    'likes', private.shared_like_json(p_viewer, i.id)
  )
  from public.items i
  join public.collections collection on collection.id = i.collection_id and collection.owner_id = i.owner_id
  join private.public_publishers publisher on publisher.owner_id = i.owner_id
  left join private.collector_profiles profile on profile.owner_id = i.owner_id
  where i.id = p_item and private.can_view_shared_item(p_viewer, i.id);
$$;
revoke all on function private.shared_entry_json(uuid, uuid) from public, anon, authenticated;

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
  -- Item-row locking serializes duplicate desired-state adds, so no-op retries
  -- never consume quota and a relationship is rechecked immediately before insert.
  select owner_id into target_owner from public.items where id = p_item_id for update;
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
revoke all on function public.set_item_liked(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_item_liked(uuid, boolean) to authenticated, service_role;

create or replace function public.get_entry_social_state(p_item_ids uuid[])
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); result jsonb;
begin
  if p_item_ids is null or coalesce(array_length(p_item_ids, 1), 0) > 24 then
    raise exception 'Invalid entries.' using errcode = '22023';
  end if;
  select coalesce(jsonb_object_agg(candidate.id::text, private.shared_like_json(actor, candidate.id)), '{}'::jsonb)
    into result
    from (
      select distinct input.id
      from unnest(p_item_ids) as input(id)
      join public.items item on item.id = input.id
      where private.can_view_shared_item(actor, item.id) or (actor is not null and item.owner_id = actor)
    ) candidate;
  return result;
end;
$$;
revoke all on function public.get_entry_social_state(uuid[]) from public, anon, authenticated;
grant execute on function public.get_entry_social_state(uuid[]) to anon, authenticated, service_role;

commit;
