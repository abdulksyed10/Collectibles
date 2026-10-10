import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, View, useWindowDimensions } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, colors, ErrorMessage, ui } from '../components/ui';
import { PublicSafetyControls } from '../components/PublicSafetyControls';
import { useRepository } from '../data/RepositoryProvider';
import { subscribeSocialInvalidation } from './events';
import { SharedEntryCard } from './SharedEntryCard';
import { SharedEntryDetail } from './SharedEntryDetail';
import { appendUniqueEntries, createSharedRequestGate } from './sharedLoader';
import type { CollectorProfile, SharedEntry, VisibleCollection } from './types';
import { useSocialProfile } from './SocialProfileProvider';
import { useRestrictedRevalidation } from './useRestrictedRevalidation';

export function VisibleCollectionScreen({ collectionId, onClose }: { collectionId: string; onClose: () => void }) {
  const repository = useRepository();
  const social = useSocialProfile();
  const { width } = useWindowDimensions();
  const columns = width >= 1000 ? 4 : width >= 650 ? 3 : 2;
  const [data, setData] = useState<VisibleCollection | null>(null);
  const [selected, setSelected] = useState<SharedEntry | null>(null);
  const [owner, setOwner] = useState<CollectorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const requests = useRef(createSharedRequestGate());
  const refresh = useCallback(() => setRevision(value => value + 1), []);

  useEffect(() => subscribeSocialInvalidation(reason => { if (reason !== 'like') refresh(); }), [refresh]);
  useRestrictedRevalidation(refresh);
  useEffect(() => {
    let active = true;
    const request = requests.current.beginRefresh();
    setLoading(true); setMoreLoading(false); setError(''); setData(null); setOwner(null); setSelected(null);
    void repository.readVisibleCollection(collectionId).then(async value => {
      if (!active || !requests.current.isCurrent(request)) return;
      if (!value) { setError('Collection unavailable.'); return; }
      setData(value);
      try {
        const profile = await repository.getCollector(value.collection.creator.publisherId);
        if (active && requests.current.isCurrent(request)) setOwner(profile);
      } catch { if (active && requests.current.isCurrent(request)) setOwner(null); }
    }).catch(reason => {
      if (active && requests.current.isCurrent(request)) setError(reason instanceof Error ? reason.message : 'Collection unavailable.');
    }).finally(() => { if (active && requests.current.isCurrent(request)) setLoading(false); });
    return () => { active = false; requests.current.invalidate(); };
  }, [collectionId, repository, revision]);

  async function loadMore() {
    const cursor = data?.entries.nextCursor;
    if (!cursor || !requests.current.beginMore()) return;
    const request = requests.current.current();
    setMoreLoading(true); setError('');
    try {
      const next = await repository.readVisibleCollection(collectionId, cursor);
      if (!requests.current.isCurrent(request)) return;
      if (!next) { setData(null); setSelected(null); setOwner(null); setError('Collection unavailable.'); return; }
      setData(current => current ? { ...next, entries: { items: appendUniqueEntries(current.entries.items, next.entries.items), nextCursor: next.entries.nextCursor } } : next);
    } catch (reason) {
      if (requests.current.isCurrent(request)) setError(reason instanceof Error ? reason.message : 'Unable to load more items.');
    } finally {
      if (requests.current.isCurrent(request)) { setMoreLoading(false); requests.current.endMore(); }
    }
  }

  function updateEntry(next: SharedEntry) {
    setData(current => current ? { ...current, entries: { ...current.entries, items: current.entries.items.map(item => item.id === next.id ? next : item) } } : current);
    setSelected(current => current?.id === next.id ? next : current);
  }
  const entries = data?.entries.items ?? [];
  const cursor = data?.entries.nextCursor ?? null;
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }}>
    <View style={[ui.row, { padding: 16, borderBottomWidth: 1, borderColor: colors.line }]}><Button title="Back" icon={ArrowLeft} secondary onPress={onClose} /></View>
    <FlatList key={columns} data={entries} keyExtractor={entry => entry.id} numColumns={columns} contentContainerStyle={{ padding: width >= 900 ? 32 : 16, flexGrow: 1 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.green} />}
      ListHeaderComponent={<View style={{ paddingBottom: 16, gap: 5 }}>{data ? <><Text style={[ui.muted, { fontSize: 12 }]}>Shared collection</Text><Text style={ui.title}>{data.collection.name}</Text><Text style={ui.muted}>{data.visibleItemCount} {data.visibleItemCount === 1 ? 'item' : 'items'}</Text><PublicSafetyControls repository={repository} collectionId={data.collection.id} itemLabel="this shared collection" sharedPublisherId={data.collection.creator.publisherId} signedIn={!social.guest} isOwnContent={social.profile?.publisherId === data.collection.creator.publisherId} onReported={refresh} onBlocked={onClose} /></> : null}<ErrorMessage message={error} />{error ? <Button title="Try again" secondary onPress={refresh} /> : null}</View>}
      renderItem={({ item }) => <View style={{ width: `${100 / columns}%`, padding: 7 }}><SharedEntryCard entry={item} accessRevision={revision} onOpen={() => setSelected(item)} onOpenCollector={() => undefined} onLikeChanged={updateEntry} /></View>}
      ListEmptyComponent={loading ? <ActivityIndicator color={colors.green} style={{ margin: 30 }} /> : null}
      ListFooterComponent={cursor ? <Button title="Load more" secondary onPress={() => { void loadMore(); }} loading={moreLoading} style={{ margin: 8 }} /> : null}
    />
    {selected ? <SharedEntryDetail entry={selected} collector={owner} accessRevision={revision} onClose={() => setSelected(null)} onOpenCollection={() => undefined} showCollectionButton={false} onEntryChanged={updateEntry} onReported={refresh} onBlocked={onClose} /> : null}
  </SafeAreaView>;
}
