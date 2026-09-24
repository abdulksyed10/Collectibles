begin;

-- No metadata or media mutation may interleave with this ownership-preserving
-- reshape. The previous bridge remains callable until this transaction
-- replaces its body at the end.
lock table public.items, public.collections, public.categories, public.item_images,
  private.owner_state in access exclusive mode;

-- The old grouping tables remain as private migration snapshots. Item/image
-- IDs and R2 keys are never copied or rewritten.
do $$
declare item_fk text;
begin
  for item_fk in
    select conname
    from pg_constraint
    where conrelid = 'public.items'::regclass and contype = 'f'
  loop
    execute format('alter table public.items drop constraint %I', item_fk);
  end loop;
end;
$$;

alter table public.collections rename to collection_first_legacy_collections;
alter table public.categories rename to collection_first_legacy_categories;
alter table public.items disable trigger user;

create table private.collection_first_category_map (
  old_category_id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  collection_id uuid not null unique,
  created_at timestamptz not null default now()
);

-- Old collection IDs remain reserved as legacy share IDs. A category that
-- happens to have the same UUID is promoted to a fresh collection UUID.
insert into private.collection_first_category_map(old_category_id, owner_id, collection_id)
  select k.id, k.owner_id,
    case when exists (
      select 1 from public.collection_first_legacy_collections c where c.id = k.id
    ) then gen_random_uuid() else k.id end
  from public.collection_first_legacy_categories k;

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500),
  acquired_on date default current_date check (acquired_on is null or acquired_on between date '0001-01-01' and date '9999-12-31'),
  created_at timestamptz not null default now(),
  unique (id, owner_id)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  collection_id uuid not null,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500),
  acquired_on date check (acquired_on is null or acquired_on between date '0001-01-01' and date '9999-12-31'),
  created_at timestamptz not null default now(),
  unique (id, owner_id),
  unique (id, collection_id, owner_id),
  foreign key (collection_id, owner_id) references public.collections(id, owner_id) on delete cascade
);

insert into public.collections(id, owner_id, name, description, acquired_on, created_at)
  select m.collection_id, k.owner_id, k.name, '', null, k.created_at
  from public.collection_first_legacy_categories k
  join private.collection_first_category_map m on m.old_category_id = k.id and m.owner_id = k.owner_id;

insert into public.categories(id, owner_id, collection_id, name, description, acquired_on, created_at)
  select c.id, c.owner_id, m.collection_id, c.name, c.description, c.acquired_on, c.created_at
  from public.collection_first_legacy_collections c
  join private.collection_first_category_map m on m.old_category_id = c.category_id and m.owner_id = c.owner_id;

alter table public.items
  add column category_id uuid,
  add column visibility text not null default 'private'
    check (visibility in ('private', 'public'));

update public.items i
  set collection_id = m.collection_id,
      category_id = c.id,
      visibility = c.visibility
  from public.collection_first_legacy_collections c
  join private.collection_first_category_map m on m.old_category_id = c.category_id and m.owner_id = c.owner_id
  where i.collection_id = c.id and i.owner_id = c.owner_id;

alter table public.items
  add constraint items_collection_owner_fkey
    foreign key (collection_id, owner_id) references public.collections(id, owner_id) on delete cascade,
  add constraint items_category_scope_fkey
    foreign key (category_id, collection_id, owner_id)
    references public.categories(id, collection_id, owner_id)
    on delete no action deferrable initially deferred;

create table private.legacy_collection_shares (
  legacy_collection_id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  collection_id uuid not null,
  category_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (collection_id, owner_id) references public.collections(id, owner_id) on delete cascade,
  foreign key (category_id, collection_id, owner_id)
    references public.categories(id, collection_id, owner_id) on delete cascade
);

insert into private.legacy_collection_shares(legacy_collection_id, owner_id, collection_id, category_id)
  select c.id, c.owner_id, m.collection_id, c.id
  from public.collection_first_legacy_collections c
  join private.collection_first_category_map m on m.old_category_id = c.category_id and m.owner_id = c.owner_id;

