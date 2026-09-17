-- Read-only deployment check. Does not select account or collection data.
select jsonb_build_object(
  'app_tables', (
    select jsonb_agg(jsonb_build_object('schema', n.nspname, 'table', c.relname, 'rls', c.relrowsecurity) order by n.nspname, c.relname)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r' and (
      (n.nspname = 'public' and c.relname in ('categories', 'collections', 'items', 'item_images')) or
      (n.nspname = 'private' and c.relname in ('owner_state', 'media_inventory', 'media_limits', 'media_budget_global', 'media_budget_owner', 'media_upload_attempts', 'public_media_reads'))
    )
  ),
  'owner_policies', (
    select jsonb_agg(jsonb_build_object('table', tablename, 'policy', policyname, 'operation', cmd, 'roles', roles, 'using', qual, 'check', with_check) order by tablename, policyname)
    from pg_policies where schemaname = 'public' and tablename in ('categories', 'collections', 'items', 'item_images')
  ),
  'relationships', (
    select jsonb_agg(jsonb_build_object('table', conrelid::regclass::text, 'definition', pg_get_constraintdef(oid)) order by conrelid::regclass::text, conname)
    from pg_constraint where contype = 'f' and conrelid in ('public.categories'::regclass, 'public.collections'::regclass, 'public.items'::regclass, 'public.item_images'::regclass)
  ),
  'anonymous_can_access_tables', (
    has_table_privilege('anon', 'public.categories', 'SELECT,INSERT,UPDATE,DELETE') or
    has_table_privilege('anon', 'public.collections', 'SELECT,INSERT,UPDATE,DELETE') or
    has_table_privilege('anon', 'public.items', 'SELECT,INSERT,UPDATE,DELETE') or
    has_table_privilege('anon', 'public.item_images', 'SELECT,INSERT,UPDATE,DELETE')
  ),
  'client_can_change_item_owner', has_column_privilege('authenticated', 'public.items', 'owner_id', 'UPDATE'),
  'client_can_change_category_owner', has_column_privilege('authenticated', 'public.categories', 'owner_id', 'UPDATE'),
  'client_can_change_category_identity', has_column_privilege('authenticated', 'public.categories', 'id', 'UPDATE'),
  'client_can_delete_categories', has_table_privilege('authenticated', 'public.categories', 'DELETE'),
  'client_can_set_collection_category', has_column_privilege('authenticated', 'public.collections', 'category_id', 'UPDATE'),
  'collection_sharing_columns', (
    select jsonb_agg(jsonb_build_object('column', column_name, 'type', data_type, 'default', column_default, 'nullable', is_nullable) order by column_name)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'collections' and column_name in ('visibility', 'acquired_on')
  ),
  'anonymous_can_use_shared_projection', has_function_privilege('anon', 'public.get_shared_collection(uuid,integer)', 'EXECUTE'),
  'shared_projection_security_definer', (
    select prosecdef from pg_proc where oid = 'public.get_shared_collection(uuid,integer)'::regprocedure
  ),
  'anonymous_can_write_collections', has_table_privilege('anon', 'public.collections', 'INSERT,UPDATE,DELETE'),
  'client_can_write_image_keys', has_column_privilege('authenticated', 'public.item_images', 'full_key', 'INSERT,UPDATE'),
  'client_can_access_private_schema', has_schema_privilege('authenticated', 'private', 'USAGE'),
  'inventory_primary_key', (
    select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'private.media_inventory'::regclass and contype = 'p'
  ),
  'media_budget_controls', jsonb_build_object(
    'limits_seeded', exists(select 1 from private.media_limits where singleton),
    'uploads_enabled', (select uploads_enabled from private.media_limits where singleton),
    'public_reads_enabled', (select public_reads_enabled from private.media_limits where singleton),
    'authenticated_can_read_limits', has_table_privilege('authenticated', 'private.media_limits', 'SELECT'),
    'authenticated_can_read_owner_budget', has_table_privilege('authenticated', 'private.media_budget_owner', 'SELECT'),
    'authenticated_can_read_attempts', has_table_privilege('authenticated', 'private.media_upload_attempts', 'SELECT'),
    'anonymous_can_read_public_media_counter', has_table_privilege('anon', 'private.public_media_reads', 'SELECT')
  ),
  'triggers', (
    select jsonb_agg(tgname order by tgname) from pg_trigger
    where tgrelid in ('public.categories'::regclass, 'public.collections'::regclass, 'public.items'::regclass, 'auth.users'::regclass) and not tgisinternal
  )
) as verification;
