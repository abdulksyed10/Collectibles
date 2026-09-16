import { execFileSync } from 'node:child_process';
import { scanFile } from './secret-rules.mjs';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 30 * 1024 * 1024 });
const all = process.argv.includes('--all');
const names = (all ? git('ls-files', '-z') : git('diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z')).split('\0').filter(Boolean);
let count = 0;
for (const name of names) {
  const content = git('show', `:${name}`);
  for (const finding of scanFile(name, content)) { console.error(`${name}: blocked ${finding} (value redacted)`); count++; }
}
if (count) { console.error('Secret scan failed. Remove credentials from the index and use ignored local files.'); process.exitCode = 1; }
else console.log(`Secret scan passed for ${names.length} ${all ? 'tracked' : 'staged'} files.`);
