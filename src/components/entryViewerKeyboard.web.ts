import { useEffect } from 'react';
import type { EntryViewerNavigation } from './EntryViewer';

function editingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** Browser-only shortcuts for the active viewer; fields retain their own keys. */
export function useEntryViewerKeyboard(onClose: () => void, navigation?: EntryViewerNavigation) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (editingTarget(event.target)) return;
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key === 'ArrowLeft' && navigation?.canPrevious) { event.preventDefault(); navigation.onPrevious(); }
      if (event.key === 'ArrowRight' && navigation?.canNext) { event.preventDefault(); navigation.onNext(); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigation, onClose]);
}
