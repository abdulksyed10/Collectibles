import { onPublicPreferencesChange } from '../lib/publisherPreferences';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Platform, Pressable, RefreshControl, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { FolderHeart, Package } from 'lucide-react-native';
import type { ItemImage, PublicEntryCard, PublicTopicCard } from '../domain/models';
import { useRepository } from '../data/RepositoryProvider';
import { publicPhotoUrl } from '../lib/sharing';
import { Button, colors, ErrorMessage, fonts, messageOf, Sheet, ui } from '../components/ui';
import { PublicSafetyControls } from '../components/PublicSafetyControls';
import { FollowButton } from '../social/FollowButton';
import { LikeButton } from '../social/LikeButton';
import { CollectorProfileScreen } from '../social/CollectorProfileScreen';

type ExploreView = 'entries' | 'collections';
type ExploreCard = PublicEntryCard | PublicTopicCard;

function isEntry(card: ExploreCard): card is PublicEntryCard {
  return 'collectionId' in card;
}
function cardKey(card: ExploreCard) { return isEntry(card) ? card.id : card.key; }

/** Public data is intentionally limited to entry cards and collection cards. */
export function PublicCatalog({ onLibrary, onFollowing, onOpenCollection, onOpenTopic, libraryLabel = 'My collections', demo = false, socialActions = false, ownPublisherId, onSignIn }: { onLibrary: () => void; onFollowing?: () => void; onOpenCollection: (collectionId: string) => void; onOpenTopic: (topicKey: string) => void; libraryLabel?: string; demo?: boolean; socialActions?: boolean; ownPublisherId?: string; onSignIn?: () => void }) {
  const repository = useRepository();
  const { width } = useWindowDimensions();
  const columns = width >= 1100 ? 4 : width >= 650 ? 3 : 2;
  const [view, setView] = useState<ExploreView>('entries');
  const [cards, setCards] = useState<ExploreCard[]>([]);
  const [photos, setPhotos] = useState<Record<string, ItemImage>>({});
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState('');
  const [failedPhotos, setFailedPhotos] = useState<Set<string>>(new Set());
  const [selectedEntry, setSelectedEntry] = useState<PublicEntryCard | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const pageRef = useRef(0);
  const requestRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => onPublicPreferencesChange(refresh), [refresh]);

  async function loadDemoPhotos(nextCards: ExploreCard[]) {
    if (!demo) return {};
    const ids = nextCards.flatMap(card => {
      if (isEntry(card)) return card.hasPhoto ? [card.id] : [];
      return card.coverItemId ? [card.coverItemId] : [];
    });
    if (!ids.length) return {};
    const images = await repository.readImages(ids);
    return Object.fromEntries(images.map(image => [image.itemId, image]));
  }

  async function getPage(pageNumber: number): Promise<{ cards: ExploreCard[]; total: number; hasMore: boolean }> {
    if (view === 'entries') {
      const page = await repository.listPublicEntries(pageNumber);
      return { cards: page.entries, total: page.total, hasMore: page.hasMore };
    }
    const page = await repository.listPublicTopics(pageNumber);
    return { cards: page.topics, total: page.total, hasMore: page.hasMore };
  }

  useEffect(() => {
    const request = ++requestRef.current;
    pageRef.current = 0; loadingMoreRef.current = false;
    setLoading(true); setMoreLoading(false); setError(''); setCards([]); setPhotos({}); setFailedPhotos(new Set());
    void (async () => {
      try {
        const page = await getPage(0);
        const nextPhotos = await loadDemoPhotos(page.cards);
        if (request !== requestRef.current) return;
        setCards(page.cards); setPhotos(nextPhotos); setTotal(page.total); setHasMore(page.hasMore);
      } catch (reason) {
        if (request === requestRef.current) setError(messageOf(reason));
      } finally {
        if (request === requestRef.current) setLoading(false);
      }
    })();
    return () => { requestRef.current++; };
  }, [repository, revision, view]);

  async function loadMore() {
    if (loading || !hasMore || loadingMoreRef.current || pageRef.current >= 20) return;
    const request = requestRef.current;
    loadingMoreRef.current = true; setMoreLoading(true); setError('');
    try {
      const page = await getPage(pageRef.current + 1);
      const nextPhotos = await loadDemoPhotos(page.cards);
      if (request !== requestRef.current) return;
      pageRef.current++;
      setCards(current => {
        const seen = new Set(current.map(cardKey));
        return [...current, ...page.cards.filter(card => !seen.has(cardKey(card)))];
      });
      setPhotos(current => ({ ...current, ...nextPhotos }));
      setTotal(page.total); setHasMore(page.hasMore);
    } catch (reason) {
      if (request === requestRef.current) setError(messageOf(reason));
    } finally {
      if (request === requestRef.current) { loadingMoreRef.current = false; setMoreLoading(false); }
    }
  }

  function photoUrl(card: ExploreCard) {
    const itemId = isEntry(card) ? (card.hasPhoto ? card.id : null) : card.coverItemId;
    const collectionId = isEntry(card) ? card.collectionId : card.coverCollectionId;
    if (!itemId || !collectionId) return undefined;
    if (demo) return photos[itemId]?.thumbnailUrl;
    try { return publicPhotoUrl(collectionId, itemId, 'thumb'); }
    catch { return undefined; }
  }

  const viewTitle = view === 'entries' ? 'Entries' : 'Collections';
  return <View style={{ flex: 1, width: '100%', maxWidth: 1200, alignSelf: 'center' }}>
    <FlatList key={`${view}-${columns}`} data={cards} keyExtractor={cardKey} numColumns={columns} style={{ flex: 1 }} contentContainerStyle={{ padding: width >= 900 ? 32 : 16, paddingBottom: 48, flexGrow: 1 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.green} />}
      ListHeaderComponent={<View style={{ gap: 14, paddingBottom: 16 }}>
        <View style={{ flexDirection: 'row', gap: 8, borderBottomWidth: 1, borderBottomColor: colors.line }}>
          <Pressable accessibilityRole="button" accessibilityLabel={libraryLabel} accessibilityState={{ selected: false }} {...(Platform.OS === 'web' ? { 'aria-pressed': false } : {})} onPress={onLibrary} style={{ minHeight: 48, paddingHorizontal: 14, justifyContent: 'center' }}><Text style={{ fontFamily: fonts.medium, color: colors.muted }}>{libraryLabel}</Text></Pressable>
          {socialActions && onFollowing ? <Pressable accessibilityRole="button" accessibilityLabel="Following" onPress={onFollowing} style={{ minHeight: 48, paddingHorizontal: 14, justifyContent: 'center' }}><Text style={{ fontFamily: fonts.medium, color: colors.muted }}>Following</Text></Pressable> : null}<Pressable accessibilityRole="button" accessibilityLabel="Explore" accessibilityState={{ selected: true }} {...(Platform.OS === 'web' ? { 'aria-pressed': true } : {})} style={{ minHeight: 48, paddingHorizontal: 14, justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: colors.green }}><Text style={{ fontFamily: fonts.bold, color: colors.green }}>Explore</Text></Pressable>
        </View>
        <View style={[ui.row, { justifyContent: 'space-between' }]}><Text style={[ui.title, { fontSize: width >= 900 ? 36 : 30, lineHeight: width >= 900 ? 40 : 34 }]}>Explore</Text><Text style={ui.muted}>{loading ? '' : total}</Text></View>
        <View accessibilityRole="tablist" style={[ui.row, { alignSelf: 'flex-start', gap: 8, backgroundColor: colors.pale, borderRadius: 12, padding: 4 }]}>
          {(['entries', 'collections'] as ExploreView[]).map(option => <Pressable key={option} accessibilityRole="tab" accessibilityLabel={`Explore ${option}`} accessibilityState={{ selected: view === option }} {...(Platform.OS === 'web' ? { 'aria-selected': view === option } : {})} onPress={() => setView(option)} style={{ minHeight: 40, paddingHorizontal: 13, justifyContent: 'center', borderRadius: 9, backgroundColor: view === option ? colors.card : 'transparent' }}><Text style={{ color: view === option ? colors.green : colors.muted, fontFamily: view === option ? fonts.bold : fonts.medium }}>{option === 'entries' ? 'Entries' : 'Collections'}</Text></Pressable>)}
        </View>
        <ErrorMessage message={error} />
        {error ? <Button title="Try again" secondary onPress={refresh} /> : null}
      </View>}
      renderItem={({ item, index }) => {
        const entry = isEntry(item); const image = photoUrl(item); const key = cardKey(item); const imageFailed = failedPhotos.has(key);
        const name = entry ? item.title : item.name;
        return <View style={{ width: `${100 / columns}%`, padding: 7 }}><Pressable accessibilityRole="button" accessibilityLabel={entry ? `View ${item.title}` : `View ${item.name} collection`} onPress={() => { if (entry) setSelectedEntry(item); else onOpenTopic(item.key); }} style={({ pressed }) => [{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 16, overflow: 'hidden', opacity: pressed ? 0.85 : 1 }]}>
          <View style={{ aspectRatio: 1.18, backgroundColor: colors.pale, alignItems: 'center', justifyContent: 'center' }}>
            {image && !imageFailed ? <Image key={`${key}-${revision}`} source={{ uri: image }} cachePolicy="none" style={{ width: '100%', height: '100%' }} contentFit="cover" accessibilityLabel={entry ? item.title : `${item.name} cover`} onError={() => setFailedPhotos(current => new Set(current).add(key))} /> : entry ? <Package size={42} color={index % 2 ? '#82967C' : '#8BA1AA'} strokeWidth={1.2} /> : <FolderHeart size={42} color={index % 2 ? '#82967C' : '#8BA1AA'} strokeWidth={1.2} />}
          </View>
          <View style={{ padding: 13, gap: 5 }}><Text numberOfLines={2} style={{ fontFamily: fonts.bold, fontSize: 15, color: colors.ink }}>{name}</Text><Text numberOfLines={1} style={[ui.muted, { fontSize: 12 }]}>{entry ? item.collectionName : `${item.itemCount} ${item.itemCount === 1 ? 'item' : 'items'} · ${item.collectionCount} ${item.collectionCount === 1 ? 'collection' : 'collections'}`}</Text></View>
        </Pressable>{entry && socialActions && item.creator ? <Pressable accessibilityRole="button" accessibilityLabel={`View ${item.creator.username ?? 'collector'}`} onPress={() => setProfileId(item.creator!.publisherId)} style={{ paddingHorizontal: 12, paddingTop: 2 }}><Text numberOfLines={1} style={{ color: colors.green, fontFamily: fonts.medium, fontSize: 12 }}>@{item.creator.username ?? 'collector'}</Text></Pressable> : null}{entry && socialActions && item.creator && item.relationship ? <View style={{ padding: 12, paddingTop: 8, gap: 8 }}>{item.publisherId !== ownPublisherId ? <FollowButton collector={{ publisherId: item.creator.publisherId, username: item.creator.username, relationship: item.relationship }} onChanged={relationship => setCards(current => current.map(card => isEntry(card) && card.id === item.id ? { ...card, relationship } : card))} /> : null}{item.likes ? item.publisherId === ownPublisherId ? <Text style={[ui.muted, { fontSize: 12 }]}>{item.likes.count} {item.likes.count === 1 ? 'like' : 'likes'}</Text> : <LikeButton itemId={item.id} value={item.likes} onChanged={likes => setCards(current => current.map(card => isEntry(card) && card.id === item.id ? { ...card, likes } : card))} /> : null}</View> : entry && onSignIn && item.creator ? <View style={{ padding: 12, paddingTop: 0, gap: 8 }}><Button title="Sign in to follow" secondary onPress={onSignIn} />{item.likes ? <Button title={`Sign in to like${item.likes.count ? ` · ${item.likes.count}` : ''}`} secondary onPress={onSignIn} /> : null}</View> : null}</View>;
      }}
      ListEmptyComponent={loading ? <View style={{ alignItems: 'center', padding: 36 }}><ActivityIndicator color={colors.green} /></View> : !error ? <View style={{ alignItems: 'center', padding: 36, gap: 9 }}><Package size={36} color={colors.muted} strokeWidth={1.2} /><Text style={{ color: colors.ink, fontFamily: fonts.bold }}>Nothing shared yet</Text><Text style={ui.muted}>Check back after collectors share entries.</Text></View> : null}
      ListFooterComponent={hasMore ? <Button title={`Load more ${viewTitle.toLowerCase()}`} secondary onPress={() => { void loadMore(); }} loading={moreLoading} style={{ margin: 8 }} /> : null}
    />
    {selectedEntry ? <Sheet title={selectedEntry.title} onClose={() => setSelectedEntry(null)}>
      {selectedEntry.hasPhoto ? <Image source={{ uri: demo ? photos[selectedEntry.id]?.url : publicPhotoUrl(selectedEntry.collectionId, selectedEntry.id, 'full') }} cachePolicy="none" style={{ width: '100%', aspectRatio: 1 }} contentFit="contain" accessibilityLabel={selectedEntry.title} onError={() => setFailedPhotos(current => new Set(current).add(selectedEntry.id))} /> : <View style={{ minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: 10 }}><Package size={44} color={colors.muted} /><Text style={ui.muted}>No photo</Text></View>}
      <Text style={ui.muted}>{selectedEntry.collectionName}</Text>
      {socialActions && selectedEntry.creator ? <Pressable accessibilityRole="button" accessibilityLabel={`View ${selectedEntry.creator.username ?? 'collector'}`} onPress={() => { setSelectedEntry(null); setProfileId(selectedEntry.creator!.publisherId); }}><Text style={{ color: colors.green, fontFamily: fonts.medium }}>@{selectedEntry.creator.username ?? 'collector'}</Text></Pressable> : null}
      {socialActions && selectedEntry.creator && selectedEntry.relationship && selectedEntry.publisherId !== ownPublisherId ? <FollowButton collector={{ publisherId: selectedEntry.creator.publisherId, username: selectedEntry.creator.username, relationship: selectedEntry.relationship }} onChanged={relationship => { setSelectedEntry(current => current ? { ...current, relationship } : current); setCards(current => current.map(card => isEntry(card) && card.id === selectedEntry.id ? { ...card, relationship } : card)); }} /> : null}
      {socialActions && selectedEntry.likes ? selectedEntry.publisherId === ownPublisherId ? <Text style={[ui.muted, { fontSize: 12 }]}>{selectedEntry.likes.count} {selectedEntry.likes.count === 1 ? 'like' : 'likes'}</Text> : <LikeButton itemId={selectedEntry.id} value={selectedEntry.likes} onChanged={likes => { setSelectedEntry(current => current ? { ...current, likes } : current); setCards(current => current.map(card => isEntry(card) && card.id === selectedEntry.id ? { ...card, likes } : card)); }} /> : null}
      <Button title="View full collection" secondary onPress={() => { const collectionId = selectedEntry.collectionId; setSelectedEntry(null); onOpenCollection(collectionId); }} />
      <PublicSafetyControls repository={repository} collectionId={selectedEntry.collectionId} itemId={selectedEntry.id} itemLabel="this entry" demo={demo} onBlocked={() => { setSelectedEntry(null); refresh(); }} />
    </Sheet> : null}
    {profileId ? <Modal visible animationType="slide" onRequestClose={() => setProfileId(null)}><CollectorProfileScreen publisherId={profileId} onClose={() => setProfileId(null)} /></Modal> : null}
  </View>;
}
