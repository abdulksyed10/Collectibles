import { acquiredDateToLocal } from './dates';
import type { Item } from './models';

export type EntryPostDate = { kind: 'acquired' | 'posted' | 'added'; value: string };

export function getOwnedEntryPostDate(item: Pick<Item, 'legacy_post_date' | 'posted_at' | 'created_at'>): EntryPostDate {
  if (item.legacy_post_date) return { kind: 'acquired', value: item.legacy_post_date };
  if (item.posted_at) return { kind: 'posted', value: item.posted_at };
  return { kind: 'added', value: item.created_at };
}

export function formatEntryPostDate(value: EntryPostDate, locale?: string) {
  const date = value.kind === 'acquired' ? acquiredDateToLocal(value.value) : new Date(value.value);
  if (Number.isNaN(date.getTime())) return '';
  const label = value.kind === 'acquired' ? 'Acquired' : value.kind === 'posted' ? 'Posted' : 'Added';
  return `${label} ${new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric', year: 'numeric' }).format(date)}`;
}
