/** A calendar date, independent of UTC offsets and daylight-saving changes. */
export function todayLocalDate(date = new Date()): string {
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function validateAcquiredDate(value: string | null): string | null {
  if (value === null) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) {
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]!) return value;
  }
  throw new Error('Enter a valid date in YYYY-MM-DD format.');
}

export function acquiredDateToLocal(value: string): Date {
  validateAcquiredDate(value);
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date();
  date.setFullYear(year!, month! - 1, day!);
  date.setHours(12, 0, 0, 0);
  return date;
}
