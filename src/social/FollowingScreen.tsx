import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, RefreshControl, Text, View, useWindowDimensions } from 'react-native';
import { Users } from 'lucide-react-native';
import { Button, colors, ErrorMessage, fonts, ui } from '../components/ui';
import { useRepository } from '../data/RepositoryProvider';
import { subscribeSocialInvalidation } from './events';
import { CollectorProfileScreen } from './CollectorProfileScreen';
import { SharedEntryCard } from './SharedEntryCard';
import { SharedEntryDetail } from './SharedEntryDetail';
import type { CollectorProfile, SharedEntry } from './types';
import { VisibleCollectionScreen } from './VisibleCollectionScreen';
import { appendUniqueEntries, createSharedRequestGate } from './sharedLoader';
import { useRestrictedRevalidation } from './useRestrictedRevalidation';

type Props = { onLibrary: () => void; onExplore: () => void; onManagePeople: () => void };

export function FollowingScreen({ onLibrary, onExplore, onManagePeople }: Props) {
  const repository = useRepository();
  const { width } = useWindowDimensions();
  const columns = width >= 1100 ? 4 : width >= 650 ? 3 : 2;
  const [friendsOnly, setFriendsOnly] = useState(false);
  const [entries, setEntries] = useState<SharedEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<SharedEntry | null>(null);
  const [collector, setCollector] = useState<CollectorProfile | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const requests = useRef(createSharedRequestGate());
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => subscribeSocialInvalidation(reason => { if (reason !== 'like') refresh(); }), [refresh]);
  useRestrictedRevalidation(refresh);
  useEffect(() => {
    let active = true;
    const request = requests.current.beginRefresh();
    setLoading(true); setError(''); setEntries([]); setCursor(null); setSelected(null);
    void repository.listFollowingEntries(undefined, friendsOnly).then(page => {
      if (!active || !requests.current.isCurrent(request)) return;
      setEntries(page.items); setCursor(page.nextCursor);
    }).catch(reason => { if (active && requests.current.isCurrent(request)) setError(reason instanceof Error ? reason.message : 'Unable to load Following. Try again.'); }).finally(() => { if (active && requests.current.isCurrent(request)) setLoading(false); });
    return () => { active = false; requests.current.invalidate(); };
  }, [friendsOnly, repository, revision]);
  useEffect(() => {
    let active = true;
    if (!selected) { setCollector(null); return () => { active = false; }; }
    void repository.getCollector(selected.publisherId).then(value => { if (active) setCollector(value); }).catch(() => { if (active) setCollector(null); });
    return () => { active = false; };
  }, [repository, selected]);
  async function loadMore() {
    if (!cursor || !requests.current.beginMore()) return;
    const request = requests.current.current();
    setMoreLoading(true); setError('');
    try {
      const page = await repository.listFollowingEntries(cursor, friendsOnly);
      if (!requests.current.isCurrent(request)) return;
      setEntries(current => appendUniqueEntries(current, page.items));
      setCursor(page.nextCursor);
    } catch (reason) { if (requests.current.isCurrent(request)) setError(reason instanceof Error ? reason.message : 'Unable to load Following. Try again.'); }
    finally { if (requests.current.isCurrent(request)) { setMoreLoading(false); requests.current.endMore(); } }
  }
  function updateEntry(next: SharedEntry) { setEntries(current => current.map(entry => entry.id === next.id ? next : entry)); setSelected(current => current?.id === next.id ? next : current); }
  return <View style={{ flex: 1, width: '100%', maxWidth: 1200, alignSelf: 'center' }}>
    <FlatList key={columns} data={entries} keyExtractor={entry => entry.id} numColumns={columns} contentContainerStyle={{ padding: width >= 900 ? 32 : 16, paddingBottom: 44, flexGrow: 1 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => setRevision(value => value + 1)} tintColor={colors.green} />}
      ListHeaderComponent={<View style={{ gap: 14, paddingBottom: 16 }}>
        <View style={{ flexDirection: 'row', gap: 8, borderBottomWidth: 1, borderColor: colors.line }}>
          <Pressable accessibilityRole="button" accessibilityLabel="My collections" onPress={onLibrary} style={{ minHeight: 48, paddingHorizontal: 14, justifyContent: 'center' }}><Text style={{ fontFamily: fonts.medium, color: colors.muted }}>My collections</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Following" accessibilityState={{ selected: true }} onPress={() => undefined} style={{ minHeight: 48, paddingHorizontal: 14, justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: colors.green }}><Text style={{ fontFamily: fonts.bold, color: colors.green }}>Following</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Explore" onPress={onExplore} style={{ minHeight: 48, paddingHorizontal: 14, justifyContent: 'center' }}><Text style={{ fontFamily: fonts.medium, color: colors.muted }}>Explore</Text></Pressable>
        </View>
        <View style={[ui.row, { justifyContent: 'space-between' }]}><View><Text style={[ui.title, { fontSize: width >= 900 ? 36 : 30 }]}>Following</Text><Text style={ui.muted}>New items from collectors you follow.</Text></View><Button title="Find people" secondary icon={Users} onPress={onManagePeople} /></View>
        <View style={{ flexDirection: 'row', gap: 8 }}><Button title="All following" secondary={!friendsOnly} onPress={() => setFriendsOnly(false)} /><Button title="Friends only" secondary={friendsOnly} onPress={() => setFriendsOnly(true)} /></View>
        <ErrorMessage message={error} />{error ? <Button title="Try again" secondary onPress={() => setRevision(value => value + 1)} /> : null}
      </View>}
      renderItem={({ item }) => <View style={{ width: `${100 / columns}%`, padding: 7 }}><SharedEntryCard entry={item} accessRevision={revision} onOpen={() => setSelected(item)} onOpenCollector={() => setProfileId(item.publisherId)} onLikeChanged={updateEntry} /></View>}
      ListEmptyComponent={loading ? <View style={{ padding: 36, alignItems: 'center' }}><ActivityIndicator color={colors.green} /></View> : !error ? <View style={{ alignItems: 'center', padding: 36, gap: 8 }}><Users size={38} color={colors.muted} /><Text style={{ color: colors.ink, fontFamily: fonts.bold }}>Nothing here yet</Text><Text style={[ui.muted, { textAlign: 'center' }]}>Follow collectors to see their public items and Friends-only items from mutual follows.</Text><Button title="Find people" secondary onPress={onManagePeople} /></View> : null}
      ListFooterComponent={cursor ? <Button title="Load more" secondary onPress={() => { void loadMore(); }} loading={moreLoading} style={{ margin: 8 }} /> : null}
    />
    {selected ? <SharedEntryDetail entry={selected} collector={collector} accessRevision={revision} onClose={() => setSelected(null)} onOpenCollection={() => { setCollectionId(selected.collectionId); setSelected(null); }} onEntryChanged={updateEntry} /> : null}
    {profileId ? <Modal visible animationType="slide" onRequestClose={() => setProfileId(null)}><CollectorProfileScreen publisherId={profileId} onClose={() => setProfileId(null)} /></Modal> : null}
    {collectionId ? <Modal visible animationType="slide" onRequestClose={() => setCollectionId(null)}><VisibleCollectionScreen collectionId={collectionId} onClose={() => setCollectionId(null)} /></Modal> : null}
  </View>;
}
