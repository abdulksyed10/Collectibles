begin;

-- Operator-only controls. These rows have no grants to API clients.
create table private.media_limits (
  singleton boolean primary key default true check (singleton),
  uploads_enabled boolean not null default true,
  public_reads_enabled boolean not null default true,
  active_photos_per_owner integer not null default 100 check (active_photos_per_owner >= 0),
  attempts_per_owner_hour integer not null default 20 check (attempts_per_owner_hour >= 0),
  attempts_per_owner_day integer not null default 50 check (attempts_per_owner_day >= 0),
  attempts_per_app_day integer not null default 200 check (attempts_per_app_day >= 0),
  reserved_bytes_per_owner bigint not null default 262144000 check (reserved_bytes_per_owner >= 0),
  reserved_bytes_per_app bigint not null default 1073741824 check (reserved_bytes_per_app >= 0),
  public_reads_per_app_day integer not null default 10000 check (public_reads_per_app_day >= 0)
);
insert into private.media_limits(singleton) values (true);

create table private.media_budget_global (
  singleton boolean primary key default true check (singleton),
  reserved_bytes bigint not null default 0 check (reserved_bytes >= 0)
);
insert into private.media_budget_global(singleton) values (true);

-- No owner FK: charges survive account deletion and a recreated account ID.
create table private.media_budget_owner (
  owner_id uuid primary key,
  reserved_bytes bigint not null default 0 check (reserved_bytes >= 0)
);

create table private.media_upload_attempts (
  id bigint generated always as identity primary key,
  owner_id uuid not null,
  created_at timestamptz not null default clock_timestamp()
);
create index media_upload_attempts_owner_time on private.media_upload_attempts(owner_id,created_at desc);
create index media_upload_attempts_time on private.media_upload_attempts(created_at desc);

create table private.public_media_reads (
  day date primary key,
  reads integer not null default 0 check (reads >= 0)
);

alter table private.media_inventory
  add column reserved_bytes integer not null default 2301952 check (reserved_bytes between 0 and 2301952),
  add column budget_status text not null default 'retired'
    check (budget_status in ('pending','committed','abandoned','retired'));

-- The old inventory has no reliable failed-PUT size. Charge the maximum
-- possible image pair to every row, including tombstones, then reconcile by
-- an explicit operator action only. Existing committed rows stay committed.
update private.media_inventory i set budget_status = case
  when exists (select 1 from public.item_images p where p.full_key=i.full_key and p.thumb_key=i.thumb_key)
    then 'committed' else 'retired' end;
insert into private.media_budget_owner(owner_id,reserved_bytes)
  select owner_id,sum(reserved_bytes)::bigint from private.media_inventory group by owner_id;
update private.media_budget_global
  set reserved_bytes = (select coalesce(sum(reserved_bytes),0) from private.media_inventory);

create index media_inventory_pending_owner on private.media_inventory(owner_id,item_id)
  where budget_status='pending' and deleted_at is null;

revoke all on private.media_limits, private.media_budget_global,
  private.media_budget_owner, private.media_upload_attempts,
  private.public_media_reads from public, anon, authenticated;

-- Restricted direct-connection roles need explicit grants from the operator:
-- GRANT SELECT ON private.media_limits TO pin_media;
-- GRANT SELECT, INSERT, UPDATE ON private.media_budget_global,
--   private.media_budget_owner, private.media_upload_attempts,
--   private.public_media_reads TO pin_media;
-- GRANT USAGE, SELECT ON SEQUENCE private.media_upload_attempts_id_seq TO pin_media;
-- GRANT UPDATE (reserved_bytes,budget_status) ON private.media_inventory TO pin_media;

commit;
