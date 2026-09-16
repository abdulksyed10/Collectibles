-- Read-only metadata check before applying this app's migrations.
select table_schema, table_name
from information_schema.tables
where table_schema in ('public', 'private') and table_type = 'BASE TABLE'
order by table_schema, table_name;

select n.nspname as schema_name, c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('collections', 'pins', 'pin_images');
