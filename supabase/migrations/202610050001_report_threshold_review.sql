begin;

-- Public entries appear immediately. A separate review state only removes
-- content after the configured number of distinct signed-in reporters.
alter table private.item_publication drop constraint if exists item_publication_status_check;
alter table private.item_publication add column if not exists review_cycle integer not null default 1 check (review_cycle > 0);
update private.item_publication
  set status = case when status = 'removed' then 'removed' else 'published' end,
      approved_revision = case when status = 'removed' then null else revision end,
      owner_message = case when status = 'removed' then owner_message else '' end;
alter table private.item_publication add constraint item_publication_status_check
  check (status in ('published', 'review', 'removed'));

create table private.collection_publication (
  collection_id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'published' check (status in ('published', 'review', 'removed')),
  review_cycle integer not null default 1 check (review_cycle > 0),
  reviewed_at timestamptz,
  owner_message text not null default '' check (char_length(owner_message) <= 280),
  foreign key (collection_id, owner_id) references public.collections(id, owner_id) on delete cascade
);
revoke all on private.collection_publication from public, anon, authenticated;
insert into private.collection_publication(collection_id, owner_id)
  select distinct i.collection_id, i.owner_id from public.items i where i.visibility = 'public'
on conflict (collection_id) do nothing;

create table private.moderation_config (
  singleton boolean primary key default true check (singleton),
  distinct_report_threshold integer not null check (distinct_report_threshold between 1 and 100)
);
revoke all on private.moderation_config from public, anon, authenticated;
insert into private.moderation_config(singleton, distinct_report_threshold) values (true, 5)
on conflict (singleton) do update set distinct_report_threshold = excluded.distinct_report_threshold;

-- Keep a small server-only list. This is a lightweight early filter; reports
-- and review remain the path for context-sensitive or image-only concerns.
create table private.prohibited_public_terms (
  term text primary key check (term = lower(term) and term ~ '^[a-z]+$')
);
revoke all on private.prohibited_public_terms from public, anon, authenticated;
insert into private.prohibited_public_terms(term) values
  ('asshole'), ('bastard'), ('bitch'), ('fuck'), ('motherfucker'), ('shit')
on conflict do nothing;

create or replace function private.normalize_public_text(p_text text)
returns text
language sql immutable strict set search_path = '' as $$
  select btrim(regexp_replace(
    regexp_replace(translate(lower(p_text), '013457@$!', 'oieastasi'), '[^[:alnum:]]+', ' ', 'g'),
    '[[:space:]]+', ' ', 'g'
  ));
$$;
revoke all on function private.normalize_public_text(text) from public, anon, authenticated;

create or replace function private.assert_public_text_allowed(p_text text)
returns void
language plpgsql security definer set search_path = '' as $$
declare normalized text := private.normalize_public_text(coalesce(p_text, ''));
begin
  if exists (
    select 1 from private.prohibited_public_terms term
    where (' ' || normalized || ' ') like '% ' || term.term || ' %'
  ) then
    raise exception 'Public text contains language that cannot be shared.' using errcode = '23514';
  end if;
end;
$$;
revoke all on function private.assert_public_text_allowed(text) from public, anon, authenticated;

create or replace function private.assert_item_public_text()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare collection_name text; category_name text;
begin
  if new.visibility <> 'public' then return new; end if;
  perform private.assert_public_text_allowed(new.title);
  select c.name into collection_name from public.collections c where c.id = new.collection_id and c.owner_id = new.owner_id;
  perform private.assert_public_text_allowed(coalesce(collection_name, ''));
  if new.category_id is not null then
    select c.name into category_name from public.categories c where c.id = new.category_id and c.owner_id = new.owner_id;
    perform private.assert_public_text_allowed(coalesce(category_name, ''));
  end if;
  return new;
end;
$$;
revoke all on function private.assert_item_public_text() from public, anon, authenticated;

create or replace function private.assert_collection_public_text()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.name is distinct from old.name and exists (
    select 1 from public.items i where i.collection_id = new.id and i.owner_id = new.owner_id and i.visibility = 'public'
  ) then
    perform private.assert_public_text_allowed(new.name);
  end if;
  return new;
end;
$$;
revoke all on function private.assert_collection_public_text() from public, anon, authenticated;

create or replace function private.assert_category_public_text()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.name is distinct from old.name and exists (
    select 1 from public.items i where i.category_id = new.id and i.owner_id = new.owner_id and i.visibility = 'public'
  ) then
    perform private.assert_public_text_allowed(new.name);
  end if;
  return new;
end;
$$;
revoke all on function private.assert_category_public_text() from public, anon, authenticated;

drop trigger if exists assert_public_text_on_item on public.items;
create trigger assert_public_text_on_item before insert or update of title, visibility, collection_id, category_id on public.items
  for each row execute function private.assert_item_public_text();
