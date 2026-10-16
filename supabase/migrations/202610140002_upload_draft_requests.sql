begin;

-- A replay token belongs to an account, never to a browser session. Retaining a
-- row after an item is deleted means an ambiguous response cannot recreate an
-- entry with the same token later. The private schema has no app-role grants.
create table private.upload_draft_requests (
  owner_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  item_id uuid references public.items(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  primary key (owner_id, request_id)
);
revoke all on private.upload_draft_requests from public, anon, authenticated;

create function private.tombstone_upload_draft_request()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.item_id is not null and new.item_id is null then
    new.deleted_at := coalesce(new.deleted_at, clock_timestamp());
  end if;
  return new;
end;
$$;
revoke all on function private.tombstone_upload_draft_request() from public, anon, authenticated;
create trigger tombstone_upload_draft_request
  before update of item_id on private.upload_draft_requests
  for each row execute function private.tombstone_upload_draft_request();

-- Normalize only the fields represented by ItemDraft. This lets retries with
-- harmless whitespace or omitted optional fields match, while rejecting a
-- changed request instead of silently using an old item for new user input.
create function private.normalize_upload_draft(p_draft jsonb)
returns jsonb
language plpgsql immutable security definer set search_path = '' as $$
declare
  collection_id text;
  category_id text;
  acquired_on text;
  title_value text;
  notes_value text;
  collection_name text;
  category_name text;
  visibility_value text;
begin
  if p_draft is null or jsonb_typeof(p_draft) <> 'object' then
    raise exception 'Invalid upload draft.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_draft) as key
    where key not in ('title', 'notes', 'collectionId', 'newCollectionName', 'categoryId', 'newCategoryName', 'visibility', 'acquiredOn')
  ) then
    raise exception 'Invalid upload draft fields.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_draft->'title') is distinct from 'string' or jsonb_typeof(p_draft->'notes') is distinct from 'string' then
    raise exception 'Invalid upload draft.' using errcode = '22023';
  end if;
  if (p_draft ? 'collectionId') and jsonb_typeof(p_draft->'collectionId') not in ('string', 'null')
    or (p_draft ? 'newCollectionName') and jsonb_typeof(p_draft->'newCollectionName') not in ('string', 'null')
    or (p_draft ? 'categoryId') and jsonb_typeof(p_draft->'categoryId') not in ('string', 'null')
    or (p_draft ? 'newCategoryName') and jsonb_typeof(p_draft->'newCategoryName') not in ('string', 'null')
    or (p_draft ? 'visibility') and jsonb_typeof(p_draft->'visibility') <> 'string'
    or (p_draft ? 'acquiredOn') and jsonb_typeof(p_draft->'acquiredOn') not in ('string', 'null') then
    raise exception 'Invalid upload draft fields.' using errcode = '22023';
  end if;

  title_value := btrim(p_draft->>'title');
  notes_value := btrim(p_draft->>'notes');
  collection_id := nullif(p_draft->>'collectionId', '');
  category_id := nullif(p_draft->>'categoryId', '');
  collection_name := nullif(btrim(p_draft->>'newCollectionName'), '');
  category_name := nullif(btrim(p_draft->>'newCategoryName'), '');
  visibility_value := coalesce(p_draft->>'visibility', 'private');
  acquired_on := p_draft->>'acquiredOn';

  if acquired_on is not null and acquired_on !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'Invalid acquired date.' using errcode = '22023';
  end if;

  if char_length(title_value) not between 1 and 120 or char_length(notes_value) > 2000 then
    raise exception 'Invalid upload draft.' using errcode = '22023';
  end if;
  if visibility_value not in ('private', 'friends', 'public') then
    raise exception 'Invalid upload draft.' using errcode = '22023';
  end if;
  if collection_id is not null and collection_name is not null then
    raise exception 'Choose one collection option.' using errcode = '22023';
  end if;
  if category_id is not null and category_name is not null then
    raise exception 'Choose one category option.' using errcode = '22023';
  end if;
  if collection_name is not null and char_length(collection_name) not between 1 and 80
    or category_name is not null and char_length(category_name) not between 1 and 80 then
    raise exception 'Invalid upload draft.' using errcode = '22023';
  end if;
  begin
    if collection_id is not null then perform collection_id::uuid; end if;
    if category_id is not null then perform category_id::uuid; end if;
    if acquired_on is not null then perform acquired_on::date; end if;
  exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then
    raise exception 'Invalid upload draft.' using errcode = '22023';
  end;

  return jsonb_build_object(
    'title', title_value,
    'notes', notes_value,
    'collectionId', collection_id,
    'newCollectionName', collection_name,
    'categoryId', category_id,
    'newCategoryName', category_name,
    'visibility', visibility_value,
    'acquiredOn', acquired_on
  );
end;
$$;
revoke all on function private.normalize_upload_draft(jsonb) from public, anon, authenticated;

create function public.create_upload_draft(p_request_id uuid, p_draft jsonb)
returns public.items
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  deleting_now boolean;
  normalized jsonb;
  existing_request private.upload_draft_requests%rowtype;
  saved_item public.items%rowtype;
begin
  if actor is null then
    raise exception 'sign in is required' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception 'Invalid upload request.' using errcode = '22023';
  end if;
  normalized := private.normalize_upload_draft(p_draft);

  -- This matches save_item_draft's account-first lock order. Holding it also
  -- serializes two identical request IDs before either can create metadata.
  insert into private.owner_state(owner_id) values (actor) on conflict do nothing;
  select deleting into deleting_now from private.owner_state where owner_id = actor for update;
  if deleting_now then
    raise exception 'account deletion is in progress' using errcode = '23514';
  end if;

  select * into existing_request
    from private.upload_draft_requests
    where owner_id = actor and request_id = p_request_id
    for update;
  if found then
    if existing_request.payload <> normalized then
      raise exception 'This upload request was already used with different data.' using errcode = '22023';
    end if;
    if existing_request.item_id is null then
      raise exception 'This upload draft was deleted and cannot be retried.' using errcode = '23514';
    end if;
    select * into saved_item from public.items where id = existing_request.item_id and owner_id = actor;
    if found then return saved_item; end if;
    update private.upload_draft_requests
      set item_id = null, deleted_at = coalesce(deleted_at, clock_timestamp())
      where owner_id = actor and request_id = p_request_id;
    raise exception 'This upload draft was deleted and cannot be retried.' using errcode = '23514';
  end if;

  -- Drafts must stay private until their photo is confirmed. The normalized
  -- intended audience remains in the private ledger and the client applies it
  -- through the existing guarded save flow after media success.
  if (select count(*) from private.upload_draft_requests where owner_id=actor and created_at > clock_timestamp() - interval '1 day') >= 500 then
    raise exception 'Daily item creation limit reached. Try again tomorrow.' using errcode = '23514';
  end if;
  select * into saved_item from public.save_item_draft(
    normalized->>'title',
    normalized->>'notes',
    'private',
    nullif(normalized->>'collectionId', '')::uuid,
    nullif(normalized->>'newCollectionName', ''),
    nullif(normalized->>'categoryId', '')::uuid,
    nullif(normalized->>'newCategoryName', ''),
    (normalized->>'acquiredOn')::date
  );
  insert into private.upload_draft_requests(owner_id, request_id, payload, item_id)
    values (actor, p_request_id, normalized, saved_item.id);
  return saved_item;
end;
$$;
revoke all on function public.create_upload_draft(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_upload_draft(uuid, jsonb) to authenticated, service_role;

commit;
