export type AuthIssue = 'credentials' | 'rate-limit' | 'captcha' | 'network' | 'other';
export type AuthIssueResult = { kind: AuthIssue; message: string; retryAt?: number };
export type AuthOperation = 'signin' | 'signup' | 'recover' | 'verify' | 'resend';
export type AuthMode = 'signin' | 'signup' | 'reset' | 'verify';

const credentialWindowMs = 10 * 60_000;
const localPauseMs = 60_000;
const credentialPauseMs = 60 * 60_000;

export function authOperationForMode(mode: AuthMode): AuthOperation {
  return mode === 'reset' ? 'recover' : mode;
}

function errorDetails(error: unknown) {
  if (error && typeof error === 'object') {
    const value = error as { status?: unknown; message?: unknown };
    return { status: typeof value.status === 'number' ? value.status : undefined, message: typeof value.message === 'string' ? value.message : '' };
  }
  return { status: undefined, message: error instanceof Error ? error.message : '' };
}

function retryAtFrom(value: string | undefined, now: number) {
  if (!value) return now + localPauseMs;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return now + seconds * 1000;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > now ? timestamp : now + localPauseMs;
}

function waitMessage(retryAt: number, now: number) {
  const seconds = Math.max(1, Math.ceil((retryAt - now) / 1000));
  return seconds >= 60 ? `Too many requests. Try again in ${Math.ceil(seconds / 60)} minute${seconds >= 120 ? 's' : ''}.` : `Too many requests. Try again in ${seconds} seconds.`;
}

export function mapAuthError(error: unknown, now: number, retryAfter?: string): AuthIssueResult {
  const { status, message } = errorDetails(error);
  const detail = message.toLowerCase();
  if (status === 429 || /rate limit|too many requests/.test(detail)) {
    const retryAt = retryAtFrom(retryAfter, now);
    return { kind: 'rate-limit', message: waitMessage(retryAt, now), retryAt };
  }
  if (/captcha|turnstile|security verification/.test(detail)) return { kind: 'captcha', message: 'Complete the security check and try again.' };
  if (status === 400 && /invalid login|invalid credentials/.test(detail)) return { kind: 'credentials', message: 'Email or password is incorrect.' };
  if (/network request failed|failed to fetch|network error|offline/.test(detail)) return { kind: 'network', message: 'Check your connection and try again.' };
  return { kind: 'other', message: message || 'Something went wrong. Please try again.' };
}

export function recordCredentialFailure(previous: number[], now: number) {
  const failures = [...previous.filter(timestamp => timestamp > now - credentialWindowMs), now];
  return { failures, retryAt: failures.length >= 5 ? now + credentialPauseMs : null };
}

export function secondsUntil(deadline: number | null, now: number) {
  return deadline && deadline > now ? Math.ceil((deadline - now) / 1000) : 0;
}
