import React from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { X, type LucideIcon, Layers3, LockKeyhole } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
export const colors = { paper: '#F8F7F3', card: '#FFFFFF', ink: '#253C35', muted: '#748079', line: '#E4E8E0', green: '#294D40', pale: '#E8EFE8', coral: '#BB6145', sand: '#EFE7D8', danger: '#A53636' };
export const fonts = { body: 'DMSans_400Regular', medium: 'DMSans_500Medium', bold: 'DMSans_700Bold', heading: 'InstrumentSerif_400Regular' };
export const ui = StyleSheet.create({
  text: { color: colors.ink, fontFamily: fonts.body, fontSize: 15, lineHeight: 23 },
  muted: { color: colors.muted, fontFamily: fonts.body, fontSize: 14, lineHeight: 22 },
  label: { color: colors.ink, fontFamily: fonts.bold, fontSize: 13, marginBottom: 8 },
  title: { fontFamily: fonts.heading, color: colors.ink, fontSize: 42, lineHeight: 46 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 14, backgroundColor: colors.card, fontFamily: fonts.body, fontSize: 15, color: colors.ink, minHeight: 50 },
  error: { color: colors.danger, fontFamily: fonts.medium, fontSize: 14, lineHeight: 21 },
  card: { borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, padding: 22 },
});
export function Brand({ small = false }: { small?: boolean }) {
  return <View style={ui.row}><View style={{ backgroundColor: colors.green, width: small ? 34 : 42, height: small ? 34 : 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}><Layers3 size={small ? 19 : 23} color="#FFF" strokeWidth={1.7} /></View><Text style={{ fontFamily: fonts.bold, fontSize: small ? 18 : 22, color: colors.ink, letterSpacing: -0.6 }}>collectibles<Text style={{ color: colors.coral }}>.</Text></Text></View>;
}
export function Button({ title, onPress, icon: Icon, secondary, danger, loading, disabled, style }: { title: string; onPress: () => void; icon?: LucideIcon; secondary?: boolean; danger?: boolean; loading?: boolean; disabled?: boolean; style?: ViewStyle }) {
  const fg = secondary ? (danger ? colors.danger : colors.ink) : '#FFFFFF';
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }} disabled={disabled || loading} onPress={onPress} style={({ pressed }) => [{ minHeight: 48, paddingHorizontal: 19, paddingVertical: 12, borderRadius: 12, backgroundColor: secondary ? colors.card : danger ? colors.danger : colors.green, borderWidth: secondary ? 1 : 0, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: disabled || loading ? 0.5 : pressed ? 0.8 : 1 }, style]}>{loading ? <ActivityIndicator size="small" color={fg} /> : Icon ? <Icon size={18} color={fg} /> : null}<Text style={{ fontFamily: fonts.bold, fontSize: 14, color: fg }}>{title}</Text></Pressable>;
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return <View style={{ gap: 0 }}><Text style={ui.label}>{label}</Text><TextInput accessibilityLabel={label} placeholderTextColor="#9AA49C" {...props} style={[ui.input, props.multiline && { minHeight: 100, textAlignVertical: 'top' }, props.style]} /></View>;
}
export function ErrorMessage({ message }: { message: string }) { return message ? <Text accessibilityRole="alert" style={ui.error}>{message}</Text> : null; }
export function PrivateBadge() { return <View style={[ui.row, { gap: 5, backgroundColor: colors.pale, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 }]}><LockKeyhole size={12} color={colors.green} /><Text style={{ fontSize: 11, color: colors.green, fontFamily: fonts.bold }}>ONLY YOU</Text></View>; }
export function Sheet({ title, subtitle, onClose, children, busy = false }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; busy?: boolean }) {
  return <Modal visible transparent animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}><SafeAreaView style={{ flex: 1, backgroundColor: '#172A2380', alignItems: 'center', justifyContent: 'center', padding: 16 }}><View accessibilityViewIsModal style={{ width: '100%', maxWidth: 530, maxHeight: '94%', backgroundColor: colors.paper, borderRadius: 24 }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 25, gap: 22 }}><View style={[ui.row, { justifyContent: 'space-between' }]}><Text style={[ui.title, { fontSize: 34, flex: 1 }]}>{title}</Text><Pressable accessibilityRole="button" accessibilityLabel="Close" disabled={busy} onPress={onClose} hitSlop={10} style={{ padding: 8 }}><X size={22} color={colors.ink} /></Pressable></View>{subtitle ? <Text style={[ui.muted, { marginTop: -14 }]}>{subtitle}</Text> : null}{children}</ScrollView></View></SafeAreaView></Modal>;
}
export function messageOf(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
  return 'Something went wrong. Please try again.';
}
