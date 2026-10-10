begin;

-- A share audience belongs to each item. Public catalog projections remain
-- public-only; Friends-only entries are exposed only by the viewer-aware RPCs
-- below and later by authenticated media delivery.
alter table public.items drop constraint if exists items_visibility_check;
alter table public.items add constraint items_visibility_check
  check (visibility in ('private', 'friends', 'public'));

create or replace function private.require_public_rules()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.visibility in ('public', 'friends') and not exists (
    select 1 from private.owner_public_rules rules
      where rules.owner_id = new.owner_id and rules.version = '2026-10-04'
  ) then
    raise exception 'accept the sharing rules before submitting an entry' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.require_public_rules() from public, anon, authenticated;

create or replace function private.require_friends_sharing_enabled()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.visibility = 'friends' and not coalesce((select friends_sharing_enabled from private.social_config where singleton), false) then
    raise exception 'Friends-only sharing is not available yet.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.require_friends_sharing_enabled() from public, anon, authenticated;
drop trigger if exists require_friends_sharing_on_item on public.items;
create trigger require_friends_sharing_on_item before insert or update of visibility on public.items
  for each row execute function private.require_friends_sharing_enabled();

-- Existing client builds use this atomic writer, so accept the third audience
-- here as well as at table-trigger level. A direct table write cannot bypass
-- the trigger above.
create or replace function public.save_item_draft(
  p_title text,
  p_notes text,
  p_visibility text,
  p_collection_id uuid,
  p_new_collection_name text,
  p_category_id uuid,
  p_new_category_name text,
  p_acquired_on date
)
returns public.items
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  deleting_now boolean;
  target_collection_id uuid;
  target_category_id uuid;
  saved_item public.items%rowtype;
begin
  if actor is null then
    raise exception 'sign in is required' using errcode = '42501';
  end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 120 then
    raise exception 'item name must be between 1 and 120 characters' using errcode = '22023';
  end if;
  if p_notes is null or char_length(btrim(p_notes)) > 2000 then
    raise exception 'notes must be 2,000 characters or fewer' using errcode = '22023';
  end if;
  if p_visibility not in ('private', 'friends', 'public') then
    raise exception 'choose Private, Friends only, or Public' using errcode = '22023';
  end if;
  if p_visibility = 'friends' and not coalesce((select friends_sharing_enabled from private.social_config where singleton), false) then
    raise exception 'Friends-only sharing is not available yet.' using errcode = '42501';
  end if;
  if p_collection_id is not null and p_new_collection_name is not null then
    raise exception 'choose one collection choice' using errcode = '22023';
  end if;
  if p_category_id is not null and p_new_category_name is not null then
    raise exception 'choose one category choice' using errcode = '22023';
  end if;
  if p_new_collection_name is not null and char_length(btrim(p_new_collection_name)) not between 1 and 80 then
    raise exception 'collection name must be between 1 and 80 characters' using errcode = '22023';
  end if;
  if p_new_category_name is not null and char_length(btrim(p_new_category_name)) not between 1 and 80 then
    raise exception 'category name must be between 1 and 80 characters' using errcode = '22023';
  end if;

  insert into private.owner_state(owner_id) values (actor) on conflict do nothing;
  select deleting into deleting_now from private.owner_state where owner_id = actor for update;
  if deleting_now then
    raise exception 'account deletion is in progress' using errcode = '23514';
  end if;

  if p_new_collection_name is not null then
    insert into public.collections(owner_id, name, description)
      values (actor, btrim(p_new_collection_name), '')
      returning id into target_collection_id;
  elsif p_collection_id is not null then
    select c.id into target_collection_id
      from public.collections c
      where c.id = p_collection_id and c.owner_id = actor;
    if not found then
      raise exception 'collection unavailable' using errcode = '23503';
    end if;
  else
    select c.id into target_collection_id
      from public.collections c
      where c.owner_id = actor and lower(c.name) = 'general'
      order by c.created_at, c.id
      limit 1;
    if not found then
      insert into public.collections(owner_id, name, description)
        values (actor, 'General', '')
        returning id into target_collection_id;
    end if;
  end if;

  if p_new_category_name is not null then
    insert into public.categories(owner_id, collection_id, name, description)
      values (actor, target_collection_id, btrim(p_new_category_name), '')
      returning id into target_category_id;
  elsif p_category_id is not null then
    select k.id into target_category_id
      from public.categories k
      where k.id = p_category_id
        and k.collection_id = target_collection_id
        and k.owner_id = actor;
    if not found then
      raise exception 'category is not in this collection' using errcode = '23503';
    end if;
  end if;

  insert into public.items(owner_id, collection_id, category_id, title, notes, visibility, acquired_on)
    values (actor, target_collection_id, target_category_id, btrim(p_title), btrim(p_notes), p_visibility, p_acquired_on)
    returning * into saved_item;
  return saved_item;
