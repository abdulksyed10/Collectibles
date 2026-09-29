begin;

-- Discovery groups are derived projections only. The original owner-scoped
-- collections retain their names, IDs, visibility, and independent sharing.
create function private.collection_topic_key(p_name text)
returns text
language sql immutable strict set search_path = '' as $$
  with words as (
    select word, ordinal
      from regexp_split_to_table(lower(btrim(p_name)), '[^[:alnum:]]+') with ordinality as source(word, ordinal)
  ), filtered as (
    select case when char_length(word) > 3 and right(word, 1) = 's' then left(word, char_length(word) - 1) else word end as word, ordinal
      from words
      where word <> '' and word not in ('a', 'an', 'the', 'my', 'collection', 'collections')
  )
  select coalesce(string_agg(word, ' ' order by ordinal), 'collection') from filtered;
$$;
revoke all on function private.collection_topic_key(text) from public, anon, authenticated;

create function public.list_public_topics(p_page integer default 0)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare topic_rows jsonb; topic_total integer;
begin
  if p_page is null or p_page < 0 or p_page > 20 then
    return jsonb_build_object('topics', '[]'::jsonb, 'total', 0, 'hasMore', false);
  end if;
  with members as (
    select c.id as collection_id, c.name, private.collection_topic_key(c.name) as topic_key,
      stats.item_count, stats.last_uploaded_at, stats.cover_item_id
    from public.collections c
    join private.owner_state s on s.owner_id = c.owner_id and s.deleting = false
    join lateral (
      select count(*)::integer as item_count, max(i.created_at) as last_uploaded_at,
        (array_agg(i.id order by i.created_at desc, i.id desc))[1] as cover_item_id
      from public.items i
      where i.collection_id = c.id and i.owner_id = c.owner_id and i.visibility = 'public'
    ) stats on stats.item_count > 0
  ), grouped as (
    select topic_key,
      (array_agg(name order by char_length(name), name))[1] as name,
      sum(item_count)::integer as item_count,
      count(*)::integer as collection_count,
      (array_agg(cover_item_id order by last_uploaded_at desc nulls last, collection_id desc))[1] as cover_item_id,
      (array_agg(collection_id order by last_uploaded_at desc nulls last, collection_id desc))[1] as cover_collection_id,
      max(last_uploaded_at) as last_uploaded_at
    from members
    group by topic_key
  )
  select count(*) into topic_total from grouped;
  with members as (
    select c.id as collection_id, c.name, private.collection_topic_key(c.name) as topic_key,
      stats.item_count, stats.last_uploaded_at, stats.cover_item_id
    from public.collections c
    join private.owner_state s on s.owner_id = c.owner_id and s.deleting = false
    join lateral (
      select count(*)::integer as item_count, max(i.created_at) as last_uploaded_at,
        (array_agg(i.id order by i.created_at desc, i.id desc))[1] as cover_item_id
      from public.items i
      where i.collection_id = c.id and i.owner_id = c.owner_id and i.visibility = 'public'
    ) stats on stats.item_count > 0
  ), grouped as (
    select topic_key,
      (array_agg(name order by char_length(name), name))[1] as name,
      sum(item_count)::integer as item_count,
      count(*)::integer as collection_count,
      (array_agg(cover_item_id order by last_uploaded_at desc nulls last, collection_id desc))[1] as cover_item_id,
      (array_agg(collection_id order by last_uploaded_at desc nulls last, collection_id desc))[1] as cover_collection_id,
      max(last_uploaded_at) as last_uploaded_at
    from members
    group by topic_key
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'key', topic_key,
    'name', name,
    'itemCount', item_count,
    'collectionCount', collection_count,
    'coverItemId', cover_item_id,
    'coverCollectionId', cover_collection_id
  ) order by last_uploaded_at desc nulls last, topic_key desc), '[]'::jsonb)
    into topic_rows
    from (
      select * from grouped order by last_uploaded_at desc nulls last, topic_key desc
      offset p_page * 24 limit 24
    ) page;
  return jsonb_build_object('topics', topic_rows, 'total', topic_total, 'hasMore', topic_total > (p_page + 1) * 24);
end;
$$;
revoke all on function public.list_public_topics(integer) from public, anon, authenticated;
grant execute on function public.list_public_topics(integer) to anon, authenticated, service_role;

create function public.get_public_topic(p_topic_key text, p_page integer default 0)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare topic_name text; entry_rows jsonb; entry_total integer;
begin
  if p_topic_key is null or char_length(p_topic_key) not between 1 and 160 or p_page is null or p_page < 0 or p_page > 20 then return null; end if;
  select (array_agg(c.name order by char_length(c.name), c.name))[1] into topic_name
    from public.collections c
    join private.owner_state s on s.owner_id = c.owner_id and s.deleting = false
    where private.collection_topic_key(c.name) = p_topic_key
      and exists (select 1 from public.items i where i.collection_id = c.id and i.owner_id = c.owner_id and i.visibility = 'public');
  if topic_name is null then return null; end if;
  select count(*) into entry_total
    from public.items i
    join public.collections c on c.id = i.collection_id and c.owner_id = i.owner_id
    join private.owner_state s on s.owner_id = i.owner_id and s.deleting = false
    where i.visibility = 'public' and private.collection_topic_key(c.name) = p_topic_key;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', page.id,
    'title', page.title,
    'hasPhoto', page.has_photo,
    'collectionId', page.collection_id,
    'collectionName', page.collection_name
  ) order by page.created_at desc, page.id desc), '[]'::jsonb) into entry_rows
    from (
      select i.id, i.title, i.created_at, i.collection_id, c.name as collection_name,
        exists(select 1 from public.item_images img where img.item_id = i.id and img.owner_id = i.owner_id) as has_photo
      from public.items i
      join public.collections c on c.id = i.collection_id and c.owner_id = i.owner_id
      join private.owner_state s on s.owner_id = i.owner_id and s.deleting = false
      where i.visibility = 'public' and private.collection_topic_key(c.name) = p_topic_key
      order by i.created_at desc, i.id desc
      offset p_page * 24 limit 24
    ) page;
  return jsonb_build_object('topic', jsonb_build_object('key', p_topic_key, 'name', topic_name), 'entries', entry_rows, 'total', entry_total, 'hasMore', entry_total > (p_page + 1) * 24);
end;
$$;
revoke all on function public.get_public_topic(text, integer) from public, anon, authenticated;
grant execute on function public.get_public_topic(text, integer) to anon, authenticated, service_role;

commit;