-- The old public parent state becomes the item's one-time state. The old
-- collection identity continues only as a category-scoped link alias.
create or replace function private.resolve_shared_scope(p_collection_id uuid)
returns table(collection_id uuid, category_id uuid)
language sql stable security definer set search_path = '' as $$
  select c.id, null::uuid
    from public.collections c
    join private.owner_state s on s.owner_id = c.owner_id and s.deleting = false
    where c.id = p_collection_id
  union all
  select l.collection_id, l.category_id
    from private.legacy_collection_shares l
    join private.owner_state s on s.owner_id = l.owner_id and s.deleting = false
    where l.legacy_collection_id = p_collection_id;
$$;
revoke all on function private.resolve_shared_scope(uuid) from public, anon, authenticated;
grant execute on function private.resolve_shared_scope(uuid) to service_role;

create or replace function private.resolve_public_image(p_collection_id uuid, p_item_id uuid)
returns table(full_key text, thumb_key text)
language sql stable security definer set search_path = '' as $$
  select img.full_key, img.thumb_key
    from private.resolve_shared_scope(p_collection_id) scope
    join public.items i on i.collection_id = scope.collection_id
      and (scope.category_id is null or i.category_id = scope.category_id)
    join public.collections c on c.id = i.collection_id and c.owner_id = i.owner_id
    join private.owner_state s on s.owner_id = i.owner_id and s.deleting = false
    join public.item_images img on img.item_id = i.id and img.owner_id = i.owner_id
    where i.id = p_item_id and i.visibility = 'public'
    limit 1;
$$;
revoke all on function private.resolve_public_image(uuid, uuid) from public, anon, authenticated;
grant execute on function private.resolve_public_image(uuid, uuid) to service_role;

create or replace function public.get_shared_collection(p_collection_id uuid, p_page integer default 0)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  scope record;
  shared_collection record;
  item_rows jsonb;
  category_rows jsonb;
  item_total integer;
