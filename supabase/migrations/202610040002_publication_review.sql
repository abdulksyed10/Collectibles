begin;
create table private.public_publishers (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  public_id uuid not null unique default gen_random_uuid()
);
revoke all on private.public_publishers from public, anon, authenticated;
insert into private.public_publishers(owner_id) select id from auth.users;
create function private.create_public_publisher() returns trigger
language plpgsql security definer set search_path = '' as $$
begin insert into private.public_publishers(owner_id) values (new.id); return new; end; $$;
revoke all on function private.create_public_publisher() from public, anon, authenticated;
create trigger create_public_publisher after insert on auth.users for each row execute function private.create_public_publisher();
create function private.public_publisher_id(p_owner uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select public_id from private.public_publishers where owner_id = p_owner;
$$;
revoke all on function private.public_publisher_id(uuid) from public, anon, authenticated;


-- Public visibility is an owner's intent. A separate review state determines
-- whether an entry can appear in Explore, a shared collection, or public-media.
-- Existing public entries intentionally start pending rather than being
-- grandfathered into the moderated surface.
create table private.item_publication (
  item_id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  revision integer not null default 1 check (revision > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'removed')),
  approved_revision integer check (approved_revision is null or approved_revision > 0),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  owner_message text not null default '' check (char_length(owner_message) <= 280),
  foreign key (item_id, owner_id) references public.items(id, owner_id) on delete cascade
);

create table private.publisher_restrictions (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  publishing_suspended boolean not null default false,
  updated_at timestamptz not null default now()
);

create table private.moderation_audit (
  id bigint generated always as identity primary key,
  item_id uuid not null,
  owner_id uuid not null,
  revision integer not null,
  action text not null check (action in ('submitted', 'approved', 'rejected', 'removed', 'suspended')),
  actor_label text not null default 'operator' check (char_length(actor_label) between 1 and 80),
  created_at timestamptz not null default now()
);

revoke all on private.item_publication, private.publisher_restrictions, private.moderation_audit from public, anon, authenticated;

insert into private.item_publication(item_id, owner_id, status, owner_message)
  select i.id, i.owner_id, 'pending', 'This entry needs review before it can appear in Explore.'
  from public.items i
  where i.visibility = 'public'
on conflict (item_id) do nothing;

insert into private.publisher_restrictions(owner_id)
  select id from auth.users on conflict do nothing;

create or replace function private.queue_publication(p_item_id uuid, p_owner_id uuid, p_message text default 'This entry needs review before it can appear in Explore.')
returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into private.item_publication(item_id, owner_id, revision, status, approved_revision, submitted_at, reviewed_at, owner_message)
    values (p_item_id, p_owner_id, 1, 'pending', null, now(), null, left(p_message, 280))
  on conflict (item_id) do update set
    revision = private.item_publication.revision + 1,
    status = 'pending',
    approved_revision = null,
    submitted_at = now(),
    reviewed_at = null,
    owner_message = excluded.owner_message;
  insert into private.moderation_audit(item_id, owner_id, revision, action)
    select item_id, owner_id, revision, 'submitted' from private.item_publication where item_id = p_item_id;
end;
$$;
revoke all on function private.queue_publication(uuid, uuid, text) from public, anon, authenticated;

create or replace function private.queue_item_publication_trigger()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.visibility <> 'public' then return new; end if;
  if tg_op = 'INSERT' or old.visibility <> 'public'
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
      from public.items i where i.collection_id = new.id and i.owner_id = new.owner_id and i.visibility = 'public';
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
  if found and item_row.visibility = 'public' then
    perform private.queue_publication(item_row.id, item_row.owner_id, 'This entry needs review after its photo changed.');
  end if;
  return new;
end;
$$;
revoke all on function private.queue_image_publication_trigger() from public, anon, authenticated;

drop trigger if exists queue_publication_on_item on public.items;
create trigger queue_publication_on_item after insert or update of visibility, title, collection_id on public.items
  for each row execute function private.queue_item_publication_trigger();
drop trigger if exists queue_publication_on_collection on public.collections;
create trigger queue_publication_on_collection after update of name on public.collections
  for each row execute function private.queue_collection_publication_trigger();
