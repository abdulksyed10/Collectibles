import { existsSync, readFileSync } from 'node:fs';
import { validateReleaseConfig } from './release-config';
const errors=validateReleaseConfig(process.env, process.argv.includes('native'));
for(const path of ['assets/icon.png','assets/adaptive-foreground.png','assets/splash.png']) {
  if(!existsSync(path)) { errors.push('Missing release asset: '+path); continue; }
  const image=readFileSync(path);
  if(image.readUInt32BE(16)!==image.readUInt32BE(20)) errors.push('Release asset must be square: '+path);
}
if(errors.length) { for(const message of errors) console.error('Release configuration: '+message); process.exitCode=1; }
else console.log('Release configuration passed (values redacted).');
