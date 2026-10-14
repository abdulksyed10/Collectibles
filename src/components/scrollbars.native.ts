import type { ViewStyle } from 'react-native';

type ScrollbarProps = { nativeID?: string; style?: ViewStyle };

/** Native keeps its platform's transient, accessible scroll indicators. */
export function useSubtleScrollbar(): ScrollbarProps { return {}; }
