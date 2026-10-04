begin;

-- Supabase Postgres includes pgcrypto. PGlite deliberately does not ship the
-- extension, so its local migration fixture gets a deterministic test double
-- only; every hosted database must use pgcrypto's actual HMAC-SHA-256.
do $bootstrap$
begin
  create extension if not exists pgcrypto with schema extensions;
exception when feature_not_supported then
  if position('PGlite' in version()) = 0 then raise; end if;
  create schema if not exists extensions;
  execute $sql$
    create or replace function extensions.hmac(data text, key text, algorithm text)
    returns bytea language sql immutable strict as
    $fn$ select decode(md5(data || '|' || key || '|' || algorithm) || md5(algorithm || '|' || key || '|' || data), 'hex') $fn$
  $sql$;
end;
$bootstrap$;

alter table private.signup_admission_events
  add column if not exists digest_version smallint not null default 1;
alter table private.signup_admission_events
  drop constraint if exists signup_admission_events_ip_digest_check;
alter table private.signup_admission_events
  add constraint signup_admission_events_digest_check check (
    (digest_version = 1 and char_length(ip_digest) = 32)
    or (digest_version = 2 and char_length(ip_digest) = 64)
  );
create index if not exists signup_admission_events_digest_version_time
  on private.signup_admission_events(digest_version, ip_digest, created_at desc);

create or replace function public.before_user_created_admission(event jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  settings private.signup_admission_settings%rowtype;
  event_uuid uuid;
  source_ip text;
  normalized_ip text;
  legacy_digest text;
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
    event_uuid := nullif(event #>> '{metadata,uuid}', '')::uuid;
    source_ip := nullif(event #>> '{metadata,ip_address}', '');
    if event_uuid is null or source_ip is null then raise exception 'missing hook metadata'; end if;
    normalized_ip := host(source_ip::inet);
    if normalized_ip is null then raise exception 'missing source address'; end if;
  exception when others then
    return jsonb_build_object('error', jsonb_build_object('http_code', 400, 'message', 'Unable to process this signup request.'));
  end;

  -- The row lock above makes duplicate delivery and concurrent limit checks
  -- deterministic. Existing v1 MD5 rows still count until their 24-hour TTL
  -- passes; deployments therefore never reset admission limits.
  if exists (select 1 from private.signup_admission_events where event_id = event_uuid) then return '{}'::jsonb; end if;
  legacy_digest := md5(settings.hmac_key || '|' || normalized_ip);
  source_digest := encode(extensions.hmac(normalized_ip, settings.hmac_key, 'sha256'), 'hex');

  select count(*) into hourly_count from private.signup_admission_events
    where ip_digest in (legacy_digest, source_digest) and created_at > now() - interval '1 hour';
  select count(*) into daily_count from private.signup_admission_events
    where ip_digest in (legacy_digest, source_digest) and created_at > now() - interval '24 hours';
  select count(*) into project_count from private.signup_admission_events
    where created_at > now() - interval '24 hours';
  if hourly_count >= settings.per_ip_hour or daily_count >= settings.per_ip_day or project_count >= settings.project_day then
    return jsonb_build_object('error', jsonb_build_object('http_code', 429, 'message', 'Signups are temporarily unavailable. Please try again later.'));
  end if;

  insert into private.signup_admission_events(event_id, ip_digest, digest_version)
    values (event_uuid, source_digest, 2);
  return '{}'::jsonb;
end;
$$;

revoke all on function public.before_user_created_admission(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.before_user_created_admission(jsonb) to supabase_auth_admin;

commit;
