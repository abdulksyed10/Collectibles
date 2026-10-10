begin;

-- Authenticated media delivery for Friends-only entries. R2 object keys stay
-- server-side: this function returns a key only to the Edge Function after it
-- has checked the requesting member, the latest relationship, and limits.
alter table private.media_limits
  add column if not exists member_reads_enabled boolean not null default true;

create or replace function private.resolve_member_image(
  p_viewer uuid,
  p_item uuid,
  p_size text
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  minute_start timestamptz := date_trunc('minute', clock_timestamp());
  day_start timestamptz := date_trunc('day', clock_timestamp());
  minute_limit integer;
  day_limit integer;
  counter_count integer;
  target_owner uuid;
  media_enabled boolean;
  app_reads_enabled boolean;
  app_reads_limit integer;
  app_reads integer;
  image_key text;
begin
  -- The Edge Function verifies the bearer token before this RPC. Retain this
  -- guard for direct server calls and never expose whether an item exists.
  if p_viewer is null or p_item is null or p_size not in ('full', 'thumb') then
    return jsonb_build_object('status', 'not_found');
  end if;

  select member_reads_per_minute, member_reads_per_day
    into minute_limit, day_limit
    from private.social_config where singleton = true;
  if minute_limit is null or day_limit is null then
    return jsonb_build_object('status', 'unavailable');
  end if;

  select member_reads_enabled, public_reads_enabled, public_reads_per_app_day
    into media_enabled, app_reads_enabled, app_reads_limit
    from private.media_limits where singleton = true for update;
  if media_enabled is distinct from true then
    return jsonb_build_object('status', 'paused');
  end if;

  -- Charge authenticated requests before looking up the item. This makes UUID
  -- probing and repeated denied requests subject to the same member quotas.
  insert into private.social_action_counters(actor_id, action, bucket_start, expires_at)
    values (p_viewer, 'member_read_minute', minute_start, minute_start + interval '2 minutes')
    on conflict do nothing;
  select count into counter_count from private.social_action_counters
    where actor_id = p_viewer and action = 'member_read_minute' and bucket_start = minute_start
    for update;
  if coalesce(counter_count, 0) >= minute_limit then
    return jsonb_build_object('status', 'limited');
  end if;
  update private.social_action_counters set count = count + 1
    where actor_id = p_viewer and action = 'member_read_minute' and bucket_start = minute_start;

  insert into private.social_action_counters(actor_id, action, bucket_start, expires_at)
    values (p_viewer, 'member_read_day', day_start, day_start + interval '2 days')
    on conflict do nothing;
  select count into counter_count from private.social_action_counters
    where actor_id = p_viewer and action = 'member_read_day' and bucket_start = day_start
    for update;
  if coalesce(counter_count, 0) >= day_limit then
    return jsonb_build_object('status', 'limited');
  end if;
  update private.social_action_counters set count = count + 1
    where actor_id = p_viewer and action = 'member_read_day' and bucket_start = day_start;

  select item.owner_id into target_owner
    from public.items item
    join private.owner_state state on state.owner_id = item.owner_id and state.deleting = false
    where item.id = p_item;
  if target_owner is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  if p_viewer <> target_owner and not private.can_view_shared_item(p_viewer, p_item) then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- Keep authenticated shared reads within the existing app-wide daily media
  -- budget only after access is authorized. Do not bill the global budget for
  -- an item that the viewer cannot see.
  if app_reads_enabled is distinct from true then
    return jsonb_build_object('status', 'paused');
  end if;
  insert into private.public_media_reads(day) values (current_date) on conflict do nothing;
  select reads into app_reads from private.public_media_reads where day = current_date for update;
  if app_reads is null then
    return jsonb_build_object('status', 'unavailable');
  end if;
  if app_reads >= app_reads_limit then
    return jsonb_build_object('status', 'limited');
  end if;
  update private.public_media_reads set reads = reads + 1 where day = current_date;

  select case when p_size = 'full' then image.full_key else image.thumb_key end
    into image_key
    from public.item_images image
    where image.item_id = p_item and image.owner_id = target_owner;
  if image_key is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  return jsonb_build_object('status', 'ok', 'key', image_key);
end;
$$;
revoke all on function private.resolve_member_image(uuid, uuid, text) from public, anon, authenticated;
grant execute on function private.resolve_member_image(uuid, uuid, text) to service_role;

commit;
