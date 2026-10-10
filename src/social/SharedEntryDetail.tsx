import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Package } from 'lucide-react-native';
import { Button, colors, Sheet, ui } from '../components/ui';
import { PublicSafetyControls } from '../components/PublicSafetyControls';
import { useRepository } from '../data/RepositoryProvider';
import { FollowButton } from './FollowButton';
import { LikeButton } from './LikeButton';
import { SharedEntryImage } from './SharedEntryImage';
import { useSocialProfile } from './SocialProfileProvider';
import type { CollectorProfile, SharedEntry } from './types';

type Props = { entry: SharedEntry; collector: CollectorProfile | null; accessRevision: number; onClose: () => void; onOpenCollection: () => void; showCollectionButton?: boolean; onEntryChanged?: (entry: SharedEntry) => void; onReported?: () => void; onBlocked?: () => void };
export function SharedEntryDetail({ entry, collector, accessRevision, onClose, onOpenCollection, showCollectionButton = true, onEntryChanged, onReported, onBlocked }: Props) {
  const repository = useRepository();
  const social = useSocialProfile();
  const [available, setAvailable] = useState(true);
  const markUnavailable = useCallback(() => setAvailable(false), []);
  useEffect(() => { setAvailable(true); }, [entry.id, accessRevision]);
  return <Sheet title={entry.title} onClose={onClose}>
    <View style={{ aspectRatio: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.pale, alignItems: 'center', justifyContent: 'center' }}>
      {entry.hasPhoto && available ? <SharedEntryImage itemId={entry.id} collectionId={entry.collectionId} audience={entry.audience} size="full" accessRevision={accessRevision} style={{ width: '100%', height: '100%' }} accessibilityLabel={entry.title} onUnavailable={markUnavailable} /> : <View style={{ alignItems: 'center', gap: 8 }}><Package size={48} color={colors.muted} /><Text style={ui.muted}>{entry.hasPhoto ? 'Photo unavailable' : 'No photo'}</Text></View>}
    </View>
    <View style={{ gap: 4 }}><Text style={[ui.muted, { fontSize: 12 }]}>{entry.audience === 'friends' ? 'Friends only' : 'Public'}</Text><Text style={ui.text}>{entry.collectionName}</Text><Text style={ui.muted}>Shared by @{entry.creator.username ?? 'collector'}</Text></View>
    <LikeButton itemId={entry.id} value={entry.likes} onChanged={likes => onEntryChanged?.({ ...entry, likes })} />
    {collector ? <FollowButton collector={collector} /> : null}
    {showCollectionButton ? <Button title="View full collection" secondary onPress={onOpenCollection} /> : null}
    <PublicSafetyControls repository={repository} collectionId={entry.collectionId} itemId={entry.id} itemLabel="this shared entry" sharedPublisherId={entry.publisherId} signedIn={!social.guest} isOwnContent={social.profile?.publisherId === entry.publisherId} onReported={onReported} onBlocked={onBlocked ?? onClose} />
  </Sheet>;
}
