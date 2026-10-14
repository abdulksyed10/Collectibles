begin;

lock table public.items in share row exclusive mode;
alter table public.items add column if not exists legacy_post_date date;
alter table public.items add column if not exists posted_at timestamptz;

-- Preserve the historical acquisition date for entries that existed before
-- posting dates were introduced. The old guard changes updated_at, so disable
-- only that trigger for this server-owned backfill within this transaction.
alter table public.items disable trigger guard_pins;
update public.items set legacy_post_date = acquired_on where acquired_on is not null and legacy_post_date is null;
alter table public.items enable trigger guard_pins;

create or replace function private.entry_post_date_json(p_legacy date, p_posted timestamptz, p_created timestamptz)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select case
    when p_legacy is not null then jsonb_build_object('kind', 'acquired', 'value', p_legacy::text)
    when p_posted is not null then jsonb_build_object('kind', 'posted', 'value', p_posted)
    else jsonb_build_object('kind', 'added', 'value', p_created)
  end;
$$;
revoke all on function private.entry_post_date_json(date, timestamptz, timestamptz) from public, anon, authenticated;

create or replace function private.set_item_posted_at()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.items
    set posted_at = coalesce(posted_at, new.created_at)
    where id = new.item_id and owner_id = new.owner_id;
  return new;
end;
$$;
revoke all on function private.set_item_posted_at() from public, anon, authenticated;
drop trigger if exists set_item_posted_at_on_image on public.item_images;
create trigger set_item_posted_at_on_image after insert on public.item_images
  for each row execute function private.set_item_posted_at();

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
    'postDate', private.entry_post_date_json(i.legacy_post_date, i.posted_at, i.created_at),
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

commit;
