import React, { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Ban, Flag } from 'lucide-react-native';
import type { PublicReportReason } from '../domain/models';
import type { CollectionRepository } from '../domain/models';
import { PolicyLinks } from './PolicyLinks';
import { Button, colors, ErrorMessage, fonts, messageOf, ui } from './ui';
import { supabase } from '../lib/supabase';
import { blockSharedCollector, reportSharedContent } from '../social/moderation';

const reasons: Array<{ value: PublicReportReason; label: string }> = [
  { value: 'spam', label: 'Spam or misleading' },
  { value: 'sexual', label: 'Sexual content' },
  { value: 'violence', label: 'Violence or dangerous content' },
  { value: 'hate', label: 'Hate or discrimination' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'scam', label: 'Scam or fraud' },
  { value: 'privacy', label: 'Privacy concern' },
  { value: 'other', label: 'Other' },
];

export function PublicSafetyControls({
  repository,
  collectionId,
  itemId,
  itemLabel,
  demo = false,
  /** A social publisher enables signed-in safety actions for Friends-only content. */
  sharedPublisherId,
  signedIn,
  isOwnContent = false,
  onReported,
  onBlocked,
}: {
  repository: CollectionRepository;
  collectionId: string;
  itemId?: string;
  itemLabel: string;
  demo?: boolean;
  sharedPublisherId?: string;
  signedIn?: boolean;
  isOwnContent?: boolean;
  onReported?: () => void;
  onBlocked?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [canReport, setCanReport] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reason, setReason] = useState<PublicReportReason>('other');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [blockConfirm, setBlockConfirm] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    if (signedIn !== undefined) {
      setCanReport(signedIn);
      return () => { active = false; };
    }
    if (!supabase) return () => { active = false; };
    void supabase.auth.getSession().then(({ data }) => { if (active) setCanReport(Boolean(data.session)); }).catch(() => { if (active) setCanReport(false); });
    return () => { active = false; };
  }, [signedIn]);

  const canUseSignedInActions = signedIn ?? canReport;
  // Public visitors retain their device-local blocks. Friends-only content is
  // never available to visitors, so its safety actions must be authenticated.
  if (demo || isOwnContent || (sharedPublisherId && !canUseSignedInActions)) return null;

  async function report() {
    setBusy(true); setError(''); setMessage('');
    try {
      await reportSharedContent(repository, itemId ? { itemId, reason, details } : { collectionId, reason, details });
      setMessage('Report received. Shared content is reviewed after reports from five different members.');
      setShowReport(false); setDetails('');
      onReported?.();
    } catch (cause) { setError(messageOf(cause)); }
    finally { setBusy(false); }
  }

  async function block() {
    setBusy(true); setError(''); setMessage('');
    try {
      if (sharedPublisherId) {
        await blockSharedCollector(repository, sharedPublisherId);
      } else {
        const blocked = await repository.blockPublicCollection(collectionId);
        if (!blocked) throw new Error('This collection is no longer available.');
      }
      setMessage('Collector blocked. Their shared entries are now hidden for you.');
      setBlockConfirm(false);
      onBlocked?.();
    } catch (cause) { setError(messageOf(cause)); }
    finally { setBusy(false); }
  }

  if (!expanded) return <Button title="Report or block" secondary onPress={() => setExpanded(true)} />;
  return <View style={{ gap: 10, paddingTop: 4 }}>
    {message ? <Text accessibilityLiveRegion="polite" style={[ui.muted, { fontSize: 12 }]}>{message}</Text> : null}
    <ErrorMessage message={error} />
    {canUseSignedInActions && !showReport ? <Button title={itemId ? 'Report entry' : 'Report collection'} secondary icon={Flag} onPress={() => { setShowReport(true); setError(''); }} disabled={busy} /> : null}
    {!canUseSignedInActions ? <Text style={[ui.muted, { fontSize: 12 }]}>Sign in to report shared content.</Text> : null}
    {canUseSignedInActions && showReport ? <View style={{ gap: 10, padding: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 14, backgroundColor: colors.pale }}>
      <Text style={[ui.text, { fontFamily: fonts.bold }]}>Report {itemLabel}</Text>
      <Text style={[ui.muted, { fontSize: 12 }]}>Choose the reason that best fits. Please do not include private information.</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
        {reasons.map(option => <Pressable key={option.value} accessibilityRole="button" accessibilityLabel={option.label} accessibilityState={{ selected: reason === option.value }} onPress={() => setReason(option.value)} disabled={busy} style={{ minHeight: 38, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: reason === option.value ? colors.green : colors.line, backgroundColor: reason === option.value ? colors.card : 'transparent' }}><Text style={{ color: reason === option.value ? colors.green : colors.muted, fontSize: 12, fontFamily: reason === option.value ? fonts.bold : fonts.medium }}>{option.label}</Text></Pressable>)}
      </View>
      <TextInput accessibilityLabel="Optional report details" value={details} onChangeText={setDetails} editable={!busy} multiline maxLength={1000} placeholder="Optional details" placeholderTextColor={colors.muted} style={{ minHeight: 76, borderWidth: 1, borderColor: colors.line, borderRadius: 10, backgroundColor: colors.card, padding: 10, color: colors.ink, fontFamily: fonts.body, textAlignVertical: 'top' }} />
      <View style={ui.row}><Button title="Cancel" secondary onPress={() => setShowReport(false)} disabled={busy} style={{ flex: 1 }} /><Button title="Send report" icon={Flag} onPress={() => { void report(); }} loading={busy} style={{ flex: 1 }} /></View>
    </View> : null}
    {!blockConfirm ? <Button title="Block collector" secondary danger icon={Ban} onPress={() => { setBlockConfirm(true); setError(''); }} disabled={busy} /> : <View style={{ gap: 9, padding: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 14 }}><Text style={ui.text}>{sharedPublisherId ? 'Hide this collector’s current and future shared entries from your views?' : 'Hide this collector’s current and future shared entries from your Explore view?'}</Text><View style={ui.row}><Button title="Cancel" secondary onPress={() => setBlockConfirm(false)} disabled={busy} style={{ flex: 1 }} /><Button title="Block collector" danger icon={Ban} onPress={() => { void block(); }} loading={busy} style={{ flex: 1 }} /></View></View>}
    <Text style={[ui.muted, {fontSize:12}]}>{sharedPublisherId ? 'Blocking hides this collector’s shared entries for you and removes any follow relationship.' : 'Guest blocks are saved on this device. Signed-in blocks apply to your account.'}</Text><PolicyLinks /><Button title="Close actions" secondary onPress={() => setExpanded(false)} />
  </View>;
}
