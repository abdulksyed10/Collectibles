begin;

-- The Auth hook runs before auth.users receives a row. Keep its operational
-- controls and its short-lived source counters private; neither clients nor
-- public API roles can inspect them.
create table private.signup_admission_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  paused boolean not null default false,
  hmac_key text,
  per_ip_hour integer not null default 5 check (per_ip_hour between 1 and 100),
  per_ip_day integer not null default 10 check (per_ip_day between 1 and 500),
  project_day integer not null default 50 check (project_day between 1 and 5000),
  updated_at timestamptz not null default now()
);
insert into private.signup_admission_settings(singleton) values (true) on conflict do nothing;

create table private.signup_admission_events (
  event_id uuid primary key,
  -- A keyed, normalized source digest avoids retaining raw IP addresses. The
  -- private key supplies the entropy; this is an admission counter, not a
  -- password-verification primitive.
  ip_digest text not null check (char_length(ip_digest) = 32),
  created_at timestamptz not null default now()
);
create index signup_admission_events_ip_time on private.signup_admission_events(ip_digest, created_at desc);
create index signup_admission_events_time on private.signup_admission_events(created_at desc);

create function public.before_user_created_admission(event jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  settings private.signup_admission_settings%rowtype;
  event_uuid uuid;
  source_ip text;
  normalized_ip text;
  source_digest text;
  hourly_count integer;
  daily_count integer;
  project_count integer;
begin
  select * into settings from private.signup_admission_settings where singleton for update;
  if not found or not settings.enabled then return '{}'::jsonb; end if;
  if settings.paused then
    return jsonb_build_object('error', jsonb_build_object('http_code', 429, 'message', 'Signups are temporarily unavailable. Please try again later.'));
  end if;
  if settings.hmac_key is null or char_length(settings.hmac_key) < 32 then
    return jsonb_build_object('error', jsonb_build_object('http_code', 503, 'message', 'Signups are temporarily unavailable. Please try again later.'));
  end if;
  begin
    event_uuid := (event #>> '{metadata,uuid}')::uuid;
    source_ip := nullif(event #>> '{metadata,ip_address}', '');
    normalized_ip := host(source_ip::inet);
  exception when others then
    return jsonb_build_object('error', jsonb_build_object('http_code', 400, 'message', 'Unable to process this signup request.'));
  end;
  if exists (select 1 from private.signup_admission_events where event_id = event_uuid) then return '{}'::jsonb; end if;

  source_digest := md5(settings.hmac_key || '|' || normalized_ip);
  select count(*) into hourly_count from private.signup_admission_events
    where ip_digest = source_digest and created_at > now() - interval '1 hour';
  select count(*) into daily_count from private.signup_admission_events
    where ip_digest = source_digest and created_at > now() - interval '24 hours';
  select count(*) into project_count from private.signup_admission_events
    where created_at > now() - interval '24 hours';
  if hourly_count >= settings.per_ip_hour or daily_count >= settings.per_ip_day or project_count >= settings.project_day then
    return jsonb_build_object('error', jsonb_build_object('http_code', 429, 'message', 'Signups are temporarily unavailable. Please try again later.'));
  end if;

  insert into private.signup_admission_events(event_id, ip_digest) values (event_uuid, source_digest);
  return '{}'::jsonb;
end;
$$;
revoke all on function public.before_user_created_admission(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.before_user_created_admission(jsonb) to supabase_auth_admin;

create function private.purge_signup_admission_events()
returns integer
language plpgsql security definer set search_path = '' as $$
declare removed integer;
begin
  delete from private.signup_admission_events where created_at < now() - interval '2 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;
revoke all on function private.purge_signup_admission_events() from public, anon, authenticated;
grant execute on function private.purge_signup_admission_events() to service_role;

revoke all on private.signup_admission_settings, private.signup_admission_events from public, anon, authenticated;

commit;
