begin;

alter table public.collections
  add column visibility text not null default 'private'
    check (visibility in ('private', 'public')),
  add column acquired_on date not null default current_date
    check (acquired_on between date '0001-01-01' and date '9999-12-31');

-- Backfill without running the write guard: accounts already frozen for deletion
-- still need their legacy rows migrated. ALTER TABLE holds an exclusive lock.
alter table public.collections disable trigger guard_collections;
update public.collections set acquired_on = created_at::date;
alter table public.collections enable trigger guard_collections;

grant insert (visibility, acquired_on) on public.collections to authenticated;
grant update (visibility, acquired_on) on public.collections to authenticated;

-- Public metadata is available only through this explicit, bounded projection.
-- Keep the raw tables and private schema owner-only.
create function public.get_shared_collection(p_collection_id uuid, p_page integer default 0)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  shared_collection record;
  item_rows jsonb;
  item_total integer;
begin
  if p_collection_id is null or p_page is null or p_page < 0 or p_page > 20 then
    return null;
  end if;

  select c.id, c.name, c.description, k.name as category_name
    into shared_collection
    from public.collections c
    join public.categories k on k.id = c.category_id and k.owner_id = c.owner_id
    join private.owner_state s on s.owner_id = c.owner_id and s.deleting = false
    where c.id = p_collection_id and c.visibility = 'public';
  if not found then return null; end if;

  select count(*) into item_total from public.items i
    where i.collection_id = p_collection_id;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', page.id,
      'title', page.title,
      'hasPhoto', page.has_photo
    ) order by page.created_at desc, page.id desc), '[]'::jsonb)
    into item_rows
    from (
      select i.id, i.title, i.created_at,
        exists(select 1 from public.item_images img where img.item_id = i.id and img.owner_id = i.owner_id) as has_photo
      from public.items i
      where i.collection_id = p_collection_id
      order by i.created_at desc, i.id desc
      limit 24 offset (p_page::bigint * 24)
    ) page;

  return jsonb_build_object(
    'collection', jsonb_build_object(
      'id', shared_collection.id,
      'name', shared_collection.name,
      'description', shared_collection.description,
      'categoryName', shared_collection.category_name
    ),
    'items', item_rows,
    'total', item_total,
    'hasMore', p_page::bigint * 24 + jsonb_array_length(item_rows) < item_total
  );
end;
$$;

revoke all on function public.get_shared_collection(uuid, integer) from public, anon, authenticated;
grant execute on function public.get_shared_collection(uuid, integer) to anon, authenticated, service_role;

commit;