drop trigger if exists assert_public_text_on_collection on public.collections;
create trigger assert_public_text_on_collection before update of name on public.collections
  for each row execute function private.assert_collection_public_text();
drop trigger if exists assert_public_text_on_category on public.categories;
create trigger assert_public_text_on_category before update of name on public.categories
  for each row execute function private.assert_category_public_text();

-- Re-use the existing publication trigger call sites, but retain a review or
-- removal state so an owner cannot bypass review by toggling visibility.
create or replace function private.queue_publication(p_item_id uuid, p_owner_id uuid, p_message text default '')
returns void
language plpgsql security definer set search_path = '' as $$
declare current_status text;
begin
  select status into current_status from private.item_publication where item_id = p_item_id for update;
  insert into private.collection_publication(collection_id, owner_id)
    select collection_id, owner_id from public.items where id = p_item_id and owner_id = p_owner_id
  on conflict (collection_id) do nothing;
  if current_status is null then
    insert into private.item_publication(item_id, owner_id, revision, status, approved_revision, submitted_at, reviewed_at, owner_message)
      values (p_item_id, p_owner_id, 1, 'published', 1, now(), null, '');
  else
    update private.item_publication
      set revision = revision + 1,
          status = case when status in ('review', 'removed') then status else 'published' end,
          approved_revision = case when status in ('review', 'removed') then null else revision + 1 end,
          submitted_at = now(),
          reviewed_at = case when status = 'published' then null else reviewed_at end,
          owner_message = case when status = 'published' then '' else owner_message end
      where item_id = p_item_id;
  end if;
end;
$$;
revoke all on function private.queue_publication(uuid, uuid, text) from public, anon, authenticated;

create or replace view private.visible_public_items as
  select i.*
    from public.items i
    join private.item_publication p on p.item_id = i.id and p.owner_id = i.owner_id and p.status = 'published'
    left join private.collection_publication collection_publication
      on collection_publication.collection_id = i.collection_id and collection_publication.owner_id = i.owner_id
    join private.owner_state state on state.owner_id = i.owner_id and state.deleting = false
    join private.public_publishers publisher on publisher.owner_id = i.owner_id
    left join private.publisher_restrictions restriction on restriction.owner_id = i.owner_id
    where i.visibility = 'public'
      and coalesce(collection_publication.status, 'published') = 'published'
      and coalesce(restriction.publishing_suspended, false) = false
      and not exists (
        select 1 from private.publisher_blocks block
        where block.viewer_id = auth.uid() and block.publisher_id = i.owner_id
      )
      and not (publisher.public_id = any(private.guest_block_ids()));
revoke all on private.visible_public_items from public, anon, authenticated;

-- Replace daily/reason deduplication with a single active vote for every
-- signed-in reporter and target. Remove legacy anonymous records first.
delete from private.public_content_reports where reporter_id is null;
alter table private.public_content_reports alter column reporter_id set not null;
alter table private.public_content_reports add column if not exists review_cycle integer not null default 1 check (review_cycle > 0);
alter table private.public_content_reports drop constraint if exists public_content_reports_status_check;
alter table private.public_content_reports add constraint public_content_reports_status_check
  check (status in ('open', 'triggered', 'resolved', 'dismissed'));
drop index if exists public_content_reports_item_once_per_day;
drop index if exists public_content_reports_collection_once_per_day;
drop index if exists report_source_item;
drop index if exists report_source_collection;
create unique index public_content_reports_active_item_reporter
  on private.public_content_reports(reporter_id, item_id, review_cycle)
  where item_id is not null and status in ('open', 'triggered');
create unique index public_content_reports_active_collection_reporter
  on private.public_content_reports(reporter_id, collection_id, review_cycle)
  where collection_id is not null and status in ('open', 'triggered');