end;
$$;
revoke all on function public.save_item_draft(text, text, text, uuid, text, uuid, text, date) from public, anon, authenticated;
grant execute on function public.save_item_draft(text, text, text, uuid, text, uuid, text, date) to authenticated, service_role;

-- Friends-only text is subject to the same lightweight prohibited-term filter
-- as public content because it is shared with other people.
create or replace function private.assert_item_public_text()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare collection_name text; category_name text;
begin
  if new.visibility not in ('public', 'friends') then return new; end if;
  perform private.assert_public_text_allowed(new.title);
  select c.name into collection_name from public.collections c where c.id = new.collection_id and c.owner_id = new.owner_id;
  perform private.assert_public_text_allowed(coalesce(collection_name, ''));
  if new.category_id is not null then
    select c.name into category_name from public.categories c where c.id = new.category_id and c.owner_id = new.owner_id;
    perform private.assert_public_text_allowed(coalesce(category_name, ''));
  end if;
  return new;
end;
$$;
revoke all on function private.assert_item_public_text() from public, anon, authenticated;

create or replace function private.assert_collection_public_text()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.name is distinct from old.name and exists (
    select 1 from public.items i
      where i.collection_id = new.id and i.owner_id = new.owner_id
        and i.visibility in ('public', 'friends')
  ) then
    perform private.assert_public_text_allowed(new.name);
  end if;
  return new;
end;
$$;
revoke all on function private.assert_collection_public_text() from public, anon, authenticated;

create or replace function private.assert_category_public_text()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.name is distinct from old.name and exists (
    select 1 from public.items i
      where i.category_id = new.id and i.owner_id = new.owner_id
        and i.visibility in ('public', 'friends')
  ) then
    perform private.assert_public_text_allowed(new.name);
  end if;
  return new;
end;
$$;
revoke all on function private.assert_category_public_text() from public, anon, authenticated;

-- A publication record continues to protect friends entries from review/removal
-- bypasses. Switching public/friends does not erase an existing review state.
create or replace function private.queue_item_publication_trigger()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.visibility not in ('public', 'friends') then return new; end if;
  if tg_op = 'INSERT' or old.visibility not in ('public', 'friends')
    or new.title is distinct from old.title
    or new.collection_id is distinct from old.collection_id then
    perform private.queue_publication(new.id, new.owner_id);
  end if;
  return new;
end;
$$;
revoke all on function private.queue_item_publication_trigger() from public, anon, authenticated;

create or replace function private.queue_collection_publication_trigger()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.name is distinct from old.name then
    perform private.queue_publication(i.id, i.owner_id, 'This entry needs review after its collection name changed.')
      from public.items i
      where i.collection_id = new.id and i.owner_id = new.owner_id
        and i.visibility in ('public', 'friends');
  end if;
  return new;
end;
$$;
revoke all on function private.queue_collection_publication_trigger() from public, anon, authenticated;

