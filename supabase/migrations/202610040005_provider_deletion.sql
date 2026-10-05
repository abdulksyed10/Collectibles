begin;
create table private.provider_grants (
  owner_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  encrypted_token text,
  status text not null default 'active' check(status in ('active','revoked')),
  registered_at timestamptz not null default now(),
  primary key(owner_id,client_id),
  check((status='revoked')=(encrypted_token is null))
);
create table private.account_deletion_jobs (
  owner_id uuid primary key,
  status text not null default 'pending' check(status in ('pending','complete','needs_attention')),
  attempts integer not null default 0,
  updated_at timestamptz not null default now(),
  failure_code text
);
revoke all on private.provider_grants,private.account_deletion_jobs from public,anon,authenticated;
create table private.provider_registration_attempts(owner_id uuid references auth.users(id) on delete cascade,created_at timestamptz not null default now());
create index provider_attempt_owner_time on private.provider_registration_attempts(owner_id,created_at);
revoke all on private.provider_registration_attempts from public,anon,authenticated;
commit;
