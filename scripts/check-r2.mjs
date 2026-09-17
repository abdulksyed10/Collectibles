// Read-only check. Never print credentials, signed requests or provider bodies.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { AwsClient } from 'aws4fetch';

try {
  const env = parseEnv(readFileSync('supabase/.env.local', 'utf8'));
  if (!/^[a-f0-9]{32}$/i.test(env.R2_ACCOUNT_ID ?? '') || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(env.R2_BUCKET_NAME ?? '')) throw new Error();
  const base = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET_NAME}`;
  const client = new AwsClient({ accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY, service: 's3', region: 'auto', retries: 0 });
  const request = async (suffix, method = 'GET') => fetch(await client.sign(base + suffix, { method, signal: AbortSignal.timeout(20000) }));
  const head = await request('', 'HEAD');
  console.log(`R2 authenticated bucket access: HTTP ${head.status}`);
  const objects = await request('?list-type=2&max-keys=1000');
  if (!objects.ok) throw new Error();
  const body = await objects.text();
  const count = [...body.matchAll(/<Contents>/g)].length;
  const bytes = [...body.matchAll(/<Size>(\d+)<\/Size>/g)].reduce((sum, match) => sum + Number(match[1]), 0);
  const truncated = /<IsTruncated>true<\/IsTruncated>/.test(body);
  console.log(`R2 first page: ${count} objects, ${bytes} bytes; more pages: ${truncated}`);
  const cors = await request('?cors');
  console.log(`R2 CORS inspection: HTTP ${cors.status}`);
  mkdirSync('.artifacts', { recursive: true });
  if (cors.ok) { writeFileSync('.artifacts/r2-cors-before.xml', await cors.text()); console.log('Existing CORS saved to ignored local artifact.'); }
  else await cors.body?.cancel();
  const unsigned = await fetch(base, { method: 'HEAD', signal: AbortSignal.timeout(20000) });
  console.log(`Unsigned S3 bucket access: HTTP ${unsigned.status}. Public custom domains/r2.dev require separate verification.`);
  if (!head.ok || unsigned.ok) process.exitCode = 1;
} catch { console.error('R2 check failed. Check the local credentials and bucket permissions. Provider details were not printed.'); process.exitCode = 1; }
