import { spawnSync } from 'node:child_process';
const mode=process.env.COLLECTIBLES_BUILD_MODE || 'release';
if(!['release','fixture','demo'].includes(mode)) throw new Error('Unknown COLLECTIBLES_BUILD_MODE.');
function run(path,args) {
  const result=spawnSync(process.execPath,[path,...args],{stdio:'inherit',env:process.env});
  if(result.status!==0) process.exit(result.status??1);
}
if(mode==='release') run('node_modules/tsx/dist/cli.mjs',['scripts/check-release-config.ts']);
run('node_modules/expo/bin/cli',['export','--platform','web','--clear','--max-workers','2']);
