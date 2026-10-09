begin;

create table private.reserved_usernames (
  username text primary key check (username = lower(username) and username ~ '^[a-z][a-z0-9_]{2,29}$')
);
revoke all on private.reserved_usernames from public, anon, authenticated;
insert into private.reserved_usernames(username) values
  ('admin'), ('administrator'), ('collectibles'), ('deleted'), ('moderator'), ('sharecollectibles'), ('support'), ('system')
on conflict do nothing;

create table private.collector_profiles (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username = lower(username) and username ~ '^[a-z][a-z0-9_]{2,29}$'),
  intro_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
revoke all on private.collector_profiles from public, anon, authenticated;

create sequence private.collector_username_suffix_seq;
revoke all on sequence private.collector_username_suffix_seq from public, anon, authenticated;

create table private.social_config (
  singleton boolean primary key default true check (singleton),
  profiles_enabled boolean not null default false,
  social_writes_enabled boolean not null default false,
  friends_sharing_enabled boolean not null default false,
  likes_enabled boolean not null default false,
  max_follows integer not null default 1000 check (max_follows between 1 and 100000),
  follows_per_hour integer not null default 60 check (follows_per_hour between 1 and 10000),
  follows_per_day integer not null default 200 check (follows_per_day between 1 and 100000),
  likes_per_hour integer not null default 300 check (likes_per_hour between 1 and 100000),
  likes_per_day integer not null default 1000 check (likes_per_day between 1 and 100000),
  username_changes_per_day integer not null default 5 check (username_changes_per_day between 1 and 100),
  search_per_minute integer not null default 60 check (search_per_minute between 1 and 10000),
  member_reads_per_minute integer not null default 120 check (member_reads_per_minute between 1 and 100000),
  member_reads_per_day integer not null default 5000 check (member_reads_per_day between 1 and 1000000)
);
revoke all on private.social_config from public, anon, authenticated;
insert into private.social_config(singleton) values (true) on conflict do nothing;

create table private.social_action_counters (
  actor_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action ~ '^[a-z_]{1,64}$'),
  bucket_start timestamptz not null,
  count integer not null default 0 check (count >= 0),
  expires_at timestamptz not null,
  primary key (actor_id, action, bucket_start)
);
revoke all on private.social_action_counters from public, anon, authenticated;
create index social_action_counters_expiry on private.social_action_counters(expires_at);

create or replace function private.social_username_base(p_email text)
returns text
language plpgsql immutable set search_path = '' as $$
declare local_part text; domain_part text; candidate text;
begin
  if p_email is null then return 'collector'; end if;
  local_part := split_part(lower(btrim(p_email)), '@', 1);
  domain_part := split_part(lower(btrim(p_email)), '@', 2);
  if local_part = '' or domain_part = 'privaterelay.appleid.com' then return 'collector'; end if;
  candidate := btrim(regexp_replace(local_part, '[^a-z0-9]+', '_', 'g'), '_');
  if candidate = '' then return 'collector'; end if;
  if candidate !~ '^[a-z]' then candidate := 'u_' || candidate; end if;
  candidate := rtrim(left(candidate, 30), '_');
  if candidate !~ '^[a-z][a-z0-9_]{2,29}$' or exists (select 1 from private.reserved_usernames r where r.username = candidate) then
    return 'collector';
  end if;
  return candidate;
end;
$$;
revoke all on function private.social_username_base(text) from public, anon, authenticated;

create or replace function private.normalize_username(p_username text)
returns text
language plpgsql security definer set search_path = '' as $$
declare candidate text;
begin
  candidate := lower(regexp_replace(btrim(coalesce(p_username, '')), '^@', ''));
  if candidate !~ '^[a-z][a-z0-9_]{2,29}$' then
    raise exception 'Use 3–30 letters, numbers, or underscores, starting with a letter.' using errcode = '22023';
  end if;
  if exists (select 1 from private.reserved_usernames r where r.username = candidate) then
    raise exception 'Choose a different username.' using errcode = '22023';
  end if;
  perform private.assert_public_text_allowed(candidate);
  return candidate;
end;
$$;
revoke all on function private.normalize_username(text) from public, anon, authenticated;

create or replace function private.ensure_collector_profile(p_owner uuid, p_email text)
returns private.collector_profiles
language plpgsql security definer set search_path = '' as $$
declare profile private.collector_profiles%rowtype; base text; candidate text; suffix bigint; use_suffix boolean := false;
begin
  if p_owner is null then raise exception 'sign in required' using errcode = '42501'; end if;
  insert into private.public_publishers(owner_id) values (p_owner) on conflict do nothing;
  select * into profile from private.collector_profiles where owner_id = p_owner for update;
  if found then return profile; end if;
  base := private.social_username_base(p_email);
  loop
    if use_suffix then
      suffix := nextval('private.collector_username_suffix_seq'::regclass);
      candidate := left(base, greatest(1, 30 - char_length(suffix::text) - 1)) || '_' || suffix::text;
    else
      candidate := base;
    end if;
    insert into private.collector_profiles(owner_id, username)
      values (p_owner, candidate)
      on conflict do nothing
      returning * into profile;
    if found then return profile; end if;
    select * into profile from private.collector_profiles where owner_id = p_owner for update;
    if found then return profile; end if;
    use_suffix := true;
  end loop;
