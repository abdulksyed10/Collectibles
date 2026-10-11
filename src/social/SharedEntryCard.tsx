import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Heart, Package } from 'lucide-react-native';
import { colors, fonts, ui } from '../components/ui';
import { IconActionButton } from '../components/IconActionButton';
import { PostCard } from '../components/PostCard';
import type { Relationship, SharedEntry } from './types';
import { SharedEntryImage } from './SharedEntryImage';
import { LikeButton } from './LikeButton';
import { FollowButton } from './FollowButton';
import { useSocialProfile } from './SocialProfileProvider';

type Props = { entry: SharedEntry; accessRevision: number; onOpen: () => void; onOpenCollector?: () => void; onLikeChanged?: (entry: SharedEntry) => void; onRelationshipChanged?: (publisherId: string, relationship: Relationship) => void; onSignIn?: () => void };
export function SharedEntryCard({ entry, accessRevision, onOpen, onOpenCollector, onLikeChanged, onRelationshipChanged, onSignIn }: Props) {
  const social = useSocialProfile();
  const ownEntry = social.profile?.publisherId === entry.publisherId;
  const handle = entry.creator.username ?? 'collector';
  const footer = <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, minWidth: 0 }}>
    {onOpenCollector ? <Pressable accessibilityRole="button" accessibilityLabel={`View ${handle}`} onPress={onOpenCollector} hitSlop={6} style={{ flexGrow: 1, flexShrink: 1, minWidth: 96, minHeight: 48, justifyContent: 'center' }}><Text numberOfLines={1} style={{ color: colors.green, fontFamily: fonts.medium, fontSize: 12 }}>@{handle}{entry.audience === 'friends' ? ' · Friends only' : ''}</Text></Pressable> : <Text numberOfLines={1} style={{ color: colors.green, fontFamily: fonts.medium, fontSize: 12, flexGrow: 1, flexShrink: 1, minWidth: 96 }}>@{handle}{entry.audience === 'friends' ? ' · Friends only' : ''}</Text>}
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {!ownEntry && onOpenCollector ? <FollowButton variant="compact" collector={{ publisherId: entry.creator.publisherId, username: entry.creator.username, relationship: entry.relationship }} onChanged={relationship => onRelationshipChanged?.(entry.publisherId, relationship)} onSignIn={onSignIn} /> : null}
      {ownEntry ? <IconActionButton label={`${entry.likes.count} ${entry.likes.count === 1 ? 'like' : 'likes'}`} icon={Heart} count={entry.likes.count} onPress={() => undefined} disabled /> : <LikeButton variant="compact" itemId={entry.id} value={entry.likes} onChanged={likes => onLikeChanged?.({ ...entry, likes })} onSignIn={onSignIn} />}
    </View>
  </View>;
  return <PostCard title={entry.title} subtitle={entry.collectionName} onOpen={onOpen} footer={footer} media={entry.hasPhoto ? <SharedEntryImage itemId={entry.id} collectionId={entry.collectionId} audience={entry.audience} size="thumb" accessRevision={accessRevision} style={{ width: '100%', height: '100%' }} accessibilityLabel={entry.title} /> : <Package size={40} color={colors.muted} strokeWidth={1.2} />} />;
}
