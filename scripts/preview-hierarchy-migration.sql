-- Read-only rehearsal report for the deployed category -> collection layout.
-- Run only against an authorized database connection and save any output under
-- ignored .artifacts/. This deliberately omits notes, emails, image keys, and
-- image contents.
begin read only;

with collection_stats as (
  select
    c.owner_id,
    c.category_id as old_category_id,
    c.id as old_collection_id,
    c.name as old_collection_name,
    c.description as old_collection_description,
    c.acquired_on as old_collection_acquired_on,
    c.created_at as old_collection_created_at,
    count(i.id)::integer as item_count,
    count(i.id) filter (where c.visibility = 'public')::integer as public_item_count,
    count(i.id) filter (where c.visibility = 'private')::integer as private_item_count
  from public.collections c
  left join public.items i on i.collection_id = c.id and i.owner_id = c.owner_id
  group by c.owner_id, c.category_id, c.id, c.name, c.description, c.acquired_on, c.created_at, c.visibility
)
select
  k.id as promoted_collection_id,
  k.name as promoted_collection_name,
  k.created_at as promoted_collection_created_at,
  s.old_collection_id as legacy_share_id,
  s.old_collection_name as converted_category_name,
  s.old_collection_description as converted_category_description,
  s.old_collection_acquired_on as converted_category_acquired_on,
  s.old_collection_created_at as converted_category_created_at,
  s.item_count,
  s.public_item_count,
  s.private_item_count
from collection_stats s
join public.categories k on k.id = s.old_category_id and k.owner_id = s.owner_id
order by k.created_at, k.id, s.old_collection_created_at, s.old_collection_id;

-- Existing category IDs that collide with old collection IDs need replacement
-- parent IDs, because every old collection ID remains reserved for its link.
select k.id as colliding_category_id
from public.categories k
join public.collections c on c.id = k.id
order by k.id;

rollback;
