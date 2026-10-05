import { createClient } from '@supabase/supabase-js';
import { connectDatabase } from '../functions/media/database.ts';

function required(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

const email = (Deno.args[0] ?? '').trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Provide one valid account email.');

const auth = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
const { db, close } = connectDatabase(required('MEDIA_DATABASE_URL'));

try {
  const { data, error } = await auth.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  const matches = (data.users ?? []).filter(user => user.email?.trim().toLowerCase() === email);
  if (matches.length !== 1) throw new Error('The requested account could not be uniquely identified.');
  await db.query('INSERT INTO private.app_admins(owner_id) VALUES ($1) ON CONFLICT(owner_id) DO NOTHING', [matches[0]!.id]);
  console.log('Administrator role granted.');
} catch {
  console.error('Administrator role was not granted. Confirm the account exists and server configuration is complete.');
  Deno.exitCode = 1;
} finally {
  await close();
}
