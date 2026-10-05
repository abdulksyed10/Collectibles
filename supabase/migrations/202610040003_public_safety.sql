begin;

-- Public content remains an optional item-level choice. These private tables
-- support the limited safety controls required for a small moderated beta.
-- They are never exposed through PostgREST.
create table private.publisher_blocks (
  viewer_id uuid not null references auth.users(id) on delete cascade,
  publisher_id uuid not null references auth.users(id) on delete cascade,
  blocked_at timestamptz not null default now(),
  primary key (viewer_id, publisher_id),
  check (viewer_id <> publisher_id)
);

create table private.public_content_reports (
  id bigint generated always as identity primary key,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid,
  collection_id uuid,
  publisher_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('spam', 'sexual', 'violence', 'hate', 'harassment', 'scam', 'privacy', 'other')),
  details text not null default '' check (char_length(details) <= 1000),
  reported_on date not null default current_date,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  reviewed_at timestamptz,
  reviewer_note text not null default '' check (char_length(reviewer_note) <= 500),
  created_at timestamptz not null default now(),
  check ((item_id is null) <> (collection_id is null))
);

create table private.reporter_daily_limits (
  reporter_id uuid not null references auth.users(id) on delete cascade,
  day date not null default current_date,
  reports integer not null default 0 check (reports between 0 and 10),
  primary key (reporter_id, day)
);

-- A public submission is a deliberate opt-in. The version makes a later
-- material policy change re-prompt owners before they publish again.
create table private.owner_public_rules (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  version text not null check (version = '2026-10-04'),
  accepted_at timestamptz not null default now()
);

create unique index public_content_reports_item_once_per_day
  on private.public_content_reports(reporter_id, item_id, reason, reported_on)
  where item_id is not null;
create unique index public_content_reports_collection_once_per_day
  on private.public_content_reports(reporter_id, collection_id, reason, reported_on)
  where collection_id is not null;
create index publisher_blocks_publisher on private.publisher_blocks(publisher_id, viewer_id);
create index public_content_reports_open_queue on private.public_content_reports(status, created_at) where status = 'open';

revoke all on private.publisher_blocks, private.public_content_reports, private.reporter_daily_limits, private.owner_public_rules from public, anon, authenticated;

create or replace function private.require_public_rules()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.visibility = 'public' and not exists (
    select 1 from private.owner_public_rules rules
      where rules.owner_id = new.owner_id and rules.version = '2026-10-04'
  ) then
    raise exception 'accept the public sharing rules before submitting an entry' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.require_public_rules() from public, anon, authenticated;
drop trigger if exists require_public_rules_on_item on public.items;
create trigger require_public_rules_on_item before insert or update of visibility on public.items
  for each row execute function private.require_public_rules();

create or replace function public.accept_public_rules(p_version text default '2026-10-04')
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_version is distinct from '2026-10-04' then
    raise exception 'invalid public rules acceptance' using errcode = '22023';
  end if;
  insert into private.owner_public_rules(owner_id, version, accepted_at)
    values (auth.uid(), p_version, now())
    on conflict (owner_id) do update set version = excluded.version, accepted_at = excluded.accepted_at;
end;
$$;
revoke all on function public.accept_public_rules(text) from public, anon, authenticated;
grant execute on function public.accept_public_rules(text) to authenticated, service_role;

-- Keep the filter next to publication eligibility so every public metadata
-- route derives the same safe projection. The photo endpoint remains public
-- for guest Explore; a block suppresses a publisher from the signed-in
-- viewer's catalog and shared metadata, while moderation removal suppresses
-- photo bytes for every viewer.
create or replace view private.visible_public_items as
  select i.*
    from public.items i
    join private.item_publication p on p.item_id = i.id and p.owner_id = i.owner_id
      and p.status = 'approved' and p.approved_revision = p.revision
    join private.owner_state state on state.owner_id = i.owner_id and state.deleting = false
    left join private.publisher_restrictions restriction on restriction.owner_id = i.owner_id
    where i.visibility = 'public'
      and coalesce(restriction.publishing_suspended, false) = false
      and not exists (
        select 1 from private.publisher_blocks block
        where block.viewer_id = auth.uid() and block.publisher_id = i.owner_id
      );
