begin;

-- Keeps public image authorization behind one server-only interface while the
-- collection-first migration changes the underlying hierarchy.
create function private.resolve_public_image(p_collection_id uuid, p_item_id uuid)
returns table(full_key text, thumb_key text)
language sql stable security definer set search_path = '' as $$
  select img.full_key, img.thumb_key
    from public.collections c
    join private.owner_state s on s.owner_id = c.owner_id and s.deleting = false
    join public.items i on i.collection_id = c.id and i.owner_id = c.owner_id and i.id = p_item_id
    join public.item_images img on img.item_id = i.id and img.owner_id = i.owner_id
    where c.id = p_collection_id and c.visibility = 'public'
    limit 1;
$$;

revoke all on function private.resolve_public_image(uuid, uuid) from public, anon, authenticated;
grant execute on function private.resolve_public_image(uuid, uuid) to service_role;

commit;
