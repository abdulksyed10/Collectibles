-- Read-only deployment check. Does not select account or collection data.
select jsonb_build_object(
  'app_tables', (
    select jsonb_agg(jsonb_build_object('schema', n.nspname, 'table', c.relname, 'rls', c.relrowsecurity) order by n.nspname, c.relname)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r' and (
      (n.nspname = 'public' and c.relname in ('collections', 'pins', 'pin_images')) or
      (n.nspname = 'private' and c.relname in ('owner_state', 'media_inventory'))
    )
  ),
  'owner_policies', (
    select jsonb_agg(jsonb_build_object('table', tablename, 'policy', policyname, 'operation', cmd, 'roles', roles, 'using', qual, 'check', with_check) order by tablename, policyname)
    from pg_policies where schemaname = 'public' and tablename in ('collections', 'pins', 'pin_images')
  ),
  'relationships', (
    select jsonb_agg(jsonb_build_object('table', conrelid::regclass::text, 'definition', pg_get_constraintdef(oid)) order by conrelid::regclass::text, conname)
    from pg_constraint where contype = 'f' and conrelid in ('public.collections'::regclass, 'public.pins'::regclass, 'public.pin_images'::regclass)
  ),
  'anonymous_can_access_tables', (
    has_table_privilege('anon', 'public.collections', 'SELECT,INSERT,UPDATE,DELETE') or
    has_table_privilege('anon', 'public.pins', 'SELECT,INSERT,UPDATE,DELETE') or
    has_table_privilege('anon', 'public.pin_images', 'SELECT,INSERT,UPDATE,DELETE')
  ),
  'client_can_change_pin_owner', has_column_privilege('authenticated', 'public.pins', 'owner_id', 'UPDATE'),
  'client_can_write_image_keys', has_column_privilege('authenticated', 'public.pin_images', 'full_key', 'INSERT,UPDATE'),
  'client_can_access_private_schema', has_schema_privilege('authenticated', 'private', 'USAGE'),
  'inventory_primary_key', (
    select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'private.media_inventory'::regclass and contype = 'p'
  ),
  'triggers', (
    select jsonb_agg(tgname order by tgname) from pg_trigger
    where tgrelid in ('public.collections'::regclass, 'public.pins'::regclass) and not tgisinternal
  )
) as verification;
