begin;

-- Rename in place: all identities, image rows, and R2 keys remain unchanged.
alter table public.pins rename to items;
alter table public.pin_images rename to item_images;
alter table public.item_images rename column pin_id to item_id;
alter table private.media_inventory rename column pin_id to item_id;
alter table private.owner_state rename column pins_count to items_count;

alter table private.owner_state add column categories_count integer not null default 0
  check (categories_count between 0 and 20);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (id, owner_id)
);
create index categories_owner_page on public.categories(owner_id, created_at, id);

-- The old collection rows gain the owner's starter category before NOT NULL.
insert into public.categories(owner_id, name)
  select id, 'Pins' from auth.users;
alter table public.collections add column category_id uuid;
update public.collections c set category_id = k.id
  from public.categories k where k.owner_id = c.owner_id and k.name = 'Pins';
alter table public.collections alter column category_id set not null;
alter table public.collections add constraint collections_category_owner_fkey
  foreign key (category_id, owner_id) references public.categories(id, owner_id)
  on delete no action deferrable initially deferred;
create index collections_category_page on public.collections(owner_id, category_id, created_at desc, id desc);

-- Auth's account cascade may delete a category before its collections. The
-- deferred NO ACTION check allows the whole cascade, but rejects a direct
-- deletion of a category that still has collections at transaction commit.
create function private.provision_starter_category() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.categories(owner_id, name) values (NEW.id, 'Pins');
  return NEW;
end;
$$;
revoke all on function private.provision_starter_category() from public, anon, authenticated;
create trigger provision_starter_category after insert on auth.users
  for each row execute function private.provision_starter_category();

-- Direct client deletion must take owner -> category locks in the same order
-- as edits and media operations, and respect the account-deletion freeze.
create trigger lock_categories_statement before insert or update or delete on public.categories
  for each statement execute function private.lock_metadata_statement();

create or replace function private.guard_metadata() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  account_deleting boolean;
  target_owner uuid;
begin
  if TG_OP = 'DELETE' then
    if TG_TABLE_NAME = 'collections' then
      update private.owner_state set collections_count = collections_count - 1 where owner_id = OLD.owner_id;
    elsif TG_TABLE_NAME = 'items' then
      update private.owner_state set items_count = items_count - 1 where owner_id = OLD.owner_id;
    else
      update private.owner_state set categories_count = categories_count - 1 where owner_id = OLD.owner_id;
    end if;
    return OLD;
  end if;

  target_owner := NEW.owner_id;
  if TG_OP = 'UPDATE' and (NEW.owner_id <> OLD.owner_id or NEW.id <> OLD.id) then
    raise exception 'ownership and identity are immutable' using errcode = '23514';
  end if;
  insert into private.owner_state(owner_id) values (target_owner) on conflict do nothing;
  select deleting into account_deleting from private.owner_state where owner_id = target_owner for update;
  if account_deleting then
    raise exception 'account deletion is in progress' using errcode = '23514';
  end if;
  if TG_OP = 'INSERT' then
    if TG_TABLE_NAME = 'collections' then
      update private.owner_state set collections_count = collections_count + 1
        where owner_id = target_owner and collections_count < 50;
      if not FOUND then raise exception 'collection limit reached (50)' using errcode = '23514'; end if;
    elsif TG_TABLE_NAME = 'items' then
      if exists(select 1 from private.media_inventory where item_id = NEW.id) then
        raise exception 'retired item identity cannot be reused' using errcode = '23514';
      end if;
      update private.owner_state set items_count = items_count + 1
        where owner_id = target_owner and items_count < 500;
      if not FOUND then raise exception 'item limit reached (500)' using errcode = '23514'; end if;
    else
      update private.owner_state set categories_count = categories_count + 1
        where owner_id = target_owner and categories_count < 20;
      if not FOUND then raise exception 'category limit reached (20)' using errcode = '23514'; end if;
    end if;
  end if;
  if TG_TABLE_NAME = 'items' then NEW.updated_at := now(); end if;
  return NEW;
end;
$$;
create trigger guard_categories before insert or update or delete on public.categories
  for each row execute function private.guard_metadata();

-- Starter rows were inserted before the new category trigger existed.
insert into private.owner_state(owner_id)
  select id from auth.users on conflict do nothing;
update private.owner_state s set categories_count =
  (select count(*) from public.categories c where c.owner_id = s.owner_id);

alter table public.categories enable row level security;
create policy categories_read on public.categories for select to authenticated using ((select auth.uid()) = owner_id);
create policy categories_insert on public.categories for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy categories_update on public.categories for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy categories_delete on public.categories for delete to authenticated using ((select auth.uid()) = owner_id);
revoke all on public.categories from public, anon, authenticated;
grant select on public.categories to authenticated;
grant insert (id, owner_id, name) on public.categories to authenticated;
grant update (name) on public.categories to authenticated;
grant delete on public.categories to authenticated;
grant all on public.categories to service_role;

-- Replace column grants, keeping ownership and identity immutable for clients.
grant insert (category_id) on public.collections to authenticated;
grant update (category_id) on public.collections to authenticated;

commit;
