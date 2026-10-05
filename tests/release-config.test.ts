import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateReleaseConfig } from '../scripts/release-config.ts';
const env={EXPO_PUBLIC_ENABLE_BACKEND:'true',EXPO_PUBLIC_SUPABASE_URL:'https://abc.supabase.co',EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_abcdefghijklmnopq',EXPO_PUBLIC_WEB_URL:'https://collectibles-three.vercel.app',EXPO_PUBLIC_TURNSTILE_SITE_KEY:'0x4AAAAAabcdefghijkLMNo'};
test('production export fails closed without backend and CAPTCHA settings',()=>{
  assert.ok(validateReleaseConfig({}).length>=5);
  assert.deepEqual(validateReleaseConfig(env),[]);
  assert.ok(validateReleaseConfig({...env,EXPO_PUBLIC_ENABLE_BACKEND:'false'}).length);
  assert.ok(validateReleaseConfig({...env,EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_secret_unsafe'}).length);
  assert.ok(validateReleaseConfig({...env,EXPO_PUBLIC_TURNSTILE_SITE_KEY:'1x00000000000000000000AA'}).length);
  assert.ok(validateReleaseConfig({...env,EXPO_PUBLIC_WEB_URL:'http://localhost'}).length);
});
test('native release additionally requires publisher-selected permanent identifiers',()=>{
  assert.ok(validateReleaseConfig(env,true).length);
  const native={...env,APP_ANDROID_PACKAGE:'net.abdul.collectibles',APP_IOS_BUNDLE_IDENTIFIER:'net.abdul.collectibles',EXPO_OWNER:'abdul',EAS_PROJECT_ID:'00000000-0000-4000-8000-000000000111'};
  assert.deepEqual(validateReleaseConfig(native,true),[]);
  assert.ok(validateReleaseConfig({...native,APP_ANDROID_PACKAGE:'com.example.app'},true).length);
});
