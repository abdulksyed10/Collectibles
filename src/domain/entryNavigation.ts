export type EntryNavigationState = { index: number; total: number; previousId: string | null; nextId: string | null };

export function getEntryNavigation(ids: string[], activeId: string | null | undefined): EntryNavigationState {
  const uniqueIds = [...new Set(ids)];
  const index = activeId ? uniqueIds.indexOf(activeId) : -1;
  if (index < 0) return { index: -1, total: uniqueIds.length, previousId: null, nextId: null };
  return { index, total: uniqueIds.length, previousId: uniqueIds[index - 1] ?? null, nextId: uniqueIds[index + 1] ?? null };
}
