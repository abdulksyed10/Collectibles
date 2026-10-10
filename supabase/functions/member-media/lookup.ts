import { MediaError } from '../media/validation.ts';

type Resolver = { status?: unknown; key?: unknown };

export async function lookupMemberImage(
  db: { query<T extends Record<string, unknown>>(sql: string, params: unknown[]): Promise<T[]> },
  viewer: string,
  itemId: string,
  size: 'full' | 'thumb',
): Promise<string | null> {
  const rows = await db.query<{ result: Resolver | null }>(
    'SELECT private.resolve_member_image($1, $2, $3) AS result',
    [viewer, itemId, size],
  );
  const result = rows[0]?.result;
  if (!result || typeof result !== 'object') return null;
  if (result.status === 'ok' && typeof result.key === 'string' && result.key.length > 0) return result.key;
  if (result.status === 'limited') throw new MediaError(429, 'member_read_limit', 'Photo views are temporarily limited. Please try again later.');
  if (result.status === 'paused') throw new MediaError(503, 'member_reads_paused', 'Shared photos are temporarily unavailable.');
  if (result.status === 'unavailable') throw new MediaError(503, 'service_unavailable', 'Shared photos are temporarily unavailable.');
  return null;
}
