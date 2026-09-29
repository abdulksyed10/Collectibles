begin;

-- Acquisition is an attribute of an individual collectible. Keep the legacy
-- collection/category date columns for backwards-compatible reads, but stop
-- assigning a date to newly created collections.
alter table public.collections alter column acquired_on drop default;

alter table public.items
  add column acquired_on date
    check (acquired_on is null or acquired_on between date '0001-01-01' and date '9999-12-31');

-- The direct client repository runs as the authenticated owner. Do not expose
-- this private metadata through public catalog functions.
grant insert (acquired_on) on public.items to authenticated;
grant update (acquired_on) on public.items to authenticated;

-- The first upload must not force a separate setup screen. This single
-- transaction resolves an existing parent, creates the requested parent and
-- child, or lazily provisions one owner-scoped General collection. Locking the
-- owner's state row makes the fallback safe when two first uploads race.
create function public.save_item_draft(
  p_title text,
  p_notes text,
  p_visibility text,
  p_collection_id uuid,
  p_new_collection_name text,
  p_category_id uuid,
  p_new_category_name text,
  p_acquired_on date
)
returns public.items
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  deleting_now boolean;
  target_collection_id uuid;
  target_category_id uuid;
  saved_item public.items%rowtype;
begin
  if actor is null then
    raise exception 'sign in is required' using errcode = '42501';
  end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 120 then
    raise exception 'item name must be between 1 and 120 characters' using errcode = '22023';
  end if;
  if p_notes is null or char_length(btrim(p_notes)) > 2000 then
    raise exception 'notes must be 2,000 characters or fewer' using errcode = '22023';
  end if;
  if p_visibility not in ('private', 'public') then
    raise exception 'choose Private or Public' using errcode = '22023';
  end if;
  if p_collection_id is not null and p_new_collection_name is not null then
    raise exception 'choose one collection choice' using errcode = '22023';
  end if;
  if p_category_id is not null and p_new_category_name is not null then
    raise exception 'choose one category choice' using errcode = '22023';
  end if;
  if p_new_collection_name is not null and char_length(btrim(p_new_collection_name)) not between 1 and 80 then
    raise exception 'collection name must be between 1 and 80 characters' using errcode = '22023';
  end if;
  if p_new_category_name is not null and char_length(btrim(p_new_category_name)) not between 1 and 80 then
    raise exception 'category name must be between 1 and 80 characters' using errcode = '22023';
  end if;

  insert into private.owner_state(owner_id) values (actor) on conflict do nothing;
  select deleting into deleting_now from private.owner_state where owner_id = actor for update;
  if deleting_now then
    raise exception 'account deletion is in progress' using errcode = '23514';
  end if;

  if p_new_collection_name is not null then
    insert into public.collections(owner_id, name, description)
      values (actor, btrim(p_new_collection_name), '')
      returning id into target_collection_id;
  elsif p_collection_id is not null then
    select c.id into target_collection_id
      from public.collections c
      where c.id = p_collection_id and c.owner_id = actor;
    if not found then
      raise exception 'collection unavailable' using errcode = '23503';
    end if;
  else
    select c.id into target_collection_id
      from public.collections c
      where c.owner_id = actor and lower(c.name) = 'general'
      order by c.created_at, c.id
      limit 1;
    if not found then
      insert into public.collections(owner_id, name, description)
        values (actor, 'General', '')
        returning id into target_collection_id;
    end if;
  end if;

  if p_new_category_name is not null then
    insert into public.categories(owner_id, collection_id, name, description)
      values (actor, target_collection_id, btrim(p_new_category_name), '')
      returning id into target_category_id;
  elsif p_category_id is not null then
    select k.id into target_category_id
      from public.categories k
      where k.id = p_category_id
        and k.collection_id = target_collection_id
        and k.owner_id = actor;
    if not found then
      raise exception 'category is not in this collection' using errcode = '23503';
    end if;
  end if;

  insert into public.items(owner_id, collection_id, category_id, title, notes, visibility, acquired_on)
    values (actor, target_collection_id, target_category_id, btrim(p_title), btrim(p_notes), p_visibility, p_acquired_on)
    returning * into saved_item;
  return saved_item;
end;
$$;
revoke all on function public.save_item_draft(text, text, text, uuid, text, uuid, text, date) from public, anon, authenticated;
grant execute on function public.save_item_draft(text, text, text, uuid, text, uuid, text, date) to authenticated, service_role;

commit;
