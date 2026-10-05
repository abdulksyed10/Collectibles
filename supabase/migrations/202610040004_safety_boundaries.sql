begin;

-- Guest blocks are a device preference, never an authorization mechanism.
-- Bound and validate the untrusted header before using it in public queries.
create function private.guest_block_ids() returns uuid[]
language plpgsql stable set search_path = '' as $$
declare raw text; ids uuid[];
begin
  raw := coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-collectibles-blocks', '');
  if char_length(raw)>3700 or raw='' then return '{}'::uuid[]; end if;
  ids := string_to_array(raw, ',')::uuid[];
  if cardinality(ids)>100 then return '{}'::uuid[]; end if;
  return ids;
exception when others then return '{}'::uuid[];
end; $$;
revoke all on function private.guest_block_ids() from public, anon, authenticated;

create or replace view private.visible_public_items as
select i.* from public.items i
join private.item_publication p on p.item_id=i.id and p.owner_id=i.owner_id
  and p.status='approved' and p.approved_revision=p.revision
join private.owner_state state on state.owner_id=i.owner_id and not state.deleting
join private.public_publishers publisher on publisher.owner_id=i.owner_id
left join private.publisher_restrictions restriction on restriction.owner_id=i.owner_id
where i.visibility='public' and not coalesce(restriction.publishing_suspended, false)
and not exists (select 1 from private.publisher_blocks b where b.viewer_id=auth.uid() and b.publisher_id=i.owner_id)
and not (publisher.public_id=any(private.guest_block_ids()));

create or replace function public.block_public_collection(p_collection_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare target uuid;
begin
  if auth.uid() is null then return false; end if;
  select i.owner_id into target from private.resolve_shared_scope(p_collection_id) scope
    join private.visible_public_items i on i.collection_id=scope.collection_id
    and (scope.category_id is null or i.category_id=scope.category_id)
    where i.owner_id<>auth.uid() limit 1;
  if target is null then return false; end if;
  insert into private.publisher_blocks(viewer_id,publisher_id) values(auth.uid(),target) on conflict do nothing;
  return true;
end; $$;
create or replace function public.unblock_public_publisher(p_publisher_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  delete from private.publisher_blocks where viewer_id=auth.uid()
    and publisher_id=(select owner_id from private.public_publishers where public_id=p_publisher_id);
  return found;
end; $$;
create or replace function public.list_blocked_publishers() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('publisherId',p.public_id,'blockedAt',b.blocked_at) order by b.blocked_at desc),'[]'::jsonb)
  from private.publisher_blocks b join private.public_publishers p on p.owner_id=b.publisher_id where b.viewer_id=auth.uid();
$$;

-- Acceptance applies to all contributions, including private writes and media
-- attachment. Reads/deletes remain possible without accepting a new version.
create function private.require_contribution_policy() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Removing public visibility or clearing a deleted category is a reduction
  -- of existing content, not a new contribution. Keep those choices available.
  if tg_table_name='items' and tg_op='UPDATE' then
    if (to_jsonb(new)->>'visibility'='private'
        and (to_jsonb(new)-'visibility'-'updated_at')=(to_jsonb(old)-'visibility'-'updated_at'))
      or (to_jsonb(new)->>'category_id' is null
        and (to_jsonb(new)-'category_id'-'updated_at')=(to_jsonb(old)-'category_id'-'updated_at')) then return new; end if;
  end if;
  if not exists(select 1 from private.owner_public_rules where owner_id=new.owner_id and version='2026-10-04') then
    raise exception 'Please accept the current Terms and Community rules before adding or changing content.' using errcode='23514';
  end if;
  return new;
end; $$;
revoke all on function private.require_contribution_policy() from public, anon, authenticated;
create trigger contribution_policy before insert or update on public.collections for each row execute function private.require_contribution_policy();
create trigger contribution_policy before insert or update on public.categories for each row execute function private.require_contribution_policy();
create trigger contribution_policy before insert or update on public.items for each row execute function private.require_contribution_policy();
create trigger contribution_policy before insert or update on public.item_images for each row execute function private.require_contribution_policy();
create function public.get_policy_acceptance() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('requiredVersion','2026-10-04','acceptedVersion',
    (select version from private.owner_public_rules where owner_id=auth.uid()));
