import React, { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { colors, fonts } from './ui';

type Props = {
  label: string;
  icon: LucideIcon;
  onPress: () => void;
  active?: boolean;
  count?: number;
  disabled?: boolean;
  busy?: boolean;
  color?: string;
};

/** A compact touch target with a web hover/focus label and native accessibility label. */
export function IconActionButton({ label, icon: Icon, onPress, active = false, count, disabled = false, busy = false, color }: Props) {
  const [showTooltip, setShowTooltip] = useState(false);
  const foreground = color ?? (active ? colors.liked : colors.green);
  const unavailable = disabled || busy;
  return <View style={{ minWidth: 48, minHeight: 48, position: 'relative', alignItems: 'center', justifyContent: 'center' }}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={typeof count === 'number' ? `${count} ${count === 1 ? 'like' : 'likes'}` : undefined}
      accessibilityState={{ disabled: unavailable, selected: active, busy }}
      {...(Platform.OS === 'web' ? { 'aria-pressed': active, title: label } : {})}
      disabled={unavailable}
      onPress={onPress}
      onHoverIn={() => setShowTooltip(true)}
      onHoverOut={() => setShowTooltip(false)}
      onFocus={() => setShowTooltip(true)}
      onBlur={() => setShowTooltip(false)}
      style={({ pressed }) => ({ minWidth: 48, minHeight: 48, paddingHorizontal: typeof count === 'number' ? 8 : 0, borderRadius: 24, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4, backgroundColor: active ? colors.pale : 'transparent', opacity: unavailable ? 0.5 : pressed ? 0.72 : 1 })}
    >
      {busy ? <ActivityIndicator size="small" color={foreground} /> : <Icon size={20} color={foreground} fill={active ? foreground : 'transparent'} aria-hidden />}
      {typeof count === 'number' ? <Text style={{ color: foreground, fontFamily: fonts.medium, fontSize: 12 }}>{count}</Text> : null}
    </Pressable>
    {Platform.OS === 'web' && showTooltip ? <View pointerEvents="none" style={{ position: 'absolute', zIndex: 10, bottom: 50, right: 0, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 7, backgroundColor: colors.ink, maxWidth: 150 }}><Text style={{ color: colors.card, fontFamily: fonts.medium, fontSize: 11, textAlign: 'center' }}>{label}</Text></View> : null}
  </View>;
}
