type ErrorLike = { code?: unknown; message?: unknown };

export function socialProfileErrorMessage(error: ErrorLike) {
  if (error.code === '23505') return 'That username is already taken.';
  if (error.code === '42901') return 'Username changes are limited for today.';
  if (error.code === '22023' && typeof error.message === 'string' && error.message.length <= 140) return error.message;
  if (error.code === '42501') return 'Profiles are not available yet.';
  return 'Unable to update your profile. Try again.';
}