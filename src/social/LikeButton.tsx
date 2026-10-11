import React, { useEffect, useRef, useState } from 'react';
import { Heart } from 'lucide-react-native';
import { Text, View } from 'react-native';
import { Button, ErrorMessage, ui } from '../components/ui';
import { IconActionButton } from '../components/IconActionButton';
import { useSocialProfile } from './SocialProfileProvider';
import type { LikeState } from './types';
import { compactLikePresentation } from './postActions';

type Props = { itemId: string; value: LikeState; disabled?: boolean; onChanged?: (value: LikeState) => void; onSignIn?: () => void; variant?: 'labeled' | 'compact' };

export function LikeButton({ itemId, value, disabled, onChanged, onSignIn, variant = 'labeled' }: Props) {
  const social = useSocialProfile();
  const [state, setState] = useState(() => social.likes.get(itemId) ?? value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const changed = useRef(onChanged);
  changed.current = onChanged;
  useEffect(() => { social.likes.sync(itemId, value); }, [itemId, social.likes, value]);
  useEffect(() => social.likes.subscribe(itemId, next => {
    setState(next);
    changed.current?.(next);
  }), [itemId, social.likes]);
  if (!social.capabilities.likesEnabled) return state.count ? <Text style={[ui.muted, { fontSize: 12 }]}>{state.count} {state.count === 1 ? 'like' : 'likes'}</Text> : null;
  if (social.guest) {
    if (onSignIn && variant === 'compact') return <IconActionButton label="Sign in to like" icon={Heart} onPress={onSignIn} count={state.count} />;
    return onSignIn ? <Button title={`Sign in to like${state.count ? ` · ${state.count}` : ''}`} secondary onPress={onSignIn} /> : state.count ? <Text style={[ui.muted, { fontSize: 12 }]}>{state.count} {state.count === 1 ? 'like' : 'likes'}</Text> : null;
  }
  async function toggle() {
    setBusy(true); setError('');
    try { await social.likes.toggle(itemId); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to update this like. Try again.'); }
    finally { setBusy(false); }
  }
  if (variant === 'compact') {
    const presentation = compactLikePresentation(state);
    return <View style={{ gap: 5 }}><IconActionButton label={presentation.label} icon={Heart} active={presentation.active} count={presentation.count} onPress={() => { void toggle(); }} busy={busy} disabled={disabled} /><ErrorMessage message={error} /></View>;
  }
  return <View style={{ gap: 5 }}><Button title={`${state.likedByMe ? 'Liked' : 'Like'}${state.count ? ` · ${state.count}` : ''}`} secondary={!state.likedByMe} icon={Heart} onPress={() => { void toggle(); }} loading={busy} disabled={disabled || busy} /><ErrorMessage message={error} /></View>;
}
