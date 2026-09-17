import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, RefreshControl, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { FolderHeart, Package } from 'lucide-react-native';
import type { PublicCollectionCard } from '../domain/models';
import { useRepository } from '../data/RepositoryProvider';
import { publicPhotoUrl } from '../lib/sharing';
import { Button, colors, ErrorMessage, fonts, messageOf, ui } from '../components/ui';

export function PublicCatalog({ onPrivate, onOpen, onManage, demo = false }: { onPrivate: () => void; onOpen: (collectionId: string) => void; onManage: (collectionId: string) => void; demo?: boolean }) {
  const repository = useRepository();
  const { width } = useWindowDimensions();
  const columns = width >= 1100 ? 4 : width >= 650 ? 3 : 2;
  const [collections, setCollections] = useState<PublicCollectionCard[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState('');
  const [failedPhotos, setFailedPhotos] = useState<Set<string>>(new Set());
  const [revision, setRevision] = useState(0);
  const pageRef = useRef(0);
  const requestRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const refresh = useCallback(() => setRevision(value => value + 1), []);

  useEffect(() => {
    const request = ++requestRef.current;
    pageRef.current = 0; loadingMoreRef.current = false;
    setLoading(true); setMoreLoading(false); setError(''); setFailedPhotos(new Set());
    void repository.listPublicCollections(0).then(page => {
      if (request !== requestRef.current) return;
      setCollections(page.collections); setTotal(page.total); setHasMore(page.hasMore);
    }).catch(reason => { if (request === requestRef.current) setError(messageOf(reason)); })
      .finally(() => { if (request === requestRef.current) setLoading(false); });
    return () => { requestRef.current++; };
  }, [repository, revision]);

  async function loadMore() {
    if (loading || !hasMore || loadingMoreRef.current || pageRef.current >= 20) return;
    const request = requestRef.current;
    loadingMoreRef.current = true; setMoreLoading(true); setError('');
    try {
      const page = await repository.listPublicCollections(pageRef.current + 1);
      if (request !== requestRef.current) return;
      pageRef.current++;
      setCollections(current => {
        const seen = new Set(current.map(collection => collection.id));
        return [...current, ...page.collections.filter(collection => !seen.has(collection.id))];
      });
      setTotal(page.total); setHasMore(page.hasMore);
    } catch (reason) {
      if (request === requestRef.current) setError(messageOf(reason));
    } finally {
      if (request === requestRef.current) { loadingMoreRef.current = false; setMoreLoading(false); }
    }
  }

  function photoUrl(collection: PublicCollectionCard) {
    if (demo || !collection.coverItemId) return undefined;
    try { return publicPhotoUrl(collection.id, collection.coverItemId, 'thumb'); }
    catch { return undefined; }
  }

  return <View style={{ flex: 1, width: '100%', maxWidth: 1200, alignSelf: 'center' }}>
    <FlatList key={columns} data={collections} keyExtractor={collection => collection.id} numColumns={columns} style={{ flex: 1 }} contentContainerStyle={{ padding: width >= 900 ? 32 : 16, paddingBottom: 48, flexGrow: 1 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.green} />}
      ListHeaderComponent={<View style={{ gap: 14, paddingBottom: 16 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable accessibilityRole="tab" accessibilityLabel="Private collections" accessibilityState={{ selected: false }} {...(Platform.OS === 'web' ? { 'aria-selected': false } : {})} onPress={onPrivate} style={{ minHeight: 48, minWidth: 100, flex: 1, borderBottomWidth: 1, borderBottomColor: colors.line, justifyContent: 'center', alignItems: 'center' }}><Text style={{ fontFamily: fonts.medium, color: colors.muted }}>Private</Text></Pressable>
          <Pressable accessibilityRole="tab" accessibilityLabel="Public collections" accessibilityState={{ selected: true }} {...(Platform.OS === 'web' ? { 'aria-selected': true } : {})} style={{ minHeight: 48, minWidth: 100, flex: 1, borderBottomWidth: 3, borderBottomColor: colors.green, justifyContent: 'center', alignItems: 'center' }}><Text style={{ fontFamily: fonts.bold, color: colors.green }}>Public</Text></Pressable>
        </View>
        <View style={[ui.row, { justifyContent: 'space-between' }]}><Text style={[ui.title, { fontSize: width >= 900 ? 36 : 30, lineHeight: width >= 900 ? 40 : 34 }]}>Public collections</Text><Text style={ui.muted}>{loading ? '' : total}</Text></View>
        <ErrorMessage message={error} />
        {error ? <Button title="Try again" secondary onPress={refresh} /> : null}
      </View>}
      renderItem={({ item, index }) => {
        const image = photoUrl(item);
        const imageFailed = failedPhotos.has(item.id);
        return <View style={{ width: `${100 / columns}%`, padding: 7 }}>
          <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 16, overflow: 'hidden' }}>
            <View style={{ aspectRatio: 1.18, backgroundColor: colors.pale, alignItems: 'center', justifyContent: 'center' }}>
              {image && !imageFailed ? <Image key={`${item.id}-${revision}`} source={{ uri: image }} cachePolicy="none" style={{ width: '100%', height: '100%' }} contentFit="cover" accessibilityLabel={`${item.name} cover`} onError={() => setFailedPhotos(current => new Set(current).add(item.id))} /> : <FolderHeart size={42} color={index % 2 ? '#82967C' : '#8BA1AA'} strokeWidth={1.2} />}
            </View>
            <View style={{ padding: 13, gap: 6 }}>
              <Text numberOfLines={1} style={[ui.muted, { fontSize: 12 }]}>{item.categoryName}</Text>
              <Text numberOfLines={2} style={{ fontFamily: fonts.bold, fontSize: 15, color: colors.ink }}>{item.name}</Text>
              {item.description ? <Text numberOfLines={2} style={[ui.muted, { fontSize: 13, lineHeight: 18 }]}>{item.description}</Text> : null}
              <Text style={[ui.muted, { fontSize: 12 }]}>{item.itemCount} {item.itemCount === 1 ? 'item' : 'items'}</Text>
              <Button title="View collection" secondary onPress={() => onOpen(item.id)} />
              {item.isOwner ? <Button title="Manage" secondary onPress={() => onManage(item.id)} /> : null}
            </View>
          </View>
        </View>;
      }}
      ListEmptyComponent={loading ? <View style={{ alignItems: 'center', padding: 36 }}><ActivityIndicator color={colors.green} /></View> : !error ? <View style={{ alignItems: 'center', padding: 36, gap: 9 }}><Package size={36} color={colors.muted} strokeWidth={1.2} /><Text style={{ color: colors.ink, fontFamily: fonts.bold }}>No public collections yet</Text></View> : null}
      ListFooterComponent={hasMore ? <Button title="Load more collections" secondary onPress={() => { void loadMore(); }} loading={moreLoading} style={{ margin: 8 }} /> : null}
    />
  </View>;
}
