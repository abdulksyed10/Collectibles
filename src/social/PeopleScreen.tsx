import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { ArrowLeft, Ban, Search, UserMinus } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, ErrorMessage, colors, fonts, ui } from '../components/ui';
import { useRepository } from '../data/RepositoryProvider';
import { FollowButton } from './FollowButton';
import type { CollectorProfile, PeopleList, Relationship } from './types';

const tabs: Array<{ id: PeopleList; title: string; empty: string }> = [
  { id: 'following', title: 'Following', empty: 'Follow collectors to keep track of their public items.' },
  { id: 'followers', title: 'Followers', empty: 'People who follow you will appear here.' },
  { id: 'friends', title: 'Friends', empty: 'Friends are collectors you and the other person both follow.' },
  { id: 'blocked', title: 'Blocked', empty: 'Collectors you block are hidden from your Explore view.' },
];

export function PeopleScreen({ onClose }: { onClose: () => void }) {
  const repository = useRepository();
  const [kind, setKind] = useState<PeopleList>('following');
  const [people, setPeople] = useState<CollectorProfile[]>([]);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const tab = tabs.find(value => value.id === kind)!;

  const load = useCallback(async () => {
    setLoading(true); setError(''); setSearching(false);
    try { setPeople((await repository.listPeople(kind)).items); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load collectors. Try again.'); }
    finally { setLoading(false); }
  }, [kind, repository]);

  useEffect(() => { void load(); }, [load]);

  async function findPeople() {
    const query = search.trim();
    if (query.length < 2) { setError('Enter at least two characters.'); return; }
    setLoading(true); setError(''); setSearching(true);
    try { setPeople((await repository.searchCollectors(query)).items); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to find collectors. Try again.'); }
    finally { setLoading(false); }
  }
  function updateRelationship(publisherId: string, relationship: Relationship) {
    setPeople(current => current.map(person => person.publisherId === publisherId ? { ...person, relationship } : person));
  }
  async function removeFollower(person: CollectorProfile) {
    setBusyId(person.publisherId); setError('');
    try { updateRelationship(person.publisherId, await repository.removeFollower(person.publisherId)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to remove this follower. Try again.'); }
    finally { setBusyId(''); }
  }
  async function block(person: CollectorProfile) {
    setBusyId(person.publisherId); setError('');
    try { await repository.blockCollector(person.publisherId); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to block this collector. Try again.'); }
    finally { setBusyId(''); }
  }
  async function unblock(person: CollectorProfile) {
    setBusyId(person.publisherId); setError('');
    try { await repository.unblockPublicPublisher(person.publisherId); setPeople(current => current.filter(value => value.publisherId !== person.publisherId)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to unblock this collector. Try again.'); }
    finally { setBusyId(''); }
  }

  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }}><View style={[ui.row, { minHeight: 60, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: colors.line, backgroundColor: colors.card }]}><Button title="Back" secondary icon={ArrowLeft} onPress={onClose} /></View><View style={{ flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 16 }}><FlatList data={people} keyExtractor={person => person.publisherId} contentContainerStyle={{ paddingVertical: 22, gap: 12, flexGrow: 1 }} ListHeaderComponent={<View style={{ gap: 16, marginBottom: 8 }}><Text style={[ui.title, { fontSize: 36, lineHeight: 40 }]}>Collectors</Text><Text style={ui.muted}>Find people you know, manage who you follow, and see your mutual friends.</Text><View style={[ui.row, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingLeft: 14, minHeight: 48 }]}><Search size={18} color={colors.muted} /><TextInput accessibilityLabel="Find collectors" autoCapitalize="none" autoCorrect={false} value={search} onChangeText={setSearch} placeholder="Search usernames" placeholderTextColor="#9AA49C" onSubmitEditing={() => { void findPeople(); }} style={{ flex: 1, minWidth: 0, color: colors.ink, fontFamily: fonts.body, paddingVertical: 12 }} /><Button title="Find" secondary onPress={() => { void findPeople(); }} disabled={loading} /></View><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{tabs.map(option => <Pressable key={option.id} accessibilityRole="button" accessibilityState={{ selected: kind === option.id }} onPress={() => { setKind(option.id); setSearch(''); }} style={{ minHeight: 44, paddingHorizontal: 13, justifyContent: 'center', borderRadius: 22, backgroundColor: kind === option.id ? colors.green : colors.card, borderWidth: 1, borderColor: kind === option.id ? colors.green : colors.line }}><Text style={{ color: kind === option.id ? '#FFFFFF' : colors.ink, fontFamily: fonts.bold, fontSize: 13 }}>{option.title}</Text></Pressable>)}</View><ErrorMessage message={error} />{searching ? <Button title={`Back to ${tab.title}`} secondary onPress={() => { setSearch(''); void load(); }} /> : null}</View>} renderItem={({ item }) => <CollectorRow collector={item} tab={searching ? undefined : kind} busy={busyId === item.publisherId} onChanged={relationship => updateRelationship(item.publisherId, relationship)} onRemoveFollower={() => { void removeFollower(item); }} onBlock={() => { void block(item); }} onUnblock={() => { void unblock(item); }} />} ListEmptyComponent={loading ? <View style={{ padding: 34, alignItems: 'center', gap: 10 }}><ActivityIndicator color={colors.green} /><Text style={ui.muted}>Loading collectors…</Text></View> : <View style={{ paddingVertical: 34, alignItems: 'center', gap: 10 }}><Text style={[ui.text, { fontFamily: fonts.bold }]}>{searching ? 'No collectors found' : `No ${tab.title.toLowerCase()} yet`}</Text><Text style={[ui.muted, { textAlign: 'center', maxWidth: 360 }]}>{searching ? 'Try another username.' : tab.empty}</Text></View>} /></View></SafeAreaView>;
}

function CollectorRow({ collector, tab, busy, onChanged, onRemoveFollower, onBlock, onUnblock }: { collector: CollectorProfile; tab?: PeopleList; busy: boolean; onChanged: (relationship: Relationship) => void; onRemoveFollower: () => void; onBlock: () => void; onUnblock: () => void }) {
  const handle = collector.username ?? 'collector';
  return <View style={{ gap: 12, padding: 15, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 16 }}><View style={ui.row}><View style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.pale }}><Text style={{ color: colors.green, fontFamily: fonts.bold }}>{handle[0]?.toUpperCase() ?? 'C'}</Text></View><View style={{ flex: 1 }}><Text style={[ui.text, { fontFamily: fonts.bold }]}>@{handle}</Text><Text style={[ui.muted, { fontSize: 12 }]}>{collector.relationship.isFriend ? 'Friends' : collector.relationship.isFollower ? 'Follows you' : collector.relationship.isFollowing ? 'Following' : 'Collector'}</Text></View></View>{tab === 'blocked' ? <Button title="Unblock" secondary onPress={onUnblock} loading={busy} /> : <View style={{ gap: 9 }}><FollowButton collector={collector} onChanged={onChanged} />{collector.relationship.isFollower ? <Button title="Remove follower" secondary icon={UserMinus} onPress={onRemoveFollower} loading={busy} /> : null}{collector.relationship.interactionAllowed ? <Button title="Block" secondary danger icon={Ban} onPress={onBlock} loading={busy} /> : null}</View>}</View>;
}