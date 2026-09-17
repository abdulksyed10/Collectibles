begin;

-- The public tab reads only this deliberately small projection. Raw tables
-- remain owner-scoped by RLS, and a card contains no profile, owner, notes,
-- acquired date, or storage-key information.
create index collections_public_catalog_page
  on public.collections(created_at desc, id desc)
  where visibility = 'public';
create index items_collection_catalog on public.items(collection_id);

create function public.list_public_collections(p_page integer default 0)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  collection_rows jsonb;
  collection_total integer;
begin
  if p_page is null or p_page < 0 or p_page > 20 then
    return null;
  end if;

  select count(*) into collection_total
    from public.collections c
    join private.owner_state s on s.owner_id = c.owner_id and s.deleting = false
    where c.visibility = 'public';

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', page.id,
      'name', page.name,
      'description', page.description,
      'categoryName', page.category_name,
      'itemCount', (select count(*) from public.items i where i.collection_id = page.id),
      'coverItemId', (
        select i.id from public.items i
        join public.item_images image on image.item_id = i.id and image.owner_id = i.owner_id
        where i.collection_id = page.id
        order by i.created_at desc, i.id desc
        limit 1
      ),
      'isOwner', coalesce((select auth.uid()) = page.owner_id, false)
    ) order by page.created_at desc, page.id desc), '[]'::jsonb)
    into collection_rows
    from (
      select c.id, c.owner_id, c.name, c.description, c.created_at, k.name as category_name
      from public.collections c
      join public.categories k on k.id = c.category_id and k.owner_id = c.owner_id
      join private.owner_state s on s.owner_id = c.owner_id and s.deleting = false
      where c.visibility = 'public'
      order by c.created_at desc, c.id desc
      limit 24 offset (p_page::bigint * 24)
    ) page;

  return jsonb_build_object(
    'collections', collection_rows,
    'total', collection_total,
    'hasMore', p_page::bigint * 24 + jsonb_array_length(collection_rows) < collection_total
  );
end;
$$;

revoke all on function public.list_public_collections(integer) from public, anon, authenticated;
grant execute on function public.list_public_collections(integer) to anon, authenticated, service_role;

commit;
