import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View, useWindowDimensions } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, colors, ErrorMessage, ui } from '../components/ui';
import { useRepository } from '../data/RepositoryProvider';
import { SharedEntryCard } from './SharedEntryCard';
import { SharedEntryDetail } from './SharedEntryDetail';
import type { CollectorProfile, SharedEntry, VisibleCollection } from './types';

export function VisibleCollectionScreen({ collectionId, onClose }: { collectionId: string; onClose: () => void }) {
  const repository = useRepository(); const { width } = useWindowDimensions(); const columns = width >= 1000 ? 4 : width >= 650 ? 3 : 2;
  const [data, setData] = useState<VisibleCollection | null>(null); const [selected, setSelected] = useState<SharedEntry | null>(null); const [owner, setOwner] = useState<CollectorProfile | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  useEffect(() => { let active = true; setLoading(true); void repository.readVisibleCollection(collectionId).then(value => { if (active) setData(value); if (value) void repository.getCollector(value.collection.creator.publisherId).then(profile => { if (active) setOwner(profile); }); }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Collection unavailable.'); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [collectionId, repository]);
  function updateEntry(next: SharedEntry) { setData(current => current ? { ...current, entries: { ...current.entries, items: current.entries.items.map(item => item.id === next.id ? next : item) } } : current); setSelected(current => current?.id === next.id ? next : current); }
  const entries = data?.entries.items ?? [];
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }}><View style={[ui.row, { padding: 16, borderBottomWidth: 1, borderColor: colors.line }]}><Button title="Back" icon={ArrowLeft} secondary onPress={onClose} /></View><FlatList key={columns} data={entries} keyExtractor={entry => entry.id} numColumns={columns} contentContainerStyle={{ padding: width >= 900 ? 32 : 16, flexGrow: 1 }} ListHeaderComponent={<View style={{ paddingBottom: 16, gap: 5 }}>{data ? <><Text style={[ui.muted, { fontSize: 12 }]}>Shared collection</Text><Text style={ui.title}>{data.collection.name}</Text><Text style={ui.muted}>{data.visibleItemCount} {data.visibleItemCount === 1 ? 'item' : 'items'}</Text></> : null}<ErrorMessage message={error} /></View>} renderItem={({ item }) => <View style={{ width: `${100 / columns}%`, padding: 7 }}><SharedEntryCard entry={item} accessRevision={0} onOpen={() => setSelected(item)} onOpenCollector={() => undefined} onLikeChanged={updateEntry} /></View>} ListEmptyComponent={loading ? <ActivityIndicator color={colors.green} style={{ margin: 30 }} /> : null} />{selected ? <SharedEntryDetail entry={selected} collector={owner} accessRevision={0} onClose={() => setSelected(null)} onOpenCollection={() => undefined} showCollectionButton={false} onEntryChanged={updateEntry} /> : null}</SafeAreaView>;
}
