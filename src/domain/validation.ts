export type ClientConfig = { ready: true; url: string; key: string } | { ready: false; reason: string };

function bounded(value: string, label: string, max: number, required = true) {
  const clean = value.trim();
  if (required && !clean) throw new Error(`${label} is required.`);
  if (clean.length > max) throw new Error(`${label} must be ${max} characters or fewer.`);
  return clean;
}
export function validatePin(value: { title: string; notes: string }) {
  return { title: bounded(value.title, 'Pin name', 120), notes: bounded(value.notes, 'Notes', 2000, false) };
}
export function validateCollection(value: { name: string; description: string }) {
  return { name: bounded(value.name, 'Collection name', 80), description: bounded(value.description, 'Description', 500, false) };
}
export function escapeSearch(value: string) { return value.replace(/[\\%_]/g, '\\$&'); }
export function readClientConfig(url: string | undefined, key: string | undefined): ClientConfig {
  if (!url || !key) return { ready: false, reason: 'The collection service has not been connected yet.' };
  try {
    const parsed = new URL(url);
    const local = ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname);
    if (parsed.username || parsed.password || (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:'))) throw new Error();
    let publicKey = key.startsWith('sb_publishable_');
    if (!publicKey && key.split('.').length === 3) {
      const payload = key.split('.')[1]!;
      publicKey = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))).role === 'anon';
    }
    if (!publicKey) return { ready: false, reason: 'A Supabase publishable key is required. Server secrets must never be used in the app.' };
    return { ready: true, url: parsed.origin, key };
  } catch { return { ready: false, reason: 'The collection service configuration is invalid.' }; }
}