create or replace function private.queue_image_publication_trigger()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare item_row record;
begin
  select id, owner_id, visibility into item_row from public.items where id = new.item_id and owner_id = new.owner_id;
  if found and item_row.visibility in ('public', 'friends') then
    perform private.queue_publication(item_row.id, item_row.owner_id, 'This entry needs review after its photo changed.');
  end if;
  return new;
end;
$$;
revoke all on function private.queue_image_publication_trigger() from public, anon, authenticated;

create or replace function private.are_friends(p_a uuid, p_b uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select p_a is not null and p_b is not null and p_a <> p_b
    and exists (select 1 from private.collector_follows where follower_id = p_a and followed_id = p_b)
    and exists (select 1 from private.collector_follows where follower_id = p_b and followed_id = p_a);
$$;
revoke all on function private.are_friends(uuid, uuid) from public, anon, authenticated;

-- The one permission predicate for non-owner shared metadata and, in Task 5,
-- authenticated image bytes. It intentionally does not grant owners access:
-- their library uses owner-only paths instead.
create or replace function private.can_view_shared_item(p_viewer uuid, p_item uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.items i
      join private.item_publication publication
        on publication.item_id = i.id and publication.owner_id = i.owner_id
       and publication.status = 'published'
      left join private.collection_publication collection_publication
        on collection_publication.collection_id = i.collection_id
       and collection_publication.owner_id = i.owner_id
      join private.owner_state state on state.owner_id = i.owner_id and state.deleting = false
      join private.public_publishers publisher on publisher.owner_id = i.owner_id
      left join private.publisher_restrictions restriction on restriction.owner_id = i.owner_id
      where i.id = p_item
        and i.visibility in ('public', 'friends')
        and coalesce(collection_publication.status, 'published') = 'published'
        and not coalesce(restriction.publishing_suspended, false)
        and not exists (
          select 1 from private.publisher_blocks block
            where block.viewer_id = p_viewer and block.publisher_id = i.owner_id
        )
        and not (i.visibility = 'public' and publisher.public_id = any(private.guest_block_ids()))
        and (
          i.visibility = 'public'
          or (
            p_viewer is not null
            and coalesce((select friends_sharing_enabled from private.social_config where singleton), false)
            and private.are_friends(p_viewer, i.owner_id)
          )
        )
  );
$$;
revoke all on function private.can_view_shared_item(uuid, uuid) from public, anon, authenticated;

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
    'likes', jsonb_build_object('count', 0, 'likedByMe', false)
  )
  from public.items i
  join public.collections collection on collection.id = i.collection_id and collection.owner_id = i.owner_id
  join private.public_publishers publisher on publisher.owner_id = i.owner_id
  left join private.collector_profiles profile on profile.owner_id = i.owner_id
  where i.id = p_item and private.can_view_shared_item(p_viewer, i.id);
$$;
revoke all on function private.shared_entry_json(uuid, uuid) from public, anon, authenticated;

create or replace function private.shared_feed_cursor(p_cursor jsonb)
returns table(created_at timestamptz, item_id uuid)
language plpgsql immutable set search_path = '' as $$
begin
  if p_cursor is null then return; end if;
  if jsonb_typeof(p_cursor) <> 'object' or jsonb_object_length(p_cursor) <> 2
    or jsonb_typeof(p_cursor->'createdAt') <> 'string' or jsonb_typeof(p_cursor->'id') <> 'string'
    or char_length(p_cursor->>'createdAt') > 64 then
    raise exception 'Invalid page.' using errcode = '22023';
  end if;
  begin
    created_at := (p_cursor->>'createdAt')::timestamptz;
    item_id := (p_cursor->>'id')::uuid;
  exception when others then
    raise exception 'Invalid page.' using errcode = '22023';
  end;
  return next;