drop trigger if exists queue_publication_on_image on public.item_images;
create trigger queue_publication_on_image after insert on public.item_images
  for each row execute function private.queue_image_publication_trigger();

-- This private projection is the single public-eligibility predicate. It is
-- used by every metadata route and by the image proxy below.
create or replace view private.visible_public_items as
  select i.*
    from public.items i
    join private.item_publication p on p.item_id = i.id and p.owner_id = i.owner_id
      and p.status = 'approved' and p.approved_revision = p.revision
    join private.owner_state state on state.owner_id = i.owner_id and state.deleting = false
    left join private.publisher_restrictions restriction on restriction.owner_id = i.owner_id
    where i.visibility = 'public' and coalesce(restriction.publishing_suspended, false) = false;
revoke all on private.visible_public_items from public, anon, authenticated;

create or replace function private.resolve_public_image(p_collection_id uuid, p_item_id uuid)
returns table(full_key text, thumb_key text)
language sql stable security definer set search_path = '' as $$
  select img.full_key, img.thumb_key
    from private.resolve_shared_scope(p_collection_id) scope
    join private.visible_public_items i on i.collection_id = scope.collection_id
      and (scope.category_id is null or i.category_id = scope.category_id)
    join public.item_images img on img.item_id = i.id and img.owner_id = i.owner_id
    where i.id = p_item_id
    limit 1;
