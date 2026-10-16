import React from 'react';
import { Text } from 'react-native';
import { Heart } from 'lucide-react-native';
import type { PublicEntryCard } from '../domain/models';
import { EntryMetaRow } from '../components/EntryMetaRow';
import { IconActionButton } from '../components/IconActionButton';
import { ui } from '../components/ui';
import { formatEntryPostDate } from '../domain/postDates';
import { LikeButton } from './LikeButton';
import { FollowButton } from './FollowButton';
import { useSocialProfile } from './SocialProfileProvider';

type Entry = Pick<PublicEntryCard, 'id' | 'creator' | 'publisherId' | 'relationship' | 'likes' | 'postDate'>;
export function PublicEntryMeta({ entry, onChange }: { entry: Entry; onChange: (patch: Partial<Entry>) => void }) {
  const social = useSocialProfile();
  const dateText = entry.postDate ? formatEntryPostDate(entry.postDate) : undefined;
  if (!entry.creator) return dateText ? <Text style={[ui.muted, { fontSize: 12 }]}>{dateText}</Text> : null;
  const own = social.profile?.publisherId === entry.creator.publisherId;
  return <EntryMetaRow username={entry.creator.username} dateText={dateText}>
    {entry.likes ? own ? <IconActionButton label={`${entry.likes.count} likes`} icon={Heart} count={entry.likes.count} onPress={() => undefined} disabled /> : <LikeButton key={entry.id} variant="compact" itemId={entry.id} value={entry.likes} onChanged={likes => onChange({ likes })} /> : null}
    {!own && entry.relationship && social.capabilities.socialWritesEnabled ? <FollowButton key={entry.creator.publisherId} variant="compact" collector={{ ...entry.creator, relationship: entry.relationship }} onChanged={relationship => onChange({ relationship })} /> : null}
  </EntryMetaRow>;
}
