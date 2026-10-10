import type React from 'react';
import type { ImageStyle, StyleProp } from 'react-native';

export declare function SharedEntryImage(props: {
  itemId: string;
  collectionId: string;
  audience: 'public' | 'friends';
  size: 'full' | 'thumb';
  accessRevision: number;
  style?: StyleProp<ImageStyle>;
  accessibilityLabel: string;
  onUnavailable?: () => void;
}): React.ReactElement | null;
