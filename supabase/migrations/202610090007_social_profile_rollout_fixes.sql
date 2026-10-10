begin;

-- Generated handles are public values, so they must pass the same text safety
-- checks as handles selected in Settings. Keep the legacy generator intact for
-- migration compatibility and make all new profile allocation use this wrapper.
create or replace function private.safe_social_username_base(p_email text)
returns text
language plpgsql security definer set search_path = '' as $$
declare candidate text;
begin
  candidate := private.social_username_base(p_email);
  begin
    perform private.assert_public_text_allowed(candidate);
  exception when check_violation then
    return 'collector';
  end;
  return candidate;
end;
$$;
revoke all on function private.safe_social_username_base(text) from public, anon, authenticated;

create or replace function private.ensure_collector_profile(p_owner uuid, p_email text)
returns private.collector_profiles
language plpgsql security definer set search_path = '' as $$
declare profile private.collector_profiles%rowtype; base text; candidate text; suffix bigint; use_suffix boolean := false;
begin
  if p_owner is null then raise exception 'sign in required' using errcode = '42501'; end if;
  insert into private.public_publishers(owner_id) values (p_owner) on conflict do nothing;
  select * into profile from private.collector_profiles where owner_id = p_owner for update;
  if found then return profile; end if;
  base := private.safe_social_username_base(p_email);
  loop
    if use_suffix then
      suffix := nextval('private.collector_username_suffix_seq'::regclass);
      candidate := left(base, greatest(1, 30 - char_length(suffix::text) - 1)) || '_' || suffix::text;
    else
      candidate := base;
    end if;
    insert into private.collector_profiles(owner_id, username)
      values (p_owner, candidate)
      on conflict do nothing
      returning * into profile;
    if found then return profile; end if;
    select * into profile from private.collector_profiles where owner_id = p_owner for update;
    if found then return profile; end if;
    use_suffix := true;
  end loop;
end;
$$;
revoke all on function private.ensure_collector_profile(uuid, text) from public, anon, authenticated;

-- Correct old generated handles that now fail public-text checks. This only
-- updates the public handle; the stable publisher ID and profile completion
-- state remain unchanged.
create or replace function private.repair_generated_collector_username(p_owner uuid, p_email text)
returns void
language plpgsql security definer set search_path = '' as $$
declare base text; candidate text; suffix bigint; use_suffix boolean := false;
begin
  perform 1 from private.collector_profiles where owner_id = p_owner for update;
  if not found then return; end if;
  base := private.safe_social_username_base(p_email);
  loop
    if use_suffix then
      suffix := nextval('private.collector_username_suffix_seq'::regclass);
      candidate := left(base, greatest(1, 30 - char_length(suffix::text) - 1)) || '_' || suffix::text;
    else
      candidate := base;
    end if;
    begin
      update private.collector_profiles set username = candidate, updated_at = now() where owner_id = p_owner;
      return;
    exception when unique_violation then
      use_suffix := true;
    end;
  end loop;
end;
$$;
revoke all on function private.repair_generated_collector_username(uuid, text) from public, anon, authenticated;

do $$
declare account record;
begin
  for account in
    select profile.owner_id, profile.username, users.email
      from private.collector_profiles profile
      left join auth.users users on users.id = profile.owner_id
  loop
    begin
      perform private.assert_public_text_allowed(account.username);
    exception when check_violation then
      perform private.repair_generated_collector_username(account.owner_id, account.email);
    end;
  end loop;
end;
$$;

-- The public projections may retain their stable publisher identifier while
-- profiles are staged off, but must not expose a collector handle.
create or replace function private.visible_social_username(p_username text)
returns text
language sql stable security definer set search_path = '' as $$
  select case when coalesce((select profiles_enabled from private.social_config where singleton = true), false)
    then p_username else null end;
$$;
revoke all on function private.visible_social_username(text) from public, anon, authenticated;

create or replace function private.apply_social_username(
  p_actor uuid,
  p_username text,
  p_complete_intro boolean
)
returns private.collector_profiles
language plpgsql security definer set search_path = '' as $$
declare
  email_value text;
  profile private.collector_profiles%rowtype;
  username_value text;
  is_initial_completion boolean;
  limit_value integer;
begin
  select email into email_value from auth.users where id = p_actor;
  profile := private.ensure_collector_profile(p_actor, email_value);
  select * into profile from private.collector_profiles where owner_id = p_actor for update;
  username_value := private.normalize_username(p_username);

  if profile.username = username_value then
    if p_complete_intro and profile.intro_completed_at is null then
      update private.collector_profiles
        set intro_completed_at = now(), updated_at = now()
        where owner_id = p_actor
        returning * into profile;
    end if;
    return profile;
  end if;

  -- Completion with a newly selected initial handle is allowed while writes
  -- are staged off. Every later rename is subject to the shared write switch
  -- and the daily quota.
  is_initial_completion := p_complete_intro and profile.intro_completed_at is null;
  if not is_initial_completion then
    perform private.require_social_writes_enabled();
    select username_changes_per_day into limit_value from private.social_config where singleton = true;
    perform private.consume_social_counter(
      p_actor,
      'username_rename',
      date_trunc('day', now()),
      date_trunc('day', now()) + interval '2 days',
      limit_value,
      'Username changes are limited for today.'
    );
  end if;

  update private.collector_profiles
    set username = username_value,
        intro_completed_at = case when p_complete_intro then coalesce(intro_completed_at, now()) else intro_completed_at end,
        updated_at = now()
    where owner_id = p_actor
    returning * into profile;
  return profile;
end;
$$;
revoke all on function private.apply_social_username(uuid, text, boolean) from public, anon, authenticated;

