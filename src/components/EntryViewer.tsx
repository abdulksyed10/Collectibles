import React, { useEffect, useRef } from 'react';
import { Modal, Pressable, ScrollView, Text, View, useWindowDimensions, type ImageStyle } from 'react-native';
import { ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts, ui } from './ui';
import { IconActionButton } from './IconActionButton';
import { getEntryViewerMediaHeight } from './entryViewerLayout';
import { useSubtleScrollbar } from './scrollbars';
import { EntrySwipeSurface } from './EntrySwipeSurface';
import { useEntryViewerKeyboard } from './entryViewerKeyboard';

export type EntryViewerNavigation = {
  canPrevious: boolean;
  canNext: boolean;
  busy?: boolean;
  onPrevious: () => void;
  onNext: () => void;
  positionLabel?: string;
  error?: string;
};
type Props = {
  title: string;
  entryId?: string;
  media: (style: ImageStyle) => React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  navigation?: EntryViewerNavigation;
};

/** Dedicated entry modal: header stays reachable while media and metadata scroll. */
export function EntryViewer({ title, entryId, media, onClose, children, navigation }: Props) {
  const { height, width } = useWindowDimensions();
  const compact = width < 600;
  const scroll = useRef<ScrollView>(null);
  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, [entryId]);
  const scrollbar = useSubtleScrollbar();
  const mediaHeight = getEntryViewerMediaHeight(height);
  useEntryViewerKeyboard(onClose, navigation);
  return <Modal visible transparent animationType="fade" onRequestClose={onClose}>
    <SafeAreaView style={{ flex: 1, backgroundColor: '#172A2380', alignItems: 'center', justifyContent: 'center', padding: compact ? 0 : 12 }}>
      <View testID="entry-viewer" accessibilityViewIsModal style={{ width: '100%', maxWidth: 960, maxHeight: compact ? '100%' : '96%', ...(compact ? { flex: 1 } : {}), backgroundColor: colors.paper, borderRadius: compact ? 0 : 20, overflow: 'hidden' }}>
        <View style={[ui.row, { minHeight: 62, paddingLeft: 20, paddingRight: 8, justifyContent: 'space-between', borderBottomWidth: 1, borderColor: colors.line }]}>
          <Text numberOfLines={1} style={[ui.title, { flex: 1, fontSize: 30, lineHeight: 34 }]}>{title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}><X size={22} color={colors.ink} /></Pressable>
        </View>
        <ScrollView ref={scroll} {...scrollbar} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 18, gap: 16 }}>
          <EntrySwipeSurface style={{ height: mediaHeight, backgroundColor: colors.pale, borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }} onPrevious={navigation?.canPrevious && !navigation.busy ? navigation.onPrevious : undefined} onNext={navigation?.canNext && !navigation.busy ? navigation.onNext : undefined}>{media({ width: '100%', height: '100%' })}</EntrySwipeSurface>
          {children}
        </ScrollView>
        {navigation?.error ? <Text accessibilityRole="alert" style={{ color: colors.danger, paddingHorizontal: 18 }}>{navigation.error}</Text> : null}
        {navigation ? <View style={{ padding: 4, borderTopWidth: 1, borderColor: colors.line, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <IconActionButton label="Previous entry" icon={ChevronLeft} onPress={navigation.onPrevious} disabled={!navigation.canPrevious || navigation.busy} />
          {navigation.positionLabel ? <Text accessibilityLiveRegion="polite" style={{ color: colors.muted, fontFamily: fonts.medium, fontSize: 12 }}>{navigation.positionLabel}</Text> : null}
          <IconActionButton label="Next entry" icon={ChevronRight} onPress={navigation.onNext} disabled={!navigation.canNext || navigation.busy} />
        </View> : null}
      </View>
    </SafeAreaView>
  </Modal>;
}
