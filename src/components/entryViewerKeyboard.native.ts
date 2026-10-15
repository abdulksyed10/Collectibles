import type { EntryViewerNavigation } from './EntryViewer';

/** Native viewers use their close control and the touch swipe surface. */
export function useEntryViewerKeyboard(_onClose: () => void, _navigation?: EntryViewerNavigation) {}
