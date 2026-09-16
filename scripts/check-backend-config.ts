import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { readClientConfig } from '../src/domain/validation';

function readEnv(path: string): Record<string, string | undefined> {
  try { return parseEnv(readFileSync(path, 'utf8')); }
  catch { console.log(`${path}: missing or unreadable`); return {}; }
}
const client = readEnv('.env.local');
const server = readEnv('supabase/.env.local');
let missing = 0;
function check(name: string, valid: boolean) {
  console.log(`${name}: ${valid ? 'ready' : 'needs configuration'}`);
  if (!valid) missing++;
}
check('Supabase client URL and publishable key', readClientConfig(client.EXPO_PUBLIC_SUPABASE_URL, client.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY).ready);
check('R2_ACCOUNT_ID', /^[a-f0-9]{32}$/i.test(server.R2_ACCOUNT_ID ?? ''));
check('R2_BUCKET_NAME', /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(server.R2_BUCKET_NAME ?? ''));
check('R2_ACCESS_KEY_ID', Boolean(server.R2_ACCESS_KEY_ID?.trim()));
check('R2_SECRET_ACCESS_KEY', Boolean(server.R2_SECRET_ACCESS_KEY?.trim()));
let databaseReady = false;
try {
  const url = new URL(server.MEDIA_DATABASE_URL ?? '');
  databaseReady = ['postgres:', 'postgresql:'].includes(url.protocol) && Boolean(url.hostname && url.username && url.password);
} catch { /* Report presence only, never the connection string. */ }
check('MEDIA_DATABASE_URL', databaseReady);
const origins = (server.MEDIA_ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean);
check('MEDIA_ALLOWED_ORIGINS', origins.length > 0 && origins.every(origin => {
  try { const url = new URL(origin); return ['http:', 'https:'].includes(url.protocol) && origin === url.origin; } catch { return false; }
}));
console.log(missing ? `${missing} configuration item(s) need attention. Values were not printed.` : 'Local configuration is present. This does not verify credentials or deploy services.');
process.exitCode = missing ? 1 : 0;
