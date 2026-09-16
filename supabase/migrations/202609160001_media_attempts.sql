begin;

-- Upgrade in place: legacy inventory rows keep their original keys and receive
-- an identity of their own. A pin can now have several separately tracked PUT
-- attempts, but public.pin_images still permits only one committed photo.
alter table private.media_inventory
  add column attempt_id uuid not null default gen_random_uuid();
alter table private.media_inventory drop constraint media_inventory_pkey;
alter table private.media_inventory add primary key (attempt_id);
create index media_inventory_pin on private.media_inventory(pin_id);

-- Existing table grants and the guard_metadata retirement check are retained.
-- Deploy the new media function and cleanup script together after this upgrade;
-- the old function's ON CONFLICT(pin_id) no longer matches a unique constraint.

commit;
