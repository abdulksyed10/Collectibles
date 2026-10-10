import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, RefreshControl, Text, View, useWindowDimensions } from 'react-native';
import { ArrowLeft, UserRound } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, colors, ErrorMessage, fonts, ui } from '../components/ui';
import { useRepository } from '../data/RepositoryProvider';
import { subscribeSocialInvalidation } from './events';
import { FollowButton } from './FollowButton';
import { SharedEntryCard } from './SharedEntryCard';
import { SharedEntryDetail } from './SharedEntryDetail';
import { appendUniqueEntries, createSharedRequestGate } from './sharedLoader';
import type { CollectorProfile, SharedEntry } from './types';
import { useRestrictedRevalidation } from './useRestrictedRevalidation';
import { VisibleCollectionScreen } from './VisibleCollectionScreen';
import { useSocialProfile } from './SocialProfileProvider';

export function CollectorProfileScreen({ publisherId, onClose, onSignIn }: { publisherId: string; onClose: () => void; onSignIn?: () => void }) {
  const repository = useRepository();
  const social = useSocialProfile();
  const { width } = useWindowDimensions();
  const columns = width >= 1000 ? 4 : width >= 650 ? 3 : 2;
  const [profile, setProfile] = useState<CollectorProfile | null>(null);
  const [entries, setEntries] = useState<SharedEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<SharedEntry | null>(null);
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const requests = useRef(createSharedRequestGate());
  const refresh = useCallback(() => setRevision(value => value + 1), []);

  useEffect(() => subscribeSocialInvalidation(reason => { if (reason !== 'like') refresh(); }), [refresh]);
  useRestrictedRevalidation(refresh);
  useEffect(() => {
    let active = true;
    const request = requests.current.beginRefresh();
    setLoading(true); setMoreLoading(false); setError(''); setProfile(null); setEntries([]); setCursor(null); setSelected(null);
    void Promise.all([repository.getCollector(publisherId), repository.listCollectorEntries(publisherId)]).then(([nextProfile, page]) => {
      if (!active || !requests.current.isCurrent(request)) return;
      if (!nextProfile) { setError('Collector unavailable.'); return; }
      setProfile(nextProfile); setEntries(page.items); setCursor(page.nextCursor);
    }).catch(reason => {
      if (active && requests.current.isCurrent(request)) setError(reason instanceof Error ? reason.message : 'Collector unavailable.');
    }).finally(() => { if (active && requests.current.isCurrent(request)) setLoading(false); });
    return () => { active = false; requests.current.invalidate(); };
  }, [publisherId, repository, revision]);

  async function loadMore() {
    if (!cursor || !requests.current.beginMore()) return;
    const request = requests.current.current();
    setMoreLoading(true); setError('');
    try {
      const page = await repository.listCollectorEntries(publisherId, cursor);
      if (!requests.current.isCurrent(request)) return;
      setEntries(current => appendUniqueEntries(current, page.items));
      setCursor(page.nextCursor);
    } catch (reason) {
      if (requests.current.isCurrent(request)) setError(reason instanceof Error ? reason.message : 'Unable to load more items.');
    } finally {
      if (requests.current.isCurrent(request)) { setMoreLoading(false); requests.current.endMore(); }
    }
  }

  function updateEntry(next: SharedEntry) {
    setEntries(current => current.map(item => item.id === next.id ? next : item));
    setSelected(current => current?.id === next.id ? next : current);
  }
  const handle = profile?.username ?? 'collector';
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }}>
    <View style={[ui.row, { padding: 16, justifyContent: 'space-between', borderBottomWidth: 1, borderColor: colors.line }]}><Button title="Back" icon={ArrowLeft} secondary onPress={onClose} />{onSignIn ? <Button title="Sign in" secondary onPress={onSignIn} /> : null}</View>
    <FlatList key={columns} data={entries} keyExtractor={entry => entry.id} numColumns={columns} contentContainerStyle={{ padding: width >= 900 ? 32 : 16, flexGrow: 1, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.green} />}
      ListHeaderComponent={<View style={{ gap: 12, paddingBottom: 18 }}><View style={[ui.row, { gap: 12 }]}><View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.pale, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.green, fontFamily: fonts.bold, fontSize: 20 }}>{handle[0]?.toUpperCase() ?? 'C'}</Text></View><View><Text style={[ui.title, { fontSize: 30 }]}>@{handle}</Text><Text style={ui.muted}>Collector</Text></View></View>{profile && profile.publisherId !== social.profile?.publisherId ? <FollowButton collector={profile} onChanged={relationship => setProfile(current => current ? { ...current, relationship } : current)} onSignIn={onSignIn} /> : null}<ErrorMessage message={error} />{error ? <Button title="Try again" secondary onPress={refresh} /> : null}</View>}
      renderItem={({ item }) => <View style={{ width: `${100 / columns}%`, padding: 7 }}><SharedEntryCard entry={item} accessRevision={revision} onOpen={() => setSelected(item)} onLikeChanged={updateEntry} onSignIn={onSignIn} /></View>}
      ListEmptyComponent={loading ? <ActivityIndicator color={colors.green} style={{ margin: 30 }} /> : !error ? <View style={{ alignItems: 'center', padding: 30, gap: 8 }}><UserRound size={38} color={colors.muted} /><Text style={ui.muted}>No shared items to show.</Text></View> : null}
      ListFooterComponent={cursor ? <Button title="Load more" secondary onPress={() => { void loadMore(); }} loading={moreLoading} style={{ margin: 8 }} /> : null}
    />
    {selected ? <SharedEntryDetail entry={selected} collector={profile} accessRevision={revision} onClose={() => setSelected(null)} onOpenCollection={() => { setCollectionId(selected.collectionId); setSelected(null); }} onEntryChanged={updateEntry} onReported={refresh} onSignIn={onSignIn} /> : null}
    {collectionId ? <Modal visible animationType="slide" onRequestClose={() => setCollectionId(null)}><VisibleCollectionScreen collectionId={collectionId} onClose={() => setCollectionId(null)} onSignIn={onSignIn} /></Modal> : null}
  </SafeAreaView>;
}
