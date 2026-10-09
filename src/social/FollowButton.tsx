import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { UserMinus, UserPlus } from 'lucide-react-native';
import { Button, ErrorMessage, ui } from '../components/ui';
import { useRepository } from '../data/RepositoryProvider';
import { followAction, needsFriendConfirmation } from './relationshipActions';
import type { CollectorProfile, Relationship } from './types';

type FollowButtonProps = { collector: CollectorProfile; onChanged?: (relationship: Relationship) => void };

export function FollowButton({ collector, onChanged }: FollowButtonProps) {
  const repository = useRepository();
  const [relationship, setRelationship] = useState(collector.relationship);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setRelationship(collector.relationship); setConfirming(false); }, [collector]);
  const action = followAction(relationship);

  async function update(following: boolean) {
    setBusy(true); setError('');
    try {
      const next = await repository.setFollowing(collector.publisherId, following);
      setRelationship(next);
      setConfirming(false);
      onChanged?.(next);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to update following. Try again.'); }
    finally { setBusy(false); }
  }

  if (action === 'unavailable') return <Text style={[ui.muted, { fontSize: 12 }]}>{relationship.blockedByMe ? 'Blocked' : 'Unavailable'}</Text>;
  if (confirming) return <View style={{ gap: 8 }}><Text style={[ui.muted, { fontSize: 12 }]}>Following each other lets you both see existing and future Friends-only items.</Text><View style={{ flexDirection: 'row', gap: 8 }}><Button title="Cancel" secondary onPress={() => setConfirming(false)} disabled={busy} style={{ flex: 1 }} /><Button title="Follow back" icon={UserPlus} onPress={() => { void update(true); }} loading={busy} style={{ flex: 1 }} /></View><ErrorMessage message={error} /></View>;
  return <View style={{ gap: 6 }}><Button title={action === 'unfollow' ? 'Following' : action === 'follow-back' ? 'Follow back' : 'Follow'} secondary={action === 'unfollow'} icon={action === 'unfollow' ? UserMinus : UserPlus} onPress={() => { if (needsFriendConfirmation(relationship)) setConfirming(true); else { void update(action !== 'unfollow'); } }} loading={busy} /><ErrorMessage message={error} /></View>;
}