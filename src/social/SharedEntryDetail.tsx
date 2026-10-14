import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Heart, Package } from 'lucide-react-native';
import { Button, colors, ui } from '../components/ui';
import { IconActionButton } from '../components/IconActionButton';
import { EntryMetaRow } from '../components/EntryMetaRow';
import { EntryViewer } from '../components/EntryViewer';
import { formatEntryPostDate } from '../domain/postDates';
import { PublicSafetyControls } from '../components/PublicSafetyControls';
import { useRepository } from '../data/RepositoryProvider';
import { FollowButton } from './FollowButton';
import { LikeButton } from './LikeButton';
import { SharedEntryImage } from './SharedEntryImage';
import { useSocialProfile } from './SocialProfileProvider';
import type { CollectorProfile, Relationship, SharedEntry } from './types';

type Props = { entry: SharedEntry; collector: CollectorProfile | null; accessRevision: number; onClose: () => void; onOpenCollection: () => void; onOpenCollector?: () => void; showCollectionButton?: boolean; onEntryChanged?: (entry: SharedEntry) => void; onRelationshipChanged?: (publisherId: string, relationship: Relationship) => void; onReported?: () => void; onBlocked?: () => void; onSignIn?: () => void };
export function SharedEntryDetail({ entry, collector, accessRevision, onClose, onOpenCollection, onOpenCollector, showCollectionButton = true, onEntryChanged, onRelationshipChanged, onReported, onBlocked, onSignIn }: Props) {
  const repository = useRepository();
  const social = useSocialProfile();
  const ownEntry = social.profile?.publisherId === entry.publisherId;
  const [available, setAvailable] = useState(true);
  const markUnavailable = useCallback(() => setAvailable(false), []);
  useEffect(() => { setAvailable(true); }, [entry.id, accessRevision]);
  return <EntryViewer title={entry.title} onClose={onClose} media={style => entry.hasPhoto && available ? <SharedEntryImage itemId={entry.id} collectionId={entry.collectionId} audience={entry.audience} size="full" accessRevision={accessRevision} style={style} accessibilityLabel={entry.title} onUnavailable={markUnavailable} /> : <View style={{ alignItems: 'center', gap: 8 }}><Package size={48} color={colors.muted} /><Text style={ui.muted}>{entry.hasPhoto ? 'Photo unavailable' : 'No photo'}</Text></View>}>
    <View style={{ gap: 4 }}><Text style={[ui.muted, { fontSize: 12 }]}>{entry.audience === 'friends' ? 'Friends only' : 'Public'}</Text><Text style={ui.text}>{entry.collectionName}</Text></View>
    <EntryMetaRow username={entry.creator.username} onOpenProfile={onOpenCollector} dateText={entry.postDate ? formatEntryPostDate(entry.postDate) : undefined}>
      {ownEntry ? <IconActionButton label={`${entry.likes.count} ${entry.likes.count === 1 ? 'like' : 'likes'}`} icon={Heart} count={entry.likes.count} onPress={() => undefined} disabled /> : <LikeButton variant="compact" itemId={entry.id} value={entry.likes} onChanged={likes => onEntryChanged?.({ ...entry, likes })} onSignIn={onSignIn} />}
      {collector && !ownEntry ? <FollowButton variant="compact" collector={collector} onChanged={relationship => onRelationshipChanged?.(entry.publisherId, relationship)} onSignIn={onSignIn} /> : null}
    </EntryMetaRow>
    {showCollectionButton ? <Button title="View full collection" secondary onPress={onOpenCollection} /> : null}
    <PublicSafetyControls repository={repository} collectionId={entry.collectionId} itemId={entry.id} itemLabel="this shared entry" sharedPublisherId={entry.publisherId} signedIn={!social.guest} isOwnContent={social.profile?.publisherId === entry.publisherId} onReported={onReported} onBlocked={onBlocked ?? onClose} />
  </EntryViewer>;
}