revoke all on private.visible_public_items from public, anon, authenticated;

create or replace function public.block_public_collection(p_collection_id uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare target_owner uuid;
begin
  if auth.uid() is null or p_collection_id is null then return false; end if;
  select owner_id into target_owner
    from private.visible_public_items
    where collection_id = p_collection_id and owner_id <> auth.uid()
    limit 1;
  if target_owner is null then return false; end if;
  insert into private.publisher_blocks(viewer_id, publisher_id)
    values (auth.uid(), target_owner)
    on conflict do nothing;
  return true;
end;
$$;
revoke all on function public.block_public_collection(uuid) from public, anon, authenticated;
grant execute on function public.block_public_collection(uuid) to authenticated, service_role;

create or replace function public.unblock_public_publisher(p_publisher_id uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_publisher_id is null then return false; end if;
  delete from private.publisher_blocks
    where viewer_id = auth.uid() and publisher_id = p_publisher_id;
  return found;
end;
$$;
revoke all on function public.unblock_public_publisher(uuid) from public, anon, authenticated;
grant execute on function public.unblock_public_publisher(uuid) to authenticated, service_role;

create or replace function public.list_blocked_publishers()
returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when auth.uid() is null then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object('publisherId', block.publisher_id, 'blockedAt', block.blocked_at) order by block.blocked_at desc)
      from private.publisher_blocks block
      where block.viewer_id = auth.uid()
  ), '[]'::jsonb) end;
$$;
revoke all on function public.list_blocked_publishers() from public, anon, authenticated;
grant execute on function public.list_blocked_publishers() to authenticated, service_role;

create or replace function public.report_public_content(
  p_item_id uuid default null,
  p_collection_id uuid default null,
  p_reason text default 'other',
  p_details text default ''
)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare target_owner uuid; existing_report bigint; limit_row private.reporter_daily_limits%rowtype;
begin
  if auth.uid() is null then raise exception 'sign in to report public content' using errcode = '42501'; end if;
  if (p_item_id is null) = (p_collection_id is null)
    or p_reason is null or p_reason not in ('spam', 'sexual', 'violence', 'hate', 'harassment', 'scam', 'privacy', 'other')
    or p_details is null or char_length(p_details) > 1000 then
    raise exception 'invalid report' using errcode = '22023';
  end if;

  if p_item_id is not null then
    select owner_id into target_owner from private.visible_public_items where id = p_item_id limit 1;
    select id into existing_report from private.public_content_reports
      where reporter_id = auth.uid() and item_id = p_item_id and reason = p_reason and reported_on = current_date limit 1;
  else
    select owner_id into target_owner from private.visible_public_items where collection_id = p_collection_id limit 1;
    select id into existing_report from private.public_content_reports
      where reporter_id = auth.uid() and collection_id = p_collection_id and reason = p_reason and reported_on = current_date limit 1;
  end if;
  if target_owner is null then return false; end if;
  if existing_report is not null then return true; end if;

  insert into private.reporter_daily_limits(reporter_id, day) values (auth.uid(), current_date)
    on conflict do nothing;
  select * into limit_row from private.reporter_daily_limits
    where reporter_id = auth.uid() and day = current_date for update;
  if limit_row.reports >= 10 then
    raise exception 'report limit reached for today' using errcode = '42901';
  end if;

  insert into private.public_content_reports(reporter_id, item_id, collection_id, publisher_id, reason, details)
    values (auth.uid(), p_item_id, p_collection_id, target_owner, p_reason, btrim(p_details))
    on conflict do nothing;
  if not found then return true; end if;
  update private.reporter_daily_limits set reports = reports + 1
    where reporter_id = auth.uid() and day = current_date;
  return true;
end;
$$;
revoke all on function public.report_public_content(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.report_public_content(uuid, uuid, text, text) to authenticated, service_role;

commit;
