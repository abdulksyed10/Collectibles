import { createAppleProvider } from './apple.ts';
export function required(name:string) { const value=Deno.env.get(name); if(!value) throw new Error(`Missing server configuration: ${name}`); return value; }
let provider:ReturnType<typeof createAppleProvider>|undefined;
export function appleProvider() {
  provider ??= createAppleProvider({teamId:required('APPLE_TEAM_ID'),keyId:required('APPLE_KEY_ID'),privateKey:required('APPLE_PRIVATE_KEY'),clientIds:required('APPLE_CLIENT_IDS').split(',').map(s=>s.trim()).filter(Boolean)});
  return provider;
}
