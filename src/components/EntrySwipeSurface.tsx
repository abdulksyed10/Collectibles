import React, { useMemo, useRef } from 'react';
import { PanResponder, Platform, View, type ViewStyle } from 'react-native';

export function EntrySwipeSurface({ children, style, onPrevious, onNext }: { children: React.ReactNode; style?: ViewStyle; onPrevious?: () => void; onNext?: () => void }) {
  const cancelled = useRef(false);
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, gesture) => gesture.numberActiveTouches === 1
      && Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5
      && Boolean(gesture.dx < 0 ? onNext : onPrevious),
    onPanResponderGrant: () => { cancelled.current = false; },
    onPanResponderMove: (_, gesture) => { if (gesture.numberActiveTouches > 1) cancelled.current = true; },
    onPanResponderTerminationRequest: () => true,
    onPanResponderTerminate: () => { cancelled.current = true; },
    onPanResponderRelease: (_, gesture) => {
      if (cancelled.current || Math.abs(gesture.dx) < 50 || Math.abs(gesture.dx) <= Math.abs(gesture.dy) * 1.5) return;
      if (gesture.dx < 0) onNext?.(); else onPrevious?.();
    },
  }), [onNext, onPrevious]);
  const touchStyle = Platform.OS === 'web' ? { touchAction: 'pan-y pinch-zoom' } as ViewStyle : undefined;
  return <View style={[style, touchStyle]} {...responder.panHandlers}>{children}</View>;
}