begin
  if p_collection_id is null or p_page is null or p_page < 0 or p_page > 20 then return null; end if;
  select * into scope from private.resolve_shared_scope(p_collection_id) limit 1;
  if not found then return null; end if;

  select c.id, c.name into shared_collection
    from public.collections c
    join private.owner_state s on s.owner_id = c.owner_id and s.deleting = false
    where c.id = scope.collection_id
      and exists (
        select 1 from public.items i
        where i.collection_id = c.id and i.visibility = 'public'
          and (scope.category_id is null or i.category_id = scope.category_id)
      );
  if not found then return null; end if;

  select count(*) into item_total
    from public.items i
    where i.collection_id = scope.collection_id and i.visibility = 'public'
      and (scope.category_id is null or i.category_id = scope.category_id);

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', page.id,
      'title', page.title,
      'hasPhoto', page.has_photo,
      'categoryId', page.category_id,
      'categoryName', page.category_name
    ) order by page.created_at desc, page.id desc), '[]'::jsonb)
    into item_rows
    from (
      select i.id, i.title, i.category_id, k.name as category_name, i.created_at,
        exists(select 1 from public.item_images img where img.item_id = i.id and img.owner_id = i.owner_id) as has_photo
      from public.items i
      left join public.categories k on k.id = i.category_id and k.collection_id = i.collection_id and k.owner_id = i.owner_id
      where i.collection_id = scope.collection_id and i.visibility = 'public'
        and (scope.category_id is null or i.category_id = scope.category_id)
      order by i.created_at desc, i.id desc
      limit 24 offset (p_page::bigint * 24)
    ) page;

  select coalesce(jsonb_agg(jsonb_build_object('id', page.id, 'name', page.name) order by page.created_at, page.id), '[]'::jsonb)
    into category_rows
    from (
      select distinct k.id, k.name, k.created_at
      from public.categories k
      join public.items i on i.category_id = k.id and i.collection_id = k.collection_id and i.owner_id = k.owner_id
      where k.collection_id = scope.collection_id and i.visibility = 'public'
        and (scope.category_id is null or k.id = scope.category_id)
    ) page;

  return jsonb_build_object(
    'collection', jsonb_build_object('id', shared_collection.id, 'name', shared_collection.name),
    'scope', jsonb_build_object('collectionId', scope.collection_id, 'categoryId', scope.category_id),
    'categories', category_rows,
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
declare
  collection_rows jsonb;
  collection_total integer;
begin
  if p_page is null or p_page < 0 or p_page > 20 then return null; end if;

  select count(*) into collection_total
    from public.collections c
    join private.owner_state s on s.owner_id = c.owner_id and s.deleting = false
    where exists (select 1 from public.items i where i.collection_id = c.id and i.visibility = 'public');

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', page.id,
      'name', page.name,
      'itemCount', page.item_count,
      'coverItemId', page.cover_item_id,
      'isOwner', coalesce((select auth.uid()) = page.owner_id, false)
    ) order by page.last_uploaded_at desc, page.id desc), '[]'::jsonb)
    into collection_rows
    from (
      select c.id, c.owner_id, c.name, max(i.created_at) as last_uploaded_at, count(i.id)::integer as item_count,
        (
          select visible.id from public.items visible
          join public.item_images img on img.item_id = visible.id and img.owner_id = visible.owner_id
          where visible.collection_id = c.id and visible.visibility = 'public'
          order by visible.created_at desc, visible.id desc
          limit 1
        ) as cover_item_id
      from public.collections c
      join private.owner_state s on s.owner_id = c.owner_id and s.deleting = false
      join public.items i on i.collection_id = c.id and i.owner_id = c.owner_id and i.visibility = 'public'
      group by c.id, c.owner_id, c.name
      order by max(i.created_at) desc, c.id desc
      limit 24 offset (p_page::bigint * 24)
    ) page;

  return jsonb_build_object(
    'collections', collection_rows,
    'total', collection_total,
    'hasMore', p_page::bigint * 24 + jsonb_array_length(collection_rows) < collection_total
  );
end;
$$;
revoke all on function public.list_public_collections(integer) from public, anon, authenticated;
grant execute on function public.list_public_collections(integer) to anon, authenticated, service_role;

