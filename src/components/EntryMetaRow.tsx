import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors, fonts, ui } from './ui';

type Props = {
  username?: string | null;
  onOpenProfile?: () => void;
  dateText?: string;
  children?: React.ReactNode;
};

/** Keeps creator identity and social controls on one stable, responsive row. */
export function EntryMetaRow({ username, onOpenProfile, dateText, children }: Props) {
  const handle = username ? `@${username}` : 'Shared by a collector';
  const identity = <Text numberOfLines={1} style={{ color: colors.green, fontFamily: fonts.medium, fontSize: 14 }}>{handle}</Text>;
  return <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
      {onOpenProfile ? <Pressable accessibilityRole="button" accessibilityLabel={`View ${handle}`} onPress={onOpenProfile} hitSlop={6} style={{ minHeight: 28, justifyContent: 'center', alignSelf: 'flex-start', maxWidth: '100%' }}>{identity}</Pressable> : identity}
      {dateText ? <Text numberOfLines={1} style={[ui.muted, { fontSize: 12 }]}>{dateText}</Text> : null}
    </View>
    {children ? <View style={{ flexShrink: 0, flexDirection: 'row', alignItems: 'center' }}>{children}</View> : null}
  </View>;
}