create or replace function public.complete_profile_intro(p_username text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); profile private.collector_profiles%rowtype;
begin
  if actor is null then raise exception 'sign in required' using errcode = '42501'; end if;
  perform private.require_profiles_enabled();
  profile := private.apply_social_username(actor, p_username, true);
  return private.social_profile_json(actor, profile);
end;
$$;
revoke all on function public.complete_profile_intro(text) from public, anon, authenticated;
grant execute on function public.complete_profile_intro(text) to authenticated, service_role;

create or replace function public.update_username(p_username text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); profile private.collector_profiles%rowtype;
begin
  if actor is null then raise exception 'sign in required' using errcode = '42501'; end if;
  perform private.require_profiles_enabled();
  profile := private.apply_social_username(actor, p_username, false);
  return private.social_profile_json(actor, profile);
end;
$$;
revoke all on function public.update_username(text) from public, anon, authenticated;
grant execute on function public.update_username(text) to authenticated, service_role;

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
    'creator', jsonb_build_object('publisherId', publisher.public_id, 'username', private.visible_social_username(profile.username)),
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

create or replace function public.get_shared_collection(p_collection_id uuid, p_page integer default 0)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare scope record; collection_row record; item_rows jsonb; item_total integer;
begin
  if p_collection_id is null or p_page is null or p_page < 0 or p_page > 20 then return null; end if;
  select * into scope from private.resolve_shared_scope(p_collection_id) limit 1;
  if not found then return null; end if;
  select c.id, c.owner_id, c.name into collection_row from public.collections c
    where c.id = scope.collection_id and exists (
      select 1 from private.visible_public_items i where i.collection_id = c.id and (scope.category_id is null or i.category_id = scope.category_id)
    );
  if not found then return null; end if;
  select count(*) into item_total from private.visible_public_items i
    where i.collection_id = scope.collection_id and (scope.category_id is null or i.category_id = scope.category_id);
  select coalesce(jsonb_agg(
    private.shared_entry_json(auth.uid(), page.id) || jsonb_build_object('categoryId', null, 'categoryName', null)
    order by page.created_at desc, page.id desc), '[]'::jsonb)
    into item_rows from (
      select i.id, i.created_at
      from private.visible_public_items i
      where i.collection_id = scope.collection_id and (scope.category_id is null or i.category_id = scope.category_id)
      order by i.created_at desc, i.id desc limit 24 offset (p_page::bigint * 24)
    ) page;
  return jsonb_build_object(
    'collection', jsonb_build_object(
      'id', collection_row.id,
      'name', collection_row.name,
      'publisherId', private.public_publisher_id(collection_row.owner_id),
      'creator', jsonb_build_object(
        'publisherId', private.public_publisher_id(collection_row.owner_id),
        'username', private.visible_social_username((select username from private.collector_profiles where owner_id = collection_row.owner_id))
      )
    ),
    'scope', jsonb_build_object('collectionId', scope.collection_id, 'categoryId', scope.category_id),
    'categories', '[]'::jsonb,
    'items', item_rows,
    'total', item_total,
    'hasMore', p_page::bigint * 24 + jsonb_array_length(item_rows) < item_total
  );
end;
$$;
revoke all on function public.get_shared_collection(uuid, integer) from public, anon, authenticated;
grant execute on function public.get_shared_collection(uuid, integer) to anon, authenticated, service_role;

create or replace function public.list_public_collections(p_page integer default 0)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare collection_rows jsonb; collection_total integer;
begin
  if p_page is null or p_page < 0 or p_page > 20 then return null; end if;
  select count(distinct collection_id) into collection_total from private.visible_public_items;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', page.id,
      'name', page.name,
      'itemCount', page.item_count,
      'coverItemId', page.cover_item_id,
      'publisherId', page.public_id,
      'creator', jsonb_build_object('publisherId', page.public_id, 'username', private.visible_social_username(page.username)),
      'isOwner', coalesce((select auth.uid()) = page.owner_id, false)
    ) order by page.last_uploaded_at desc, page.id desc), '[]'::jsonb)
    into collection_rows from (
      select c.id, c.owner_id, c.name, publisher.public_id, profile.username,
        max(i.created_at) as last_uploaded_at, count(i.id)::integer as item_count,
        (array_agg(i.id order by i.created_at desc, i.id desc) filter (where exists(select 1 from public.item_images image where image.item_id = i.id and image.owner_id = i.owner_id)))[1] as cover_item_id
      from public.collections c
      join private.visible_public_items i on i.collection_id = c.id and i.owner_id = c.owner_id
      join private.public_publishers publisher on publisher.owner_id = c.owner_id
      left join private.collector_profiles profile on profile.owner_id = c.owner_id
      group by c.id, c.owner_id, c.name, publisher.public_id, profile.username
      order by max(i.created_at) desc, c.id desc limit 24 offset (p_page::bigint * 24)
    ) page;
  return jsonb_build_object('collections', collection_rows, 'total', collection_total, 'hasMore', collection_total > (p_page + 1) * 24);
end;
$$;
revoke all on function public.list_public_collections(integer) from public, anon, authenticated;
grant execute on function public.list_public_collections(integer) to anon, authenticated, service_role;

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
      'creator', jsonb_build_object('publisherId', collection_row.public_id, 'username', private.visible_social_username(collection_row.username))
    ),
    'entries', jsonb_build_object('items', item_rows, 'nextCursor', next_cursor),
    'visibleItemCount', item_total
  );
end;
$$;
revoke all on function public.get_visible_collection(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.get_visible_collection(uuid, jsonb) to anon, authenticated, service_role;

commit;
