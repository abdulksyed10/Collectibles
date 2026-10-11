import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors, fonts, ui } from './ui';

type Props = {
  title: string;
  subtitle: string;
  media: React.ReactNode;
  mediaAspectRatio?: number;
  onOpen: () => void;
  footer?: React.ReactNode;
  testID?: string;
};

/** Shared entry-card frame; footer controls are siblings of the content pressable. */
export function PostCard({ title, subtitle, media, mediaAspectRatio = 1, onOpen, footer, testID }: Props) {
  return <View testID={testID} style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 16, backgroundColor: colors.card, overflow: 'visible' }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`View ${title}`} onPress={onOpen} style={({ pressed }) => ({ opacity: pressed ? 0.84 : 1, borderTopLeftRadius: 15, borderTopRightRadius: 15, overflow: 'hidden' })}>
      <View style={{ aspectRatio: mediaAspectRatio, backgroundColor: colors.pale, alignItems: 'center', justifyContent: 'center' }}>{media}</View>
      <View style={{ padding: 12, gap: 4 }}><Text numberOfLines={2} style={{ color: colors.ink, fontFamily: fonts.bold }}>{title}</Text><Text numberOfLines={1} style={[ui.muted, { fontSize: 12 }]}>{subtitle}</Text></View>
    </Pressable>
    {footer ? <View style={{ paddingHorizontal: 12, paddingBottom: 10 }}>{footer}</View> : null}
  </View>;
}
