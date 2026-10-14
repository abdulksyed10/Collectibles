import { useEffect, useRef } from 'react';
import type { ViewStyle } from 'react-native';
import { colors } from '../theme/theme';

type ScrollbarProps = { nativeID: string; style: ViewStyle };
let sequence = 0;
let installed = false;

function installScrollbarRules() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const rules = document.createElement('style');
  rules.textContent = `
    [id^="collectibles-scroll-region-"] { scrollbar-width: thin; scrollbar-color: var(--collectibles-scroll-thumb) transparent; }
    [id^="collectibles-scroll-region-"]::-webkit-scrollbar { width: 6px; height: 6px; }
    [id^="collectibles-scroll-region-"]::-webkit-scrollbar-track { background: transparent; }
    [id^="collectibles-scroll-region-"]::-webkit-scrollbar-thumb { background: var(--collectibles-scroll-thumb); border-radius: 999px; }
    [id^="collectibles-scroll-region-"]:hover::-webkit-scrollbar-thumb, [id^="collectibles-scroll-region-"]:focus-within::-webkit-scrollbar-thumb { background: var(--collectibles-scroll-thumb-active); }
    @media (forced-colors: active) {
      [id^="collectibles-scroll-region-"] { scrollbar-color: auto; }
      [id^="collectibles-scroll-region-"]::-webkit-scrollbar-thumb { background: auto; }
    }
  `;
  document.head.appendChild(rules);
}

/** Provides opt-in, scoped web scrollbar styling without importing DOM APIs on native. */
export function useSubtleScrollbar(): ScrollbarProps {
  const id = useRef(`collectibles-scroll-region-${++sequence}`).current;
  useEffect(() => { installScrollbarRules(); }, []);
  return {
    nativeID: id,
    style: {
      scrollbarWidth: 'thin',
      scrollbarColor: `${colors.muted} transparent`,
      ['--collectibles-scroll-thumb' as string]: colors.line,
      ['--collectibles-scroll-thumb-active' as string]: colors.muted,
    } as unknown as ViewStyle,
  };
}