end;
$$;
revoke all on function private.shared_feed_cursor(jsonb) from public, anon, authenticated;

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
      next_cursor := jsonb_build_object('createdAt', row.created_at, 'id', row.id);
      exit;
    end if;
    item_rows := item_rows || jsonb_build_array(private.shared_entry_json(actor, row.id));
  end loop;
  return jsonb_build_object('items', item_rows, 'nextCursor', next_cursor);
end;
$$;
revoke all on function public.list_following_entries(jsonb, boolean) from public, anon, authenticated;
grant execute on function public.list_following_entries(jsonb, boolean) to authenticated, service_role;

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
      next_cursor := jsonb_build_object('createdAt', row.created_at, 'id', row.id);
      exit;
    end if;
    item_rows := item_rows || jsonb_build_array(private.shared_entry_json(auth.uid(), row.id));
  end loop;
  return jsonb_build_object('items', item_rows, 'nextCursor', next_cursor);
end;
$$;
revoke all on function public.list_collector_entries(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.list_collector_entries(uuid, jsonb) to anon, authenticated, service_role;

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
      next_cursor := jsonb_build_object('createdAt', row.created_at, 'id', row.id);
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
revoke all on function public.get_visible_collection(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.get_visible_collection(uuid, jsonb) to anon, authenticated, service_role;

create or replace function public.get_shared_entry(p_item_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.shared_entry_json(auth.uid(), p_item_id);
$$;
revoke all on function public.get_shared_entry(uuid) from public, anon, authenticated;
grant execute on function public.get_shared_entry(uuid) to anon, authenticated, service_role;

-- Reporting needs the same authorization predicate: a caller can report a
-- Friends-only item only while they are allowed to see it. Reports retain the
-- current five-distinct-member threshold and common administrator queue.
create or replace function private.submit_member_report(p_item uuid, p_collection uuid, p_reason text, p_details text)
returns void
language plpgsql security definer set search_path = '' as $$
declare target_owner uuid; target_cycle integer; target_kind text; report_count integer; threshold integer; inserted_report boolean := false; affected_rows integer;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode = '42501'; end if;
  if (p_item is null) = (p_collection is null)
    or p_reason is null or p_reason not in ('spam', 'sexual', 'violence', 'hate', 'harassment', 'scam', 'privacy', 'other')
    or p_details is null or char_length(p_details) > 1000 then
    raise exception 'invalid report' using errcode = '22023';
  end if;
  select distinct_report_threshold into threshold from private.moderation_config where singleton = true for update;
  if p_item is not null then
    select p.owner_id, p.review_cycle, 'item' into target_owner, target_cycle, target_kind
      from private.item_publication p
      join public.items i on i.id = p.item_id and i.owner_id = p.owner_id
      left join private.collection_publication c on c.collection_id = i.collection_id and c.owner_id = i.owner_id
      where p.item_id = p_item and i.visibility in ('public', 'friends') and p.status = 'published'
        and coalesce(c.status, 'published') = 'published'
        and private.can_view_shared_item(auth.uid(), i.id)
      for update of p;
  else
    select c.owner_id, c.review_cycle, 'collection' into target_owner, target_cycle, target_kind
      from private.resolve_shared_scope(p_collection) scope
      join private.collection_publication c on c.collection_id = scope.collection_id and c.status = 'published'
      where exists (
        select 1 from public.items i
          where i.collection_id = scope.collection_id
            and (scope.category_id is null or i.category_id = scope.category_id)
            and private.can_view_shared_item(auth.uid(), i.id)
      )
      for update of c;
  end if;
  if target_owner is null or target_owner = auth.uid() then return; end if;

  insert into private.reporter_daily_limits(reporter_id, day) values (auth.uid(), current_date) on conflict do nothing;
  perform 1 from private.reporter_daily_limits where reporter_id = auth.uid() and day = current_date for update;
  if (select reports from private.reporter_daily_limits where reporter_id = auth.uid() and day = current_date) >= 10 then
    raise exception 'report limit reached for today' using errcode = '42901';
  end if;

  insert into private.public_content_reports(reporter_id, source_key, item_id, collection_id, publisher_id, reason, details, review_cycle)
    values (auth.uid(), 'member:' || auth.uid()::text, p_item, p_collection, target_owner, p_reason, btrim(p_details), target_cycle)
    on conflict do nothing;
  get diagnostics affected_rows = row_count;
  inserted_report := affected_rows > 0;
  if not inserted_report then return; end if;
  update private.reporter_daily_limits set reports = reports + 1 where reporter_id = auth.uid() and day = current_date;
  if target_kind = 'item' then
    select count(distinct reporter_id)::integer into report_count from private.public_content_reports
      where item_id = p_item and review_cycle = target_cycle and status = 'open';
  else
    select count(distinct reporter_id)::integer into report_count from private.public_content_reports
      where collection_id = p_collection and review_cycle = target_cycle and status = 'open';
  end if;
  if report_count < threshold then return; end if;
  if target_kind = 'item' then
    update private.item_publication set status = 'review', reviewed_at = now(), approved_revision = null,
      owner_message = 'Hidden from shared views after member reports. It is available for review.'
      where item_id = p_item and review_cycle = target_cycle and status = 'published';
  else
    update private.collection_publication set status = 'review', reviewed_at = now(),
      owner_message = 'Hidden from shared views after member reports. It is available for review.'
      where collection_id = p_collection and review_cycle = target_cycle and status = 'published';
  end if;
  update private.public_content_reports set status = 'triggered', reviewed_at = now()
    where (item_id = p_item or collection_id = p_collection) and review_cycle = target_cycle and status = 'open';
end;
$$;
revoke all on function private.submit_member_report(uuid, uuid, text, text) from public, anon, authenticated;

create or replace function public.get_owned_publication(p_item_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when auth.uid() is null then null else coalesce(
    (select jsonb_build_object('status', p.status, 'revision', p.revision, 'message', p.owner_message)
      from private.item_publication p join public.items i on i.id = p.item_id and i.visibility in ('public', 'friends')
      where p.item_id = p_item_id and p.owner_id = auth.uid()),
    (select jsonb_build_object('status', 'private', 'revision', null, 'message', '')
      from public.items i where i.id = p_item_id and i.owner_id = auth.uid())
  ) end;
$$;
revoke all on function public.get_owned_publication(uuid) from public, anon, authenticated;
grant execute on function public.get_owned_publication(uuid) to authenticated, service_role;

create or replace function public.list_owned_collections(p_search text default '', p_visibility text default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare collection_rows jsonb;
begin
  if auth.uid() is null or p_search is null or char_length(p_search) > 80
    or (p_visibility is not null and p_visibility not in ('private', 'friends', 'public')) then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', page.id,
      'ownerId', page.owner_id,
      'name', page.name,
      'description', page.description,
      'acquiredOn', page.acquired_on,
      'createdAt', page.created_at,
      'itemCount', page.item_count,
      'coverItemId', page.cover_item_id,
      'lastUploadedAt', page.last_uploaded_at
    ) order by coalesce(page.last_uploaded_at, page.created_at) desc, page.id desc), '[]'::jsonb)
    into collection_rows
    from (
      select c.id, c.owner_id, c.name, c.description, c.acquired_on, c.created_at,
        count(i.id)::integer as item_count,
        max(i.created_at) as last_uploaded_at,
        (
          select candidate.id from public.items candidate
          join public.item_images img on img.item_id = candidate.id and img.owner_id = candidate.owner_id
          where candidate.collection_id = c.id
            and (p_visibility is null or candidate.visibility = p_visibility)
          order by candidate.created_at desc, candidate.id desc
          limit 1
        ) as cover_item_id
      from public.collections c
      left join public.items i on i.collection_id = c.id and i.owner_id = c.owner_id
        and (p_visibility is null or i.visibility = p_visibility)
      where c.owner_id = auth.uid() and c.name ilike '%' || replace(replace(replace(p_search, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' escape E'\\'
      group by c.id, c.owner_id, c.name, c.description, c.acquired_on, c.created_at
      having p_visibility is null or count(i.id) > 0
    ) page;
  return jsonb_build_object('collections', collection_rows);
end;
$$;
revoke all on function public.list_owned_collections(text, text) from public, anon, authenticated;
grant execute on function public.list_owned_collections(text, text) to authenticated, service_role;

create index if not exists items_shared_owner_created_page
  on public.items(owner_id, created_at desc, id desc)
  where visibility in ('public', 'friends');
create index if not exists items_shared_collection_created_page
  on public.items(collection_id, created_at desc, id desc)
  where visibility in ('public', 'friends');

-- Legacy public RPCs remain a strict public-only surface. They gain additive
-- safe social fields so older clients keep working while newer cards can show
-- a collector handle without discovering private account information.
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
        'username', (select username from private.collector_profiles where owner_id = collection_row.owner_id)
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

create or replace function public.list_public_entries(p_page integer default 0)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare entry_rows jsonb; entry_total integer;
begin
  if p_page is null or p_page < 0 or p_page > 20 then return null; end if;
  select count(*) into entry_total from private.visible_public_items;
  select coalesce(jsonb_agg(private.shared_entry_json(auth.uid(), page.id) order by page.created_at desc, page.id desc), '[]'::jsonb)
    into entry_rows from (
      select i.id, i.created_at
      from private.visible_public_items i
      order by i.created_at desc, i.id desc limit 24 offset (p_page::bigint * 24)
    ) page;
  return jsonb_build_object('entries', entry_rows, 'total', entry_total, 'hasMore', p_page::bigint * 24 + jsonb_array_length(entry_rows) < entry_total);
end;
$$;
revoke all on function public.list_public_entries(integer) from public, anon, authenticated;
grant execute on function public.list_public_entries(integer) to anon, authenticated, service_role;

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
      'creator', jsonb_build_object('publisherId', page.public_id, 'username', page.username),
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

create or replace function public.get_public_topic(p_topic_key text, p_page integer default 0)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare topic_name text; entry_rows jsonb; entry_total integer;
begin
  if p_topic_key is null or char_length(p_topic_key) not between 1 and 160 or p_page is null or p_page < 0 or p_page > 20 then return null; end if;
  select (array_agg(c.name order by char_length(c.name), c.name))[1] into topic_name
    from public.collections c join private.visible_public_items i on i.collection_id = c.id and i.owner_id = c.owner_id
    where private.collection_topic_key(c.name) = p_topic_key;
  if topic_name is null then return null; end if;
  select count(*) into entry_total
    from private.visible_public_items i join public.collections c on c.id = i.collection_id and c.owner_id = i.owner_id
    where private.collection_topic_key(c.name) = p_topic_key;
  select coalesce(jsonb_agg(private.shared_entry_json(auth.uid(), page.id) order by page.created_at desc, page.id desc), '[]'::jsonb)
    into entry_rows from (
      select i.id, i.created_at
      from private.visible_public_items i join public.collections c on c.id = i.collection_id and c.owner_id = i.owner_id
      where private.collection_topic_key(c.name) = p_topic_key
      order by i.created_at desc, i.id desc offset p_page * 24 limit 24
    ) page;
  return jsonb_build_object('topic', jsonb_build_object('key', p_topic_key, 'name', topic_name), 'entries', entry_rows, 'total', entry_total, 'hasMore', entry_total > (p_page + 1) * 24);
end;
$$;
revoke all on function public.get_public_topic(text, integer) from public, anon, authenticated;
grant execute on function public.get_public_topic(text, integer) to anon, authenticated, service_role;

commit;
