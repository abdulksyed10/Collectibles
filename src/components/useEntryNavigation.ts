import { useEffect, useRef, useState } from 'react';
import type { EntryViewerNavigation } from './EntryViewer';
import { getEntryNavigation } from '../domain/entryNavigation';

type Pagination = { hasMore: boolean; loadMore: () => Promise<void>; busy?: boolean };

export function useEntryNavigation<T extends { id: string }>(items: T[], activeId: string | null | undefined, onSelect: (item: T) => void, pagination?: Pagination): EntryViewerNavigation | undefined {
  const [fetching, setFetching] = useState(false);
  const [advanceFrom, setAdvanceFrom] = useState<string | null>(null);
  const [error, setError] = useState('');
  const request = useRef(0);
  const loading = useRef(false);
  const active = useRef(activeId);
  active.current = activeId;
  useEffect(() => {
    request.current++;
    loading.current = false;
    setFetching(false); setAdvanceFrom(null); setError('');
    return () => { request.current++; };
  }, [activeId]);
  useEffect(() => {
    if (!advanceFrom) return;
    setAdvanceFrom(null);
    if (activeId !== advanceFrom) return;
    const state = getEntryNavigation(items.map(item => item.id), activeId);
    const next = items.find(item => item.id === state.nextId);
    if (next) onSelect(next);
    else setError('No next entry loaded. Try again or close to refresh the gallery.');
  }, [advanceFrom, activeId, items, onSelect]);
  const state = getEntryNavigation(items.map(item => item.id), activeId);
  if (state.index < 0) return undefined;
  const selectId = (id: string | null) => {
    if (loading.current || pagination?.busy) return;
    const item = items.find(value => value.id === id);
    if (item) onSelect(item);
  };
  async function nextPage() {
    if (!pagination?.hasMore || loading.current || pagination.busy || !activeId) return;
    const generation = ++request.current;
    loading.current = true; setFetching(true); setError('');
    try {
      await pagination.loadMore();
      if (generation === request.current && active.current === activeId) setAdvanceFrom(activeId);
    } catch {
      if (generation === request.current) setError('Unable to load the next entry. Try again.');
    } finally {
      if (generation === request.current) { loading.current = false; setFetching(false); }
    }
  }
  return {
    canPrevious: Boolean(state.previousId),
    canNext: Boolean(state.nextId) || Boolean(pagination?.hasMore),
    busy: fetching || pagination?.busy,
    error,
    onPrevious: () => selectId(state.previousId),
    onNext: () => { if (state.nextId) selectId(state.nextId); else void nextPage(); },
    positionLabel: `${state.index + 1} of ${state.total}${pagination?.hasMore ? '+' : ''}`,
  };
}
