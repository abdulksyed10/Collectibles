import React from 'react';
import { View } from 'react-native';
import { Sparkles, Mountain, Flower2, Moon, Star, Leaf } from 'lucide-react-native';
import { colors } from './ui';
export function PinArtwork({ compact = false }: { compact?: boolean }) {
  const size = compact ? 160 : 290;
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: size, height: size * 0.83, alignSelf: 'center' }}>
    <View style={{ position: 'absolute', inset: 14, backgroundColor: '#E4E8DE', borderRadius: size, transform: [{ rotate: '-12deg' }] }} />
    <View style={{ position: 'absolute', left: size * 0.12, top: size * 0.16, width: size * 0.38, height: size * 0.48, backgroundColor: '#F2B26F', borderRadius: size * 0.19, borderWidth: 5, borderColor: '#C68C42', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-16deg' }] }}><Mountain size={size * 0.24} color="#5A593A" strokeWidth={1.5} /></View>
    <View style={{ position: 'absolute', right: size * 0.1, top: size * 0.28, width: size * 0.39, height: size * 0.39, backgroundColor: '#476B58', borderWidth: 5, borderColor: '#D8BA77', borderRadius: 22, transform: [{ rotate: '16deg' }], alignItems: 'center', justifyContent: 'center' }}><Flower2 size={size * 0.28} color="#F4DEB5" strokeWidth={1.4} /></View>
    <View style={{ position: 'absolute', right: size * 0.16, top: size * 0.06 }}><Star size={size * 0.12} color="#BB6145" fill="#BB6145" strokeWidth={1} /></View>
    <View style={{ position: 'absolute', left: size * 0.4, bottom: 0, backgroundColor: '#F7F2E4', borderRadius: size * 0.12, borderWidth: 3, borderColor: '#C5AA70', padding: size * 0.035, transform: [{ rotate: '-15deg' }] }}><Moon size={size * 0.12} color={colors.ink} fill="#D8BC6E" strokeWidth={1.3} /></View>
    <View style={{ position: 'absolute', top: size * 0.02, left: size * 0.03 }}><Sparkles size={size * 0.09} color="#A9B7A2" /></View>
  </View>;
}
