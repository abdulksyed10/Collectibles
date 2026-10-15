import React, { useRef } from 'react';
import { View, type ViewStyle } from 'react-native';

export function EntrySwipeSurface({ children, style, onPrevious, onNext }: { children: React.ReactNode; style?: ViewStyle; onPrevious?: () => void; onNext?: () => void }) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return <View style={style} onStartShouldSetResponder={() => Boolean(onPrevious || onNext)} onResponderGrant={event => { start.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY }; }} onResponderRelease={event => {
    const first = start.current; start.current = null;
    if (!first) return;
    const horizontal = event.nativeEvent.pageX - first.x;
    const vertical = event.nativeEvent.pageY - first.y;
    if (Math.abs(horizontal) < 50 || Math.abs(horizontal) <= Math.abs(vertical) * 1.5) return;
    if (horizontal < 0) onNext?.(); else onPrevious?.();
  }}>{children}</View>;
}