end;
$$;
revoke all on function private.ensure_collector_profile(uuid, text) from public, anon, authenticated;

create or replace function private.social_profile_json(p_owner uuid, p_profile private.collector_profiles)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'publisherId', private.public_publisher_id(p_owner),
    'username', p_profile.username,
    'introCompletedAt', p_profile.intro_completed_at
  );
$$;
revoke all on function private.social_profile_json(uuid, private.collector_profiles) from public, anon, authenticated;

create or replace function private.require_profiles_enabled()
returns void
language plpgsql security definer set search_path = '' as $$
declare enabled boolean;
begin
  select profiles_enabled into enabled from private.social_config where singleton = true;
  if coalesce(enabled, false) = false then raise exception 'Profiles are not available yet.' using errcode = '42501'; end if;
end;
$$;
revoke all on function private.require_profiles_enabled() from public, anon, authenticated;

create or replace function public.get_social_capabilities()
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'profilesEnabled', coalesce((select profiles_enabled from private.social_config where singleton = true), false),
    'socialWritesEnabled', coalesce((select social_writes_enabled from private.social_config where singleton = true), false),
    'friendsSharingEnabled', coalesce((select friends_sharing_enabled from private.social_config where singleton = true), false),
    'likesEnabled', coalesce((select likes_enabled from private.social_config where singleton = true), false)
  );
$$;
revoke all on function public.get_social_capabilities() from public, anon, authenticated;
grant execute on function public.get_social_capabilities() to anon, authenticated, service_role;

create or replace function public.ensure_social_profile()
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); email_value text; profile private.collector_profiles%rowtype;
begin
  if actor is null then raise exception 'sign in required' using errcode = '42501'; end if;
  perform private.require_profiles_enabled();
  select email into email_value from auth.users where id = actor;
  profile := private.ensure_collector_profile(actor, email_value);
  return private.social_profile_json(actor, profile);
end;
$$;
revoke all on function public.ensure_social_profile() from public, anon, authenticated;
grant execute on function public.ensure_social_profile() to authenticated, service_role;

create or replace function public.complete_profile_intro(p_username text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); email_value text; profile private.collector_profiles%rowtype; username_value text;
begin
  if actor is null then raise exception 'sign in required' using errcode = '42501'; end if;
  perform private.require_profiles_enabled();
  select email into email_value from auth.users where id = actor;
  profile := private.ensure_collector_profile(actor, email_value);
  username_value := private.normalize_username(p_username);
  update private.collector_profiles
    set username = username_value, intro_completed_at = coalesce(intro_completed_at, now()), updated_at = now()
    where owner_id = actor
    returning * into profile;
  return private.social_profile_json(actor, profile);
end;
$$;
revoke all on function public.complete_profile_intro(text) from public, anon, authenticated;
grant execute on function public.complete_profile_intro(text) to authenticated, service_role;

create or replace function public.update_username(p_username text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); email_value text; profile private.collector_profiles%rowtype; username_value text; changed integer; limit_value integer;
begin
  if actor is null then raise exception 'sign in required' using errcode = '42501'; end if;
  perform private.require_profiles_enabled();
  select email into email_value from auth.users where id = actor;
  profile := private.ensure_collector_profile(actor, email_value);
  select * into profile from private.collector_profiles where owner_id = actor for update;
  username_value := private.normalize_username(p_username);
  if profile.username = username_value then return private.social_profile_json(actor, profile); end if;
  select username_changes_per_day into limit_value from private.social_config where singleton = true;
  insert into private.social_action_counters(actor_id, action, bucket_start, expires_at)
    values (actor, 'username_rename', date_trunc('day', now()), date_trunc('day', now()) + interval '2 days')
    on conflict do nothing;
  select count into changed from private.social_action_counters
    where actor_id = actor and action = 'username_rename' and bucket_start = date_trunc('day', now()) for update;
  if changed >= limit_value then raise exception 'Username changes are limited for today.' using errcode = '42901'; end if;
  update private.collector_profiles set username = username_value, updated_at = now() where owner_id = actor returning * into profile;
  update private.social_action_counters set count = count + 1
    where actor_id = actor and action = 'username_rename' and bucket_start = date_trunc('day', now());
  return private.social_profile_json(actor, profile);
end;
$$;
revoke all on function public.update_username(text) from public, anon, authenticated;
grant execute on function public.update_username(text) to authenticated, service_role;

do $$
declare account record;
begin
  for account in select id, email from auth.users order by created_at, id loop
    perform private.ensure_collector_profile(account.id, account.email);
  end loop;
end;
$$;

commit;
