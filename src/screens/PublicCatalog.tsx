import { onPublicPreferencesChange } from '../lib/publisherPreferences';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Platform, Pressable, RefreshControl, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { FolderHeart, Heart, Package, UserPlus } from 'lucide-react-native';
import type { ItemImage, PublicEntryCard, PublicTopicCard } from '../domain/models';
import { useRepository } from '../data/RepositoryProvider';
import { publicPhotoUrl } from '../lib/sharing';
import { Button, colors, ErrorMessage, fonts, messageOf, ui } from '../components/ui';
import { PublicSafetyControls } from '../components/PublicSafetyControls';
import { FollowButton } from '../social/FollowButton';
import { LikeButton } from '../social/LikeButton';
import { CollectorProfileScreen } from '../social/CollectorProfileScreen';
import { IconActionButton } from '../components/IconActionButton';
import { PostCard } from '../components/PostCard';
import { useGalleryLayout } from '../components/useGalleryLayout';
import { EntryMetaRow } from '../components/EntryMetaRow';
import { EntryViewer } from '../components/EntryViewer';
import { useEntryNavigation } from '../components/useEntryNavigation';
import { useSubtleScrollbar } from '../components/scrollbars';
import { formatEntryPostDate } from '../domain/postDates';

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
  const { layout, onLayout } = useGalleryLayout();
  const scrollbar = useSubtleScrollbar();
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

  function updateEntryLikes(itemId: string, likes: NonNullable<PublicEntryCard['likes']>) {
    setCards(current => current.map(card => isEntry(card) && card.id === itemId ? { ...card, likes } : card));
    setSelectedEntry(current => current?.id === itemId ? { ...current, likes } : current);
  }
  function updatePublisherRelationship(publisherId: string, relationship: NonNullable<PublicEntryCard['relationship']>) {
    setCards(current => current.map(card => isEntry(card) && card.publisherId === publisherId ? { ...card, relationship } : card));
    setSelectedEntry(current => current?.publisherId === publisherId ? { ...current, relationship } : current);
  }

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
    setLoading(true); setMoreLoading(false); setError(''); setCards([]); setPhotos({}); setSelectedEntry(null); setFailedPhotos(new Set());
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
  const selectedNavigation = useEntryNavigation(cards.filter(isEntry), selectedEntry?.id, setSelectedEntry, { hasMore: hasMore && pageRef.current < 20, loadMore, busy: loading || moreLoading });
  return <View style={{ flex: 1, width: '100%', minWidth: 0 }} onLayout={onLayout}>
    <FlatList {...scrollbar} key={`${view}-${layout.columns}`} data={cards} keyExtractor={cardKey} numColumns={layout.columns} style={[{ flex: 1 }, scrollbar.style]} contentContainerStyle={{ paddingHorizontal: layout.padding, paddingTop: layout.padding, paddingBottom: 48, flexGrow: 1 }} columnWrapperStyle={layout.columns > 1 ? { gap: layout.gap } : undefined} refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.green} />}
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
        const media = image && !imageFailed ? <Image key={`${key}-${revision}`} source={{ uri: image }} cachePolicy="none" style={{ width: '100%', height: '100%' }} contentFit="cover" accessibilityLabel={entry ? item.title : `${item.name} cover`} onError={() => setFailedPhotos(current => new Set(current).add(key))} /> : entry ? <Package size={42} color={index % 2 ? '#82967C' : '#8BA1AA'} strokeWidth={1.2} /> : <FolderHeart size={42} color={index % 2 ? '#82967C' : '#8BA1AA'} strokeWidth={1.2} />;
        if (!entry) return <View style={{ width: layout.cardWidth, marginBottom: layout.gap }}><PostCard title={item.name} subtitle={`${item.itemCount} ${item.itemCount === 1 ? 'item' : 'items'} · ${item.collectionCount} ${item.collectionCount === 1 ? 'collection' : 'collections'}`} media={media} mediaAspectRatio={1.18} onOpen={() => onOpenTopic(item.key)} /></View>;
        const publisherId = item.creator?.publisherId ?? item.publisherId;
        const footer = item.creator && publisherId ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, minWidth: 0 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`View ${item.creator.username ?? 'collector'}`} onPress={() => setProfileId(item.creator!.publisherId)} style={{ flexGrow: 1, flexShrink: 1, minWidth: 96, minHeight: 48, justifyContent: 'center' }}><Text numberOfLines={1} style={{ color: colors.green, fontFamily: fonts.medium, fontSize: 12 }}>@{item.creator.username ?? 'collector'}</Text></Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {socialActions && item.relationship && publisherId !== ownPublisherId ? <FollowButton variant="compact" collector={{ publisherId, username: item.creator.username, relationship: item.relationship }} onChanged={relationship => updatePublisherRelationship(publisherId, relationship)} /> : null}
            {socialActions && item.likes ? publisherId === ownPublisherId ? <IconActionButton label={`${item.likes.count} ${item.likes.count === 1 ? 'like' : 'likes'}`} icon={Heart} count={item.likes.count} onPress={() => undefined} disabled /> : <LikeButton variant="compact" itemId={item.id} value={item.likes} onChanged={likes => updateEntryLikes(item.id, likes)} /> : null}
            {!socialActions && onSignIn ? <><IconActionButton label="Sign in to follow" icon={UserPlus} onPress={onSignIn} />{item.likes ? <IconActionButton label="Sign in to like" icon={Heart} count={item.likes.count} onPress={onSignIn} /> : null}</> : null}
          </View>
        </View> : undefined;
        return <View style={{ width: layout.cardWidth, marginBottom: layout.gap }}><PostCard title={item.title} subtitle={item.collectionName} media={media} mediaAspectRatio={1.18} onOpen={() => setSelectedEntry(item)} footer={footer} /></View>;
      }}
      ListEmptyComponent={loading ? <View style={{ alignItems: 'center', padding: 36 }}><ActivityIndicator color={colors.green} /></View> : !error ? <View style={{ alignItems: 'center', padding: 36, gap: 9 }}><Package size={36} color={colors.muted} strokeWidth={1.2} /><Text style={{ color: colors.ink, fontFamily: fonts.bold }}>Nothing shared yet</Text><Text style={ui.muted}>Check back after collectors share entries.</Text></View> : null}
      ListFooterComponent={hasMore ? <Button title={`Load more ${viewTitle.toLowerCase()}`} secondary onPress={() => { void loadMore(); }} loading={moreLoading} style={{ margin: 8 }} /> : null}
    />
    {selectedEntry ? <EntryViewer entryId={selectedEntry.id} title={selectedEntry.title} onClose={() => setSelectedEntry(null)} navigation={selectedNavigation} media={style => selectedEntry.hasPhoto ? <Image source={{ uri: demo ? photos[selectedEntry.id]?.url : publicPhotoUrl(selectedEntry.collectionId, selectedEntry.id, 'full') }} cachePolicy="none" style={style} contentFit="contain" accessibilityLabel={selectedEntry.title} onError={() => setFailedPhotos(current => new Set(current).add(selectedEntry.id))} /> : <View style={{ alignItems: 'center', justifyContent: 'center', gap: 10 }}><Package size={44} color={colors.muted} /><Text style={ui.muted}>No photo</Text></View>}>
      <Text style={ui.muted}>{selectedEntry.collectionName}</Text>
      {selectedEntry.creator ? <EntryMetaRow username={selectedEntry.creator.username} onOpenProfile={() => { setSelectedEntry(null); setProfileId(selectedEntry.creator!.publisherId); }} dateText={selectedEntry.postDate ? formatEntryPostDate(selectedEntry.postDate) : undefined}>
        {socialActions && selectedEntry.likes ? selectedEntry.publisherId === ownPublisherId ? <IconActionButton label={`${selectedEntry.likes.count} ${selectedEntry.likes.count === 1 ? 'like' : 'likes'}`} icon={Heart} count={selectedEntry.likes.count} onPress={() => undefined} disabled /> : <LikeButton variant="compact" itemId={selectedEntry.id} value={selectedEntry.likes} onChanged={likes => updateEntryLikes(selectedEntry.id, likes)} /> : null}
        {socialActions && selectedEntry.relationship && selectedEntry.creator.publisherId !== ownPublisherId ? <FollowButton variant="compact" collector={{ publisherId: selectedEntry.creator.publisherId, username: selectedEntry.creator.username, relationship: selectedEntry.relationship }} onChanged={relationship => updatePublisherRelationship(selectedEntry.creator!.publisherId, relationship)} /> : null}
      </EntryMetaRow> : selectedEntry.postDate ? <Text style={[ui.muted, { fontSize: 12 }]}>{formatEntryPostDate(selectedEntry.postDate)}</Text> : null}
      <Button title="View full collection" secondary onPress={() => { const collectionId = selectedEntry.collectionId; setSelectedEntry(null); onOpenCollection(collectionId); }} />
      <PublicSafetyControls repository={repository} collectionId={selectedEntry.collectionId} itemId={selectedEntry.id} itemLabel="this entry" demo={demo} onBlocked={() => { setSelectedEntry(null); refresh(); }} />
    </EntryViewer> : null}
    {profileId ? <Modal visible animationType="slide" onRequestClose={() => setProfileId(null)}><CollectorProfileScreen publisherId={profileId} onClose={() => setProfileId(null)} /></Modal> : null}
  </View>;
}
