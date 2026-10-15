import { useMemo } from 'react';
import type { EntryViewerNavigation } from './EntryViewer';
import { getEntryNavigation } from '../domain/entryNavigation';

export function useEntryNavigation<T extends { id: string }>(items: T[], activeId: string | null | undefined, onSelect: (item: T) => void): EntryViewerNavigation | undefined {
  return useMemo(() => {
    const state = getEntryNavigation(items.map(item => item.id), activeId);
    if (state.index < 0) return undefined;
    const selectId = (id: string | null) => { const item = items.find(value => value.id === id); if (item) onSelect(item); };
    return {
      canPrevious: Boolean(state.previousId),
      canNext: Boolean(state.nextId),
      onPrevious: () => selectId(state.previousId),
      onNext: () => selectId(state.nextId),
      positionLabel: `${state.index + 1} of ${state.total}`,
    };
  }, [activeId, items, onSelect]);
}