create function public.list_owned_collections(p_search text default '', p_visibility text default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare collection_rows jsonb;
begin
  if auth.uid() is null or p_search is null or char_length(p_search) > 80
    or (p_visibility is not null and p_visibility not in ('private', 'public')) then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', page.id,
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
      select c.id, c.name, c.description, c.acquired_on, c.created_at,
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
      where c.owner_id = auth.uid() and c.name ilike '%' || replace(replace(replace(p_search, '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' escape '\\'
      group by c.id, c.name, c.description, c.acquired_on, c.created_at
    ) page;
  return jsonb_build_object('collections', collection_rows);
end;
$$;
revoke all on function public.list_owned_collections(text, text) from public, anon, authenticated;
grant execute on function public.list_owned_collections(text, text) to authenticated, service_role;

-- Direct category deletion would violate the deferred item/category foreign
-- key. This owner-locked RPC detaches entries first, preserving their photos
-- and visibility, then removes just the category.
create function public.delete_category(p_category_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare target_category record;
declare deleting_now boolean;
begin
  if auth.uid() is null or p_category_id is null then return; end if;
  select c.id, c.owner_id into target_category
    from public.categories c where c.id = p_category_id and c.owner_id = auth.uid() for update;
  if not found then return; end if;
  select deleting into deleting_now from private.owner_state where owner_id = target_category.owner_id for update;
  if deleting_now then raise exception 'account deletion is in progress' using errcode = '23514'; end if;
  update public.items set category_id = null where category_id = target_category.id and owner_id = target_category.owner_id;
  delete from public.categories where id = target_category.id and owner_id = target_category.owner_id;
end;
$$;
revoke all on function public.delete_category(uuid) from public, anon, authenticated;
grant execute on function public.delete_category(uuid) to authenticated, service_role;

create function private.guard_legacy_collection_id() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from private.legacy_collection_shares where legacy_collection_id = NEW.id) then
    raise exception 'collection identity unavailable' using errcode = '23514';
  end if;
  return NEW;
end;
$$;
revoke all on function private.guard_legacy_collection_id() from public, anon, authenticated;

-- Collections/categories start with correct counters, then resume the same
-- owner-lock and immutable-identity guards used by items.
alter table private.owner_state drop constraint if exists owner_state_categories_count_check;
alter table private.owner_state add constraint owner_state_categories_count_check
  check (categories_count between 0 and 50);
insert into private.owner_state(owner_id)
  select id from auth.users on conflict do nothing;
update private.owner_state s set
  collections_count = (select count(*) from public.collections c where c.owner_id = s.owner_id),
  categories_count = (select count(*) from public.categories c where c.owner_id = s.owner_id),
  items_count = (select count(*) from public.items i where i.owner_id = s.owner_id);

create trigger lock_collections_statement before insert or update on public.collections
  for each statement execute function private.lock_metadata_statement();
create trigger guard_collections before insert or update or delete on public.collections
  for each row execute function private.guard_metadata();
create trigger guard_legacy_collection_id before insert on public.collections
  for each row execute function private.guard_legacy_collection_id();
create trigger lock_categories_statement before insert or update or delete on public.categories
  for each statement execute function private.lock_metadata_statement();
create trigger guard_categories before insert or update or delete on public.categories
  for each row execute function private.guard_metadata();
alter table public.items enable trigger user;

alter table public.collections enable row level security;
alter table public.categories enable row level security;
create policy collections_read on public.collections for select to authenticated using ((select auth.uid()) = owner_id);
create policy collections_insert on public.collections for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy collections_update on public.collections for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy categories_read on public.categories for select to authenticated using ((select auth.uid()) = owner_id);
create policy categories_insert on public.categories for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy categories_update on public.categories for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

revoke all on public.collections, public.categories from public, anon, authenticated;
grant select on public.collections, public.categories to authenticated;
grant insert (name, description, acquired_on) on public.collections to authenticated;
grant update (name, description, acquired_on) on public.collections to authenticated;
grant insert (collection_id, name, description, acquired_on) on public.categories to authenticated;
grant update (name, description, acquired_on) on public.categories to authenticated;
grant insert (category_id, visibility) on public.items to authenticated;
grant update (collection_id, category_id, title, notes, visibility) on public.items to authenticated;
grant all on public.collections, public.categories to service_role;

drop index if exists public.collections_owner_page;
drop index if exists public.collections_category_page;
drop index if exists public.collections_public_catalog_page;
drop index if exists public.categories_owner_page;
drop index if exists public.items_owner_page;
drop index if exists public.items_collection_page;
drop index if exists public.items_collection_catalog;
drop index if exists public.pins_owner_page;
drop index if exists public.pins_collection_page;
create index collections_owner_page on public.collections(owner_id, created_at desc, id desc);
create index categories_collection_page on public.categories(owner_id, collection_id, created_at, id);
create index items_collection_page on public.items(owner_id, collection_id, created_at desc, id desc);
create index items_category_page on public.items(owner_id, collection_id, category_id, created_at desc, id desc);
create index items_public_collection_page on public.items(collection_id, created_at desc, id desc) where visibility = 'public';

drop trigger if exists provision_starter_category on auth.users;
drop function if exists private.provision_starter_category();

alter table public.collection_first_legacy_collections set schema private;
alter table public.collection_first_legacy_categories set schema private;
revoke all on private.collection_first_legacy_collections, private.collection_first_legacy_categories,
  private.collection_first_category_map, private.legacy_collection_shares from public, anon, authenticated;

commit;