$$;
revoke all on function public.get_policy_acceptance() from public, anon, authenticated;
grant execute on function public.get_policy_acceptance() to authenticated;

-- Keep one report implementation for member RPC and the server-verified guest
-- endpoint. No client can pass a reporter identity into this private function.
alter table private.public_content_reports alter column reporter_id drop not null;
alter table private.public_content_reports add column source_key text not null default 'legacy';
create unique index report_source_item on private.public_content_reports(source_key,item_id,reason,reported_on) where item_id is not null;
create unique index report_source_collection on private.public_content_reports(source_key,collection_id,reason,reported_on) where collection_id is not null;
create table private.report_counters (key text primary key, count integer not null default 0, expires_at timestamptz not null);
revoke all on private.report_counters from public, anon, authenticated;

create function private.submit_public_report(p_reporter uuid,p_source text,p_item uuid,p_collection uuid,p_reason text,p_details text) returns void
language plpgsql security definer set search_path = '' as $$
declare target uuid; k text; keys text[]; lim integer; n integer;
begin
  if p_source is null or char_length(p_source) not between 1 and 100 or (p_item is null)=(p_collection is null)
    or p_reason is null or p_reason not in ('spam','sexual','violence','hate','harassment','scam','privacy','other')
    or p_details is null or char_length(p_details)>1000 then raise exception 'invalid report' using errcode='22023'; end if;
  -- Serialize deduplication and budgets across function instances, including
  -- unavailable targets. Identical acknowledgement prevents a private-ID oracle.
  perform pg_advisory_xact_lock(84201964);
  if exists(select 1 from private.public_content_reports where source_key=p_source and reported_on=current_date and reason=p_reason
    and (item_id=p_item or collection_id=p_collection)) then return; end if;
  keys := array['app:'||current_date::text, 'day:'||p_source||':'||current_date::text, 'hour:'||p_source||':'||date_trunc('hour',now())::text];
  foreach k in array keys loop
    lim := case when k=keys[1] then 200 when k=keys[2] then 20 else 5 end;
    insert into private.report_counters(key,expires_at) values(k,now()+interval '2 days') on conflict do nothing;
    select count into n from private.report_counters where key=k for update;
    if n>=lim then raise exception 'Report limit reached. Please try later.' using errcode='42901'; end if;
    update private.report_counters set count=count+1 where key=k;
  end loop;
  if p_item is not null then
    select owner_id into target from private.visible_public_items where id=p_item limit 1;
  else
    select i.owner_id into target from private.resolve_shared_scope(p_collection) scope join private.visible_public_items i
      on i.collection_id=scope.collection_id and (scope.category_id is null or i.category_id=scope.category_id) limit 1;
  end if;
  if target is null then return; end if;
  insert into private.public_content_reports(reporter_id,source_key,item_id,collection_id,publisher_id,reason,details)
    values(p_reporter,p_source,p_item,p_collection,target,p_reason,btrim(p_details)) on conflict do nothing;
end; $$;
revoke all on function private.submit_public_report(uuid,text,uuid,uuid,text,text) from public, anon, authenticated;

create or replace function public.report_public_content(p_item_id uuid default null,p_collection_id uuid default null,p_reason text default 'other',p_details text default '') returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  perform private.submit_public_report(auth.uid(),'member:'||auth.uid()::text,p_item_id,p_collection_id,p_reason,p_details);
  return true;
end; $$;

create function private.purge_safety_records() returns void
language plpgsql security invoker set search_path = '' as $$
begin
  delete from private.public_content_reports where status<>'open' and reviewed_at<now()-interval '30 days';
  delete from private.report_counters where expires_at<now();
  delete from private.reporter_daily_limits where day<current_date-2;
  delete from private.moderation_audit where created_at<now()-interval '90 days';
end; $$;
revoke all on function private.purge_safety_records() from public, anon, authenticated;
commit;
