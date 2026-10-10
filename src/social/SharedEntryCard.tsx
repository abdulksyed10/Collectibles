import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Package } from 'lucide-react-native';
import { colors, fonts, ui } from '../components/ui';
import type { SharedEntry } from './types';
import { SharedEntryImage } from './SharedEntryImage';
import { LikeButton } from './LikeButton';
import { useSocialProfile } from './SocialProfileProvider';

type Props = { entry: SharedEntry; accessRevision: number; onOpen: () => void; onOpenCollector?: () => void; onLikeChanged?: (entry: SharedEntry) => void; onSignIn?: () => void };
export function SharedEntryCard({ entry, accessRevision, onOpen, onOpenCollector, onLikeChanged, onSignIn }: Props) {
  const social = useSocialProfile();
  const ownEntry = social.profile?.publisherId === entry.publisherId;
  return <View style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 16, backgroundColor: colors.card, overflow: 'hidden' }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`View ${entry.title}`} onPress={onOpen} style={({ pressed }) => ({ opacity: pressed ? 0.84 : 1 })}>
      <View style={{ aspectRatio: 1, backgroundColor: colors.pale, alignItems: 'center', justifyContent: 'center' }}>
        {entry.hasPhoto ? <SharedEntryImage itemId={entry.id} collectionId={entry.collectionId} audience={entry.audience} size="thumb" accessRevision={accessRevision} style={{ width: '100%', height: '100%' }} accessibilityLabel={entry.title} /> : <Package size={40} color={colors.muted} strokeWidth={1.2} />}
      </View>
      <View style={{ padding: 12, gap: 4 }}><Text numberOfLines={2} style={{ color: colors.ink, fontFamily: fonts.bold }}>{entry.title}</Text><Text numberOfLines={1} style={[ui.muted, { fontSize: 12 }]}>{entry.collectionName}</Text></View>
    </Pressable>
    <View style={{ paddingHorizontal: 12, paddingBottom: 12, gap: 9 }}>
      {onOpenCollector ? <Pressable accessibilityRole="button" accessibilityLabel={`View ${entry.creator.username ?? 'collector'}`} onPress={onOpenCollector} hitSlop={6}><Text style={{ color: colors.green, fontFamily: fonts.medium, fontSize: 12 }}>@{entry.creator.username ?? 'collector'} · {entry.audience === 'friends' ? 'Friends only' : 'Public'}</Text></Pressable> : <Text style={{ color: colors.green, fontFamily: fonts.medium, fontSize: 12 }}>@{entry.creator.username ?? 'collector'} · {entry.audience === 'friends' ? 'Friends only' : 'Public'}</Text>}
      {ownEntry ? <Text style={[ui.muted, { fontSize: 12 }]}>{entry.likes.count} {entry.likes.count === 1 ? 'like' : 'likes'}</Text> : <LikeButton itemId={entry.id} value={entry.likes} onChanged={likes => onLikeChanged?.({ ...entry, likes })} onSignIn={onSignIn} />}
    </View>
  </View>;
}
