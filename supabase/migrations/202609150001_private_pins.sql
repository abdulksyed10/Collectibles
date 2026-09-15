begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.owner_state (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  collections_count integer not null default 0 check (collections_count between 0 and 50),
  pins_count integer not null default 0 check (pins_count between 0 and 500),
  deleting boolean not null default false
);

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500),
  created_at timestamptz not null default now(),
  unique (id, owner_id)
);

create table public.pins (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  collection_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  notes text not null default '' check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (collection_id, owner_id) references public.collections(id, owner_id) on delete cascade
);

create table public.pin_images (
  id uuid primary key default gen_random_uuid(),
  pin_id uuid not null unique,
  owner_id uuid not null default auth.uid(),
  full_key text not null unique,
  thumb_key text not null unique,
  bytes integer not null check (bytes between 1 and 2301952),
  created_at timestamptz not null default now(),
  foreign key (pin_id, owner_id) references public.pins(id, owner_id) on delete cascade
);

-- No cascading FK: durable reservations must survive metadata/account deletion.
-- Retained tombstones also prohibit key reuse after an abnormal in-flight PUT.
create table private.media_inventory (
  pin_id uuid primary key,
  owner_id uuid not null,
  full_key text not null unique,
  thumb_key text not null unique,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  last_swept_at timestamptz
);

create index collections_owner_page on public.collections(owner_id, created_at desc, id desc);
create index pins_owner_page on public.pins(owner_id, created_at desc, id desc);
create index pins_collection_page on public.pins(owner_id, collection_id, created_at desc, id desc);
create index pin_images_owner on public.pin_images(owner_id);
create index media_inventory_owner on private.media_inventory(owner_id);
create index media_inventory_cleanup on private.media_inventory(deleted_at, last_swept_at);

create function private.guard_metadata() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  account_deleting boolean;
  target_owner uuid;
begin
  if TG_OP = 'DELETE' then
    if TG_TABLE_NAME = 'collections' then
      update private.owner_state set collections_count = collections_count - 1 where owner_id = OLD.owner_id;
    else
      update private.owner_state set pins_count = pins_count - 1 where owner_id = OLD.owner_id;
    end if;
    return OLD;
  end if;

  target_owner := NEW.owner_id;
  if TG_OP = 'UPDATE' and (NEW.owner_id <> OLD.owner_id or NEW.id <> OLD.id) then
    raise exception 'ownership and identity are immutable' using errcode = '23514';
  end if;
  insert into private.owner_state(owner_id) values (target_owner) on conflict do nothing;
  -- Same row is locked across server R2 operations. This also makes quotas atomic.
  select deleting into account_deleting from private.owner_state where owner_id = target_owner for update;
  if account_deleting then
    raise exception 'account deletion is in progress' using errcode = '23514';
  end if;
  if TG_OP = 'INSERT' then
    if TG_TABLE_NAME = 'collections' then
      update private.owner_state set collections_count = collections_count + 1
        where owner_id = target_owner and collections_count < 50;
      if not FOUND then raise exception 'collection limit reached (50)' using errcode = '23514'; end if;
    else
      if exists(select 1 from private.media_inventory where pin_id = NEW.id and deleted_at is not null) then
        raise exception 'retired pin identity cannot be reused' using errcode = '23514';
      end if;
      update private.owner_state set pins_count = pins_count + 1
        where owner_id = target_owner and pins_count < 500;
      if not FOUND then raise exception 'pin limit reached (500)' using errcode = '23514'; end if;
    end if;
  end if;
  if TG_TABLE_NAME = 'pins' then NEW.updated_at := now(); end if;
  return NEW;
end;
$$;

revoke all on function private.guard_metadata() from public, anon, authenticated;
create trigger guard_collections before insert or update or delete on public.collections
  for each row execute function private.guard_metadata();
create trigger guard_pins before insert or update or delete on public.pins
  for each row execute function private.guard_metadata();

alter table public.collections enable row level security;
alter table public.pins enable row level security;
alter table public.pin_images enable row level security;

create policy collections_read on public.collections for select to authenticated using ((select auth.uid()) = owner_id);
create policy collections_insert on public.collections for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy collections_update on public.collections for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy pins_read on public.pins for select to authenticated using ((select auth.uid()) = owner_id);
create policy pins_insert on public.pins for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy pins_update on public.pins for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy images_read on public.pin_images for select to authenticated using ((select auth.uid()) = owner_id);

revoke all on public.collections, public.pins, public.pin_images from public, anon, authenticated;
grant select on public.collections, public.pins, public.pin_images to authenticated;
grant insert (id, owner_id, name, description) on public.collections to authenticated;
grant update (name, description) on public.collections to authenticated;
grant insert (id, owner_id, collection_id, title, notes) on public.pins to authenticated;
grant update (collection_id, title, notes) on public.pins to authenticated;
revoke all on private.owner_state, private.media_inventory from public, anon, authenticated;

-- The REST service role is trusted server infrastructure, never mobile config.
grant all on public.collections, public.pins, public.pin_images to service_role;

-- Optional restricted direct-connection role, created by the operator (not here):
-- CREATE ROLE pin_media LOGIN PASSWORD '<set securely>' BYPASSRLS;
-- GRANT USAGE ON SCHEMA public, private, auth TO pin_media;
-- GRANT SELECT (id) ON auth.users TO pin_media;
-- GRANT SELECT, DELETE ON public.collections, public.pins TO pin_media;
-- GRANT SELECT, INSERT ON public.pin_images TO pin_media;
-- GRANT SELECT, INSERT, UPDATE ON private.owner_state, private.media_inventory TO pin_media;
-- Never grant this role to anon/authenticated or expose its connection string.

commit;
