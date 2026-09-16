import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, Pressable, RefreshControl, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { ArrowLeft, Package } from 'lucide-react-native';
import type { CollectionRepository, SharedCollectionPage } from '../domain/models';
import { publicPhotoUrl } from '../lib/sharing';
import { Brand, Button, colors, ErrorMessage, fonts, messageOf, Sheet, ui } from '../components/ui';

type SharedItem = SharedCollectionPage['items'][number];
type Photo = { full: string; thumb: string };

export function SharedCollectionScreen({ collectionId, repository, onBack, demo = false }: { collectionId: string; repository: CollectionRepository; onBack: () => void; demo?: boolean }) {
  const { width } = useWindowDimensions();
  const columns = width >= 1100 ? 4 : width >= 650 ? 3 : 2;
  const [collection, setCollection] = useState<SharedCollectionPage['collection'] | null>(null);
  const [items, setItems] = useState<SharedItem[]>([]);
  const [photos, setPhotos] = useState<Record<string, Photo>>({});
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<SharedItem | null>(null);
  const [failedPhotos, setFailedPhotos] = useState<Set<string>>(new Set());
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const pageRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const refresh = useCallback(() => setRevision(n => n + 1), []);

  const loadPage = useCallback(async (page: number) => {
    const result = await repository.readSharedCollection(collectionId, page);
    const nextPhotos: Record<string, Photo> = {};
    if (demo) {
      // The isolated demo has no public server; use only this projection's images.
      const images = await repository.readImages(result.items.filter(i => i.hasPhoto).map(i => i.id));
      for (const image of images) nextPhotos[image.itemId] = { full: image.url, thumb: image.thumbnailUrl };
    } else {
      for (const item of result.items.filter(i => i.hasPhoto)) nextPhotos[item.id] = { full: publicPhotoUrl(collectionId, item.id, 'full'), thumb: publicPhotoUrl(collectionId, item.id, 'thumb') };
    }
    return { result, nextPhotos };
  }, [repository, collectionId, demo]);

  useEffect(() => {
    const request = ++generation.current;
    setLoading(true); setError(''); setCollection(null); setItems([]); setPhotos({}); setSelected(null); setFailedPhotos(new Set());
    pageRef.current = 0; loadingMoreRef.current = false; setMoreLoading(false);
    void loadPage(0).then(({ result, nextPhotos }) => {
      if (request !== generation.current) return;
      setCollection(result.collection); setItems(result.items); setPhotos(nextPhotos); setTotal(result.total); setHasMore(result.hasMore);
    }).catch(error => { if (request === generation.current) setError(messageOf(error)); })
      .finally(() => { if (request === generation.current) setLoading(false); });
    return () => { generation.current++; };
  }, [loadPage, revision]);

  useEffect(() => {
    // Recheck open shared views on return and periodically so unpublished data
    // does not remain on screen indefinitely. Every photo request also checks.
    const timer = setInterval(refresh, 60_000);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => { clearInterval(timer); listener.remove(); };
  }, [refresh]);

  async function loadMore() {
    if (loading || !hasMore || loadingMoreRef.current) return;
    const request = generation.current;
    loadingMoreRef.current = true; setMoreLoading(true);
    try {
      const { result, nextPhotos } = await loadPage(pageRef.current + 1);
      if (request !== generation.current) return;
      pageRef.current++;
      setCollection(result.collection); setItems(current => { const seen = new Set(current.map(i => i.id)); return [...current, ...result.items.filter(i => !seen.has(i.id))]; });
      setPhotos(current => ({ ...current, ...nextPhotos })); setHasMore(result.hasMore); setTotal(result.total);
    } catch (error) {
      if (request === generation.current) { setCollection(null); setItems([]); setPhotos({}); setSelected(null); setError(messageOf(error)); }
    } finally { if (request === generation.current) { loadingMoreRef.current = false; setMoreLoading(false); } }
  }

  function photoFailed(id: string) { setFailedPhotos(current => new Set(current).add(id)); }
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }}>
    <View style={[ui.row, { padding: 16, justifyContent: 'space-between', borderBottomWidth: 1, borderColor: colors.line, backgroundColor: colors.card }]}>
      <Button title="Back" icon={ArrowLeft} secondary onPress={onBack} /><Brand small />
    </View>
    <FlatList key={columns} data={items} keyExtractor={item => item.id} numColumns={columns} style={{ flex: 1 }} contentContainerStyle={{ padding: 12, paddingBottom: 32, width: '100%', maxWidth: 1200, alignSelf: 'center' }} refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.green} />}
      ListHeaderComponent={<View style={{ gap: 12, padding: 8, paddingBottom: 20 }}>
        {demo ? <Text style={[ui.muted, { fontSize: 12 }]}>Shared view preview · Demo only</Text> : null}
        {collection ? <>
          <Text style={[ui.muted, { fontSize: 13 }]}>{collection.categoryName} · Public collection</Text>
          <Text style={{ fontFamily: fonts.bold, fontSize: 26, color: colors.ink }}>{collection.name}</Text>
          {collection.description ? <Text style={ui.text}>{collection.description}</Text> : null}
          <Text style={ui.muted}>{total} {total === 1 ? 'item' : 'items'}</Text>
        </> : null}
        <ErrorMessage message={error} />
        {error ? <Button title="Try again" secondary onPress={refresh} /> : null}
      </View>}
      renderItem={({ item }) => <View style={{ width: `${100 / columns}%`, padding: 6 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`View ${item.title}`} onPress={() => setSelected(item)} style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' }}>
          <View style={{ aspectRatio: 1, backgroundColor: colors.pale, alignItems: 'center', justifyContent: 'center' }}>
            {photos[item.id] && !failedPhotos.has(item.id) ? <Image key={`${item.id}-${revision}`} source={{ uri: photos[item.id]!.thumb }} cachePolicy="none" accessibilityLabel={item.title} style={{ width: '100%', height: '100%' }} contentFit="cover" onError={() => photoFailed(item.id)} /> : <View style={{ alignItems: 'center', gap: 8 }}><Package size={32} color={colors.muted} /><Text style={[ui.muted, { fontSize: 12 }]}>{item.hasPhoto ? 'Photo unavailable' : 'No photo'}</Text></View>}
          </View>
          <Text numberOfLines={2} style={{ fontFamily: fonts.medium, color: colors.ink, padding: 12 }}>{item.title}</Text>
        </Pressable>
      </View>}
      ListEmptyComponent={loading ? <ActivityIndicator color={colors.green} style={{ margin: 32 }} /> : collection && !error ? <Text style={[ui.muted, { padding: 8 }]}>No items.</Text> : null}
      ListFooterComponent={hasMore && collection ? <Button title="Load more items" secondary onPress={() => { void loadMore(); }} loading={moreLoading} style={{ margin: 8 }} /> : null}
    />
    {selected ? <Sheet title={selected.title} onClose={() => setSelected(null)}>
      {photos[selected.id] && !failedPhotos.has(selected.id) ? <Image source={{ uri: photos[selected.id]!.full }} cachePolicy="none" style={{ width: '100%', aspectRatio: 1 }} contentFit="contain" accessibilityLabel={selected.title} onError={() => photoFailed(selected.id)} /> : <Text style={ui.muted}>{selected.hasPhoto ? 'Photo unavailable' : 'No photo'}</Text>}
    </Sheet> : null}
  </SafeAreaView>;
}
