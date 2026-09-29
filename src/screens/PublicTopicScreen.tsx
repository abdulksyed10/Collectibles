import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { ArrowLeft, Package } from 'lucide-react-native';
import type { CollectionRepository, ItemImage, PublicEntryCard } from '../domain/models';
import { publicPhotoUrl } from '../lib/sharing';
import { Brand, Button, colors, ErrorMessage, fonts, messageOf, Sheet, ui } from '../components/ui';

type Photo = { full: string; thumb: string };

export function PublicTopicScreen({ topicKey, repository, onBack, onOpenCollection, demo = false }: { topicKey: string; repository: CollectionRepository; onBack: () => void; onOpenCollection: (collectionId: string) => void; demo?: boolean }) {
  const { width } = useWindowDimensions();
  const columns = width >= 1100 ? 4 : width >= 650 ? 3 : 2;
  const [name, setName] = useState('');
  const [entries, setEntries] = useState<PublicEntryCard[]>([]);
  const [photos, setPhotos] = useState<Record<string, Photo>>({});
  const [selected, setSelected] = useState<PublicEntryCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [failedPhotos, setFailedPhotos] = useState<Set<string>>(new Set());
  const pageRef = useRef(0);
  const requestRef = useRef(0);

  const load = useCallback(async (page: number) => {
    const result = await repository.readPublicTopic(topicKey, page);
    const nextPhotos: Record<string, Photo> = {};
    if (demo) {
      const images = await repository.readImages(result.entries.filter(entry => entry.hasPhoto).map(entry => entry.id));
      for (const image of images) nextPhotos[image.itemId] = { full: image.url, thumb: image.thumbnailUrl };
    } else {
      for (const entry of result.entries.filter(entry => entry.hasPhoto)) nextPhotos[entry.id] = { full: publicPhotoUrl(entry.collectionId, entry.id, 'full'), thumb: publicPhotoUrl(entry.collectionId, entry.id, 'thumb') };
    }
    return { result, nextPhotos };
  }, [demo, repository, topicKey]);

  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    const request = ++requestRef.current;
    pageRef.current = 0; setLoading(true); setError(''); setEntries([]); setPhotos({}); setSelected(null); setFailedPhotos(new Set());
    void load(0).then(({ result, nextPhotos }) => {
      if (request !== requestRef.current) return;
      setName(result.topic.name); setEntries(result.entries); setPhotos(nextPhotos); setTotal(result.total); setHasMore(result.hasMore);
    }).catch(reason => { if (request === requestRef.current) setError(messageOf(reason)); }).finally(() => { if (request === requestRef.current) setLoading(false); });
    return () => { requestRef.current++; };
  }, [load, revision]);
  async function loadMore() {
    if (moreLoading || !hasMore || pageRef.current >= 20) return;
    setMoreLoading(true);
    try {
      const { result, nextPhotos } = await load(pageRef.current + 1);
      pageRef.current++;
      setEntries(current => [...current, ...result.entries.filter(entry => !current.some(old => old.id === entry.id))]);
      setPhotos(current => ({ ...current, ...nextPhotos })); setTotal(result.total); setHasMore(result.hasMore);
    } catch (reason) { setError(messageOf(reason)); }
    finally { setMoreLoading(false); }
  }
  function photoFailed(id: string) { setFailedPhotos(current => new Set(current).add(id)); }
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }}>
    <View style={[ui.row, { padding: 16, justifyContent: 'space-between', borderBottomWidth: 1, borderColor: colors.line, backgroundColor: colors.card }]}><Button title="Back" icon={ArrowLeft} secondary onPress={onBack} /><Brand small /></View>
    <FlatList key={columns} data={entries} keyExtractor={entry => entry.id} numColumns={columns} contentContainerStyle={{ padding: 12, paddingBottom: 32, width: '100%', maxWidth: 1200, alignSelf: 'center' }} refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.green} />}
      ListHeaderComponent={<View style={{ gap: 8, padding: 8, paddingBottom: 20 }}><Text style={[ui.muted, { fontSize: 13 }]}>Explore collection</Text><Text style={{ fontFamily: fonts.bold, fontSize: 26, color: colors.ink }}>{name || 'Collection'}</Text>{total ? <Text style={ui.muted}>{total} {total === 1 ? 'item' : 'items'} from similarly named collections</Text> : null}<ErrorMessage message={error} />{error ? <Button title="Try again" secondary onPress={refresh} /> : null}</View>}
      renderItem={({ item }) => <View style={{ width: `${100 / columns}%`, padding: 6 }}><Pressable accessibilityRole="button" accessibilityLabel={`View ${item.title}`} onPress={() => setSelected(item)} style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' }}><View style={{ aspectRatio: 1, backgroundColor: colors.pale, alignItems: 'center', justifyContent: 'center' }}>{photos[item.id] && !failedPhotos.has(item.id) ? <Image key={`${item.id}-${revision}`} source={{ uri: photos[item.id]!.thumb }} cachePolicy="none" accessibilityLabel={item.title} style={{ width: '100%', height: '100%' }} contentFit="cover" onError={() => photoFailed(item.id)} /> : <Package size={32} color={colors.muted} />}</View><View style={{ padding: 12, gap: 3 }}><Text numberOfLines={2} style={{ fontFamily: fonts.medium, color: colors.ink }}>{item.title}</Text><Text numberOfLines={1} style={[ui.muted, { fontSize: 12 }]}>{item.collectionName}</Text></View></Pressable></View>}
      ListEmptyComponent={loading ? <ActivityIndicator color={colors.green} style={{ margin: 32 }} /> : null}
      ListFooterComponent={hasMore ? <Button title="Load more items" secondary onPress={() => { void loadMore(); }} loading={moreLoading} style={{ margin: 8 }} /> : null}
    />
    {selected ? <Sheet title={selected.title} onClose={() => setSelected(null)}>{photos[selected.id] && !failedPhotos.has(selected.id) ? <Image source={{ uri: photos[selected.id]!.full }} cachePolicy="none" style={{ width: '100%', aspectRatio: 1 }} contentFit="contain" accessibilityLabel={selected.title} onError={() => photoFailed(selected.id)} /> : <Text style={ui.muted}>{selected.hasPhoto ? 'Photo unavailable' : 'No photo'}</Text>}<Text style={ui.muted}>{selected.collectionName}</Text><Button title="View full collection" secondary onPress={() => { const collectionId = selected.collectionId; setSelected(null); onOpenCollection(collectionId); }} /></Sheet> : null}
  </SafeAreaView>;
}
