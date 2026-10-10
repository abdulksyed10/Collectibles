import React, { useEffect, useState } from 'react';
import { Heart } from 'lucide-react-native';
import { Text, View } from 'react-native';
import { Button, ErrorMessage, colors, ui } from '../components/ui';
import { useRepository } from '../data/RepositoryProvider';
import { useSocialProfile } from './SocialProfileProvider';
import type { LikeState } from './types';

type Props = { itemId: string; value: LikeState; disabled?: boolean; onChanged?: (value: LikeState) => void };

export function LikeButton({ itemId, value, disabled, onChanged }: Props) {
  const repository = useRepository();
  const social = useSocialProfile();
  const [state, setState] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setState(value); }, [value]);
  if (!social.capabilities.likesEnabled) return state.count ? <Text style={[ui.muted, { fontSize: 12 }]}>{state.count} {state.count === 1 ? 'like' : 'likes'}</Text> : null;
  async function toggle() {
    const desired = !state.likedByMe;
    const previous = state;
    const next = { count: Math.max(0, state.count + (desired ? 1 : -1)), likedByMe: desired };
    setState(next); setBusy(true); setError('');
    try { await repository.setItemLiked(itemId, desired); onChanged?.(next); }
    catch (reason) { setState(previous); setError(reason instanceof Error ? reason.message : 'Unable to update this like. Try again.'); }
    finally { setBusy(false); }
  }
  return <View style={{ gap: 5 }}><Button title={`${state.likedByMe ? 'Liked' : 'Like'}${state.count ? ` · ${state.count}` : ''}`} secondary={!state.likedByMe} icon={Heart} onPress={() => { void toggle(); }} loading={busy} disabled={disabled || busy} /><ErrorMessage message={error} /></View>;
}
