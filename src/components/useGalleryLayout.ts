import { useCallback, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { getGalleryLayout } from './galleryLayout';

/** Recalculates after a gallery's actual parent pane changes size. */
export function useGalleryLayout() {
  const [paneWidth, setPaneWidth] = useState(0);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    setPaneWidth(current => current === nextWidth ? current : nextWidth);
  }, []);
  return { layout: getGalleryLayout(paneWidth), onLayout };
}