create or replace function private.submit_member_report(p_item uuid, p_collection uuid, p_reason text, p_details text)
returns void
language plpgsql security definer set search_path = '' as $$
declare target_owner uuid; target_cycle integer; target_kind text; report_count integer; threshold integer; inserted_report boolean := false; affected_rows integer;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode = '42501'; end if;
  if (p_item is null) = (p_collection is null)
    or p_reason is null or p_reason not in ('spam', 'sexual', 'violence', 'hate', 'harassment', 'scam', 'privacy', 'other')
    or p_details is null or char_length(p_details) > 1000 then
    raise exception 'invalid report' using errcode = '22023';
  end if;
  select distinct_report_threshold into threshold from private.moderation_config where singleton = true for update;
  if p_item is not null then
    select p.owner_id, p.review_cycle, 'item' into target_owner, target_cycle, target_kind
      from private.item_publication p
      join public.items i on i.id = p.item_id and i.owner_id = p.owner_id
      left join private.collection_publication c on c.collection_id = i.collection_id and c.owner_id = i.owner_id
      where p.item_id = p_item and i.visibility = 'public' and p.status = 'published'
        and coalesce(c.status, 'published') = 'published'
      for update of p;
  else
    select c.owner_id, c.review_cycle, 'collection' into target_owner, target_cycle, target_kind
      from private.collection_publication c
      where c.collection_id = p_collection and c.status = 'published'
        and exists (select 1 from private.visible_public_items i where i.collection_id = c.collection_id)
      for update of c;
  end if;
  if target_owner is null or target_owner = auth.uid() then return; end if;

  insert into private.reporter_daily_limits(reporter_id, day) values (auth.uid(), current_date) on conflict do nothing;
  perform 1 from private.reporter_daily_limits where reporter_id = auth.uid() and day = current_date for update;
  if (select reports from private.reporter_daily_limits where reporter_id = auth.uid() and day = current_date) >= 10 then
    raise exception 'report limit reached for today' using errcode = '42901';
  end if;

  insert into private.public_content_reports(reporter_id, source_key, item_id, collection_id, publisher_id, reason, details, review_cycle)
    values (auth.uid(), 'member:' || auth.uid()::text, p_item, p_collection, target_owner, p_reason, btrim(p_details), target_cycle)
    on conflict do nothing;
  get diagnostics affected_rows = row_count;
  inserted_report := affected_rows > 0;
  if not inserted_report then return; end if;
  update private.reporter_daily_limits set reports = reports + 1 where reporter_id = auth.uid() and day = current_date;
  if target_kind = 'item' then
    select count(distinct reporter_id)::integer into report_count from private.public_content_reports
      where item_id = p_item and review_cycle = target_cycle and status = 'open';
  else
    select count(distinct reporter_id)::integer into report_count from private.public_content_reports
      where collection_id = p_collection and review_cycle = target_cycle and status = 'open';
  end if;
  if report_count < threshold then return; end if;
  if target_kind = 'item' then
    update private.item_publication set status = 'review', reviewed_at = now(), approved_revision = null,
      owner_message = 'Hidden from Explore after member reports. It is available for review.'
      where item_id = p_item and review_cycle = target_cycle and status = 'published';
  else
    update private.collection_publication set status = 'review', reviewed_at = now(),
      owner_message = 'Hidden from Explore after member reports. It is available for review.'
      where collection_id = p_collection and review_cycle = target_cycle and status = 'published';
  end if;
  update private.public_content_reports set status = 'triggered', reviewed_at = now()
    where (item_id = p_item or collection_id = p_collection) and review_cycle = target_cycle and status = 'open';
end;
$$;
revoke all on function private.submit_member_report(uuid, uuid, text, text) from public, anon, authenticated;

create or replace function public.report_public_content(p_item_id uuid default null, p_collection_id uuid default null, p_reason text default 'other', p_details text default '')
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode = '42501'; end if;
  perform private.submit_member_report(p_item_id, p_collection_id, p_reason, p_details);
  return true;
end;
$$;
revoke all on function public.report_public_content(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.report_public_content(uuid, uuid, text, text) to authenticated, service_role;

create or replace function public.get_owned_publication(p_item_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when auth.uid() is null then null else coalesce(
    (select jsonb_build_object('status', p.status, 'revision', p.revision, 'message', p.owner_message)
      from private.item_publication p join public.items i on i.id = p.item_id and i.visibility = 'public'
      where p.item_id = p_item_id and p.owner_id = auth.uid()),
    (select jsonb_build_object('status', 'private', 'revision', null, 'message', '')
      from public.items i where i.id = p_item_id and i.owner_id = auth.uid())
  ) end;
$$;
revoke all on function public.get_owned_publication(uuid) from public, anon, authenticated;
grant execute on function public.get_owned_publication(uuid) to authenticated, service_role;

create or replace function public.list_owned_publications(p_item_ids uuid[])
returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when auth.uid() is null or p_item_ids is null or cardinality(p_item_ids) > 24 then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object(
      'itemId', i.id,
      'status', case when i.visibility = 'private' then 'private' else coalesce(p.status, 'published') end,
      'message', case when i.visibility = 'private' then '' else coalesce(p.owner_message, '') end
    ))
    from public.items i left join private.item_publication p on p.item_id = i.id and p.owner_id = i.owner_id
    where i.owner_id = auth.uid() and i.id = any(p_item_ids)
  ), '[]'::jsonb) end;
$$;
revoke all on function public.list_owned_publications(uuid[]) from public, anon, authenticated;
grant execute on function public.list_owned_publications(uuid[]) to authenticated, service_role;

drop index if exists private.item_publication_public_index;
create index item_publication_public_index on private.item_publication(item_id, owner_id) where status = 'published';
create index collection_publication_public_index on private.collection_publication(collection_id, owner_id) where status = 'published';

commit;
