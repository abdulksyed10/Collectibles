import { createClient } from '@supabase/supabase-js';
import { connectDatabase } from '../media/database.ts';
import { createR2Store } from '../media/r2.ts';
import { createMemberMediaHandler } from './http.ts';
import { lookupMemberImage } from './lookup.ts';

function required(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}

const { db } = connectDatabase(
  Deno.env.get('MEDIA_DATABASE_URL') || required('SUPABASE_DB_URL'),
  Deno.env.get('MEDIA_ALLOW_LOCAL_DATABASE') === 'true',
);
const auth = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const store = createR2Store({
  accountId: required('R2_ACCOUNT_ID'),
  bucket: required('R2_BUCKET_NAME'),
  accessKeyId: required('R2_ACCESS_KEY_ID'),
  secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
});

Deno.serve(createMemberMediaHandler({
  origins: (Deno.env.get('MEDIA_ALLOWED_ORIGINS') || '').split(',').map(value => value.trim()).filter(Boolean),
  authenticate: async token => {
    const { data, error } = await auth.auth.getUser(token);
    return error || !data.user ? null : data.user.id;
  },
  lookup: (viewer, itemId, size) => lookupMemberImage(db, viewer, itemId, size),
  read: key => store.get(key),
}));
