import React from 'react';
import { Modal, Pressable, ScrollView, Text, View, useWindowDimensions, type ImageStyle } from 'react-native';
import { ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, colors, fonts, ui } from './ui';
import { getEntryViewerMediaHeight } from './entryViewerLayout';
import { useSubtleScrollbar } from './scrollbars';

type Navigation = {
  canPrevious: boolean;
  canNext: boolean;
  busy?: boolean;
  onPrevious: () => void;
  onNext: () => void;
  positionLabel?: string;
};
type Props = {
  title: string;
  media: (style: ImageStyle) => React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  navigation?: Navigation;
};

/** Dedicated entry modal: header stays reachable while media and metadata scroll. */
export function EntryViewer({ title, media, onClose, children, navigation }: Props) {
  const { height } = useWindowDimensions();
  const scrollbar = useSubtleScrollbar();
  const mediaHeight = getEntryViewerMediaHeight(height);
  return <Modal visible transparent animationType="fade" onRequestClose={onClose}>
    <SafeAreaView style={{ flex: 1, backgroundColor: '#172A2380', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
      <View accessibilityViewIsModal style={{ width: '100%', maxWidth: 760, maxHeight: '96%', backgroundColor: colors.paper, borderRadius: 20, overflow: 'hidden' }}>
        <View style={[ui.row, { minHeight: 62, paddingLeft: 20, paddingRight: 8, justifyContent: 'space-between', borderBottomWidth: 1, borderColor: colors.line }]}>
          <Text numberOfLines={1} style={[ui.title, { flex: 1, fontSize: 30, lineHeight: 34 }]}>{title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}><X size={22} color={colors.ink} /></Pressable>
        </View>
        <ScrollView {...scrollbar} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 18, gap: 16 }}>
          <View style={{ height: mediaHeight, backgroundColor: colors.pale, borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>{media({ width: '100%', height: '100%' })}</View>
          {children}
        </ScrollView>
        {navigation ? <View style={{ padding: 12, borderTopWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Button title="Previous entry" secondary icon={ChevronLeft} onPress={navigation.onPrevious} disabled={!navigation.canPrevious || navigation.busy} style={{ flex: 1 }} />
          {navigation.positionLabel ? <Text accessibilityLiveRegion="polite" style={{ color: colors.muted, fontFamily: fonts.medium, fontSize: 12 }}>{navigation.positionLabel}</Text> : null}
          <Button title="Next entry" secondary icon={ChevronRight} onPress={navigation.onNext} disabled={!navigation.canNext || navigation.busy} style={{ flex: 1 }} />
        </View> : null}
      </View>
    </SafeAreaView>
  </Modal>;
}
