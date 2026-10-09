export const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'collectibles', 'moderator', 'sharecollectibles', 'support', 'system', 'deleted',
]);

const USERNAME_PATTERN = /^[a-z][a-z0-9_]{2,29}$/;

export type UsernameValidation =
  | { ok: true; username: string }
  | { ok: false; message: string };

function normalizedLocalPart(email: string | null): string {
  if (!email) return '';
  const [local, domain] = email.trim().toLowerCase().split('@');
  if (!local || domain === 'privaterelay.appleid.com') return '';
  return local
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function suggestedUsername(email: string | null): string {
  const local = normalizedLocalPart(email);
  if (!local) return 'collector';
  const startingWithLetter = /^[a-z]/.test(local) ? local : `u_${local}`;
  const value = startingWithLetter.slice(0, 30).replace(/_+$/g, '');
  return USERNAME_PATTERN.test(value) && !RESERVED_USERNAMES.has(value) ? value : 'collector';
}

export function validateUsername(value: string): UsernameValidation {
  const username = value.trim().replace(/^@/, '').toLowerCase();
  if (!USERNAME_PATTERN.test(username)) {
    return { ok: false, message: 'Use 3–30 letters, numbers, or underscores, starting with a letter.' };
  }
  if (RESERVED_USERNAMES.has(username)) return { ok: false, message: 'Choose a different username.' };
  return { ok: true, username };
}