$$;
revoke all on function private.resolve_public_image(uuid, uuid) from public, anon, authenticated;
grant execute on function private.resolve_public_image(uuid, uuid) to service_role;

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
  select coalesce(jsonb_agg(jsonb_build_object('id', page.id, 'title', page.title, 'hasPhoto', page.has_photo, 'publisherId', private.public_publisher_id(page.owner_id), 'categoryId', null, 'categoryName', null) order by page.created_at desc, page.id desc), '[]'::jsonb)
    into item_rows from (
      select i.id, i.owner_id, i.title, i.created_at, exists(select 1 from public.item_images img where img.item_id = i.id and img.owner_id = i.owner_id) as has_photo
      from private.visible_public_items i where i.collection_id = scope.collection_id and (scope.category_id is null or i.category_id = scope.category_id)
      order by i.created_at desc, i.id desc limit 24 offset (p_page::bigint * 24)
    ) page;
  return jsonb_build_object('collection', jsonb_build_object('id', collection_row.id, 'name', collection_row.name, 'publisherId', private.public_publisher_id(collection_row.owner_id)), 'scope', jsonb_build_object('collectionId', scope.collection_id, 'categoryId', scope.category_id), 'categories', '[]'::jsonb, 'items', item_rows, 'total', item_total, 'hasMore', p_page::bigint * 24 + jsonb_array_length(item_rows) < item_total);
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
  select coalesce(jsonb_agg(jsonb_build_object('id', page.id, 'title', page.title, 'hasPhoto', page.has_photo, 'collectionId', page.collection_id, 'collectionName', page.collection_name, 'publisherId', private.public_publisher_id(page.owner_id)) order by page.created_at desc, page.id desc), '[]'::jsonb)
    into entry_rows from (
      select i.id, i.owner_id, i.title, i.collection_id, c.name as collection_name, i.created_at, exists(select 1 from public.item_images img where img.item_id = i.id and img.owner_id = i.owner_id) as has_photo
      from private.visible_public_items i join public.collections c on c.id = i.collection_id and c.owner_id = i.owner_id
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
  select coalesce(jsonb_agg(jsonb_build_object('id', page.id, 'name', page.name, 'itemCount', page.item_count, 'coverItemId', page.cover_item_id, 'publisherId', private.public_publisher_id(page.owner_id), 'isOwner', coalesce((select auth.uid()) = page.owner_id, false)) order by page.last_uploaded_at desc, page.id desc), '[]'::jsonb)
    into collection_rows from (
      select c.id, c.owner_id, c.name, max(i.created_at) as last_uploaded_at, count(i.id)::integer as item_count,
        (array_agg(i.id order by i.created_at desc, i.id desc) filter (where exists(select 1 from public.item_images img where img.item_id = i.id and img.owner_id = i.owner_id)))[1] as cover_item_id
      from public.collections c join private.visible_public_items i on i.collection_id = c.id and i.owner_id = c.owner_id
      group by c.id, c.owner_id, c.name order by max(i.created_at) desc, c.id desc limit 24 offset (p_page::bigint * 24)
    ) page;
  return jsonb_build_object('collections', collection_rows, 'total', collection_total, 'hasMore', collection_total > (p_page + 1) * 24);
end;
$$;
revoke all on function public.list_public_collections(integer) from public, anon, authenticated;
grant execute on function public.list_public_collections(integer) to anon, authenticated, service_role;

create or replace function public.list_public_topics(p_page integer default 0)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare topic_rows jsonb; topic_total integer;
begin
  if p_page is null or p_page < 0 or p_page > 20 then return jsonb_build_object('topics', '[]'::jsonb, 'total', 0, 'hasMore', false); end if;
  with members as (
    select c.id as collection_id, c.name, private.collection_topic_key(c.name) as topic_key,
      count(i.id)::integer as item_count, max(i.created_at) as last_uploaded_at,
      (array_agg(i.id order by i.created_at desc, i.id desc) filter (where exists(select 1 from public.item_images img where img.item_id = i.id and img.owner_id = i.owner_id)))[1] as cover_item_id
    from public.collections c join private.visible_public_items i on i.collection_id = c.id and i.owner_id = c.owner_id
    group by c.id, c.name
  ), grouped as (
    select topic_key, (array_agg(name order by char_length(name), name))[1] as name, sum(item_count)::integer as item_count, count(*)::integer as collection_count,
      (array_agg(cover_item_id order by last_uploaded_at desc nulls last, collection_id desc))[1] as cover_item_id,
      (array_agg(collection_id order by last_uploaded_at desc nulls last, collection_id desc))[1] as cover_collection_id, max(last_uploaded_at) as last_uploaded_at
    from members group by topic_key
  ) select count(*) into topic_total from grouped;
  with members as (
    select c.id as collection_id, c.name, private.collection_topic_key(c.name) as topic_key,
      count(i.id)::integer as item_count, max(i.created_at) as last_uploaded_at,
      (array_agg(i.id order by i.created_at desc, i.id desc) filter (where exists(select 1 from public.item_images img where img.item_id = i.id and img.owner_id = i.owner_id)))[1] as cover_item_id
    from public.collections c join private.visible_public_items i on i.collection_id = c.id and i.owner_id = c.owner_id
    group by c.id, c.name
  ), grouped as (
    select topic_key, (array_agg(name order by char_length(name), name))[1] as name, sum(item_count)::integer as item_count, count(*)::integer as collection_count,
      (array_agg(cover_item_id order by last_uploaded_at desc nulls last, collection_id desc))[1] as cover_item_id,
      (array_agg(collection_id order by last_uploaded_at desc nulls last, collection_id desc))[1] as cover_collection_id, max(last_uploaded_at) as last_uploaded_at
    from members group by topic_key
  ) select coalesce(jsonb_agg(jsonb_build_object('key', topic_key, 'name', name, 'itemCount', item_count, 'collectionCount', collection_count, 'coverItemId', cover_item_id, 'coverCollectionId', cover_collection_id) order by last_uploaded_at desc nulls last, topic_key desc), '[]'::jsonb)
    into topic_rows from (select * from grouped order by last_uploaded_at desc nulls last, topic_key desc offset p_page * 24 limit 24) page;
  return jsonb_build_object('topics', topic_rows, 'total', topic_total, 'hasMore', topic_total > (p_page + 1) * 24);
end;
$$;
revoke all on function public.list_public_topics(integer) from public, anon, authenticated;
grant execute on function public.list_public_topics(integer) to anon, authenticated, service_role;

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
  select count(*) into entry_total from private.visible_public_items i join public.collections c on c.id = i.collection_id and c.owner_id = i.owner_id where private.collection_topic_key(c.name) = p_topic_key;
  select coalesce(jsonb_agg(jsonb_build_object('id', page.id, 'title', page.title, 'hasPhoto', page.has_photo, 'collectionId', page.collection_id, 'collectionName', page.collection_name, 'publisherId', private.public_publisher_id(page.owner_id)) order by page.created_at desc, page.id desc), '[]'::jsonb) into entry_rows from (
    select i.id, i.owner_id, i.title, i.created_at, i.collection_id, c.name as collection_name, exists(select 1 from public.item_images img where img.item_id = i.id and img.owner_id = i.owner_id) as has_photo
    from private.visible_public_items i join public.collections c on c.id = i.collection_id and c.owner_id = i.owner_id
    where private.collection_topic_key(c.name) = p_topic_key order by i.created_at desc, i.id desc offset p_page * 24 limit 24
  ) page;
  return jsonb_build_object('topic', jsonb_build_object('key', p_topic_key, 'name', topic_name), 'entries', entry_rows, 'total', entry_total, 'hasMore', entry_total > (p_page + 1) * 24);
end;
$$;
revoke all on function public.get_public_topic(text, integer) from public, anon, authenticated;
grant execute on function public.get_public_topic(text, integer) to anon, authenticated, service_role;

-- Only a database operator may move the exact currently pending revision to a
-- public state. This procedure is deliberately not granted to app roles.
create or replace function private.review_publication(p_item_id uuid, p_revision integer, p_status text, p_owner_message text default '')
returns void
language plpgsql security invoker set search_path = '' as $$
declare publication private.item_publication%rowtype;
begin
  if p_status is null or p_revision is null or p_status not in ('approved', 'rejected', 'removed') then
    raise exception 'operator access required' using errcode = '42501';
  end if;
  select * into publication from private.item_publication where item_id = p_item_id for update;
  if not found or publication.revision <> p_revision then raise exception 'publication revision changed' using errcode = '40001'; end if;
  if p_status = 'approved' and not exists (select 1 from public.items where id=p_item_id and visibility='public') then raise exception 'entry is private' using errcode='23514'; end if;
  update private.item_publication set status = p_status, approved_revision = case when p_status = 'approved' then revision else null end, reviewed_at = now(), owner_message = left(coalesce(p_owner_message, ''), 280) where item_id = p_item_id;
  insert into private.moderation_audit(item_id, owner_id, revision, action) values (publication.item_id, publication.owner_id, publication.revision, p_status);
end;
$$;
revoke all on function private.review_publication(uuid, integer, text, text) from public, anon, authenticated;

create or replace function public.get_owned_publication(p_item_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when auth.uid() is null then null else coalesce(
    (select jsonb_build_object('status', p.status, 'revision', p.revision, 'message', p.owner_message) from private.item_publication p join public.items i on i.id=p.item_id and i.visibility='public' where p.item_id = p_item_id and p.owner_id = auth.uid()),
    (select jsonb_build_object('status', 'private', 'revision', null, 'message', '') from public.items i where i.id = p_item_id and i.owner_id = auth.uid())
  ) end;
$$;
revoke all on function public.get_owned_publication(uuid) from public, anon, authenticated;
grant execute on function public.get_owned_publication(uuid) to authenticated, service_role;

create or replace function public.list_owned_publications(p_item_ids uuid[])
returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when auth.uid() is null or p_item_ids is null or cardinality(p_item_ids) > 24 then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object('itemId', i.id, 'status', case when i.visibility='private' then 'private' else coalesce(p.status, 'pending') end, 'message', case when i.visibility='private' then '' else coalesce(p.owner_message, '') end))
      from public.items i left join private.item_publication p on p.item_id = i.id and p.owner_id = i.owner_id
      where i.owner_id = auth.uid() and i.id = any(p_item_ids)
  ), '[]'::jsonb) end;
$$;
revoke all on function public.list_owned_publications(uuid[]) from public, anon, authenticated;
grant execute on function public.list_owned_publications(uuid[]) to authenticated, service_role;

create index item_publication_public_index on private.item_publication(item_id, owner_id) where status = 'approved';
create index moderation_audit_item_created on private.moderation_audit(item_id, created_at desc);

commit;
