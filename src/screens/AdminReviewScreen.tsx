import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Check, Package, Trash2 } from 'lucide-react-native';
import type { AdminReviewTarget } from '../domain/models';
import { useRepository } from '../data/RepositoryProvider';
import { Button, colors, ErrorMessage, fonts, messageOf, ui } from '../components/ui';

function reasonText(target: AdminReviewTarget) {
  const values = Object.entries(target.reasonSummary).map(([reason, count]) => `${count} ${reason}`).join(', ');
  return values || `${target.reportCount} reports`;
}

export function AdminReviewScreen({ onClose }: { onClose: () => void }) {
  const repository = useRepository();
  const [targets, setTargets] = useState<AdminReviewTarget[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const page = await repository.listAdminReviewQueue(0);
      setTargets(page.targets);
      const entries = await Promise.all(page.targets.filter(target => target.targetType === 'item').map(async target => {
        try { const image = await repository.readReviewThumbnail(target.targetId); return [target.targetId, image.thumbnailDataUrl] as const; }
        catch { return null; }
      }));
      setThumbnails(Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => Boolean(entry))));
    } catch (cause) { setError(messageOf(cause)); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function resolve(target: AdminReviewTarget, action: 'restore' | 'remove') {
    setBusyId(target.targetId); setError('');
    try {
      const changed = await repository.resolveAdminReview(target.targetType, target.targetId, action);
      if (!changed) throw new Error('This review item has already changed. Refresh the queue.');
      setTargets(current => current.filter(value => value.targetId !== target.targetId));
      setThumbnails(current => { const next = { ...current }; delete next[target.targetId]; return next; });
    } catch (cause) { setError(messageOf(cause)); }
    finally { setBusyId(''); }
  }

  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }}>
    <View style={[ui.row, { minHeight: 58, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: colors.line, backgroundColor: colors.card }]}>
      <Button title="Back" secondary icon={ArrowLeft} onPress={onClose} />
      <Text style={[ui.title, { flex: 1, marginLeft: 12, fontSize: 26 }]}>Review queue</Text>
    </View>
    <FlatList data={targets} keyExtractor={target => `${target.targetType}:${target.targetId}`} contentContainerStyle={{ padding: 16, gap: 14, flexGrow: 1 }} refreshing={loading} onRefresh={() => { void load(); }}
      ListHeaderComponent={<View style={{ gap: 6 }}><Text style={ui.muted}>Items appear here after five reports from different signed-in members.</Text><ErrorMessage message={error} /></View>}
      ListEmptyComponent={loading ? <View style={{ alignItems: 'center', padding: 36 }}><ActivityIndicator color={colors.green} /></View> : <View style={{ alignItems: 'center', padding: 36, gap: 8 }}><Text style={[ui.text, { fontFamily: fonts.bold }]}>Nothing needs review.</Text><Button title="Refresh" secondary onPress={() => { void load(); }} /></View>}
      renderItem={({ item }) => <View style={{ gap: 12, padding: 14, borderWidth: 1, borderColor: colors.line, borderRadius: 16, backgroundColor: colors.card }}>
        {item.targetType === 'item' ? <View style={{ height: 190, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.pale, alignItems: 'center', justifyContent: 'center' }}>{thumbnails[item.targetId] ? <Image source={{ uri: thumbnails[item.targetId] }} contentFit="contain" style={{ width: '100%', height: '100%' }} accessibilityLabel={`Review image for ${item.title}`} /> : <Package size={44} color={colors.muted} />}</View> : null}
        <View style={{ gap: 4 }}><Text style={[ui.text, { fontFamily: fonts.bold }]}>{item.title}</Text><Text style={[ui.muted, { fontSize: 12 }]}>{item.targetType === 'item' ? item.collectionName : 'Collection'} · {item.reportCount} reports</Text><Text style={[ui.muted, { fontSize: 12 }]}>{reasonText(item)}</Text></View>
        <View style={ui.row}><Button title="Restore" secondary icon={Check} onPress={() => { void resolve(item, 'restore'); }} loading={busyId === item.targetId} style={{ flex: 1 }} /><Button title="Remove" secondary danger icon={Trash2} onPress={() => { void resolve(item, 'remove'); }} disabled={Boolean(busyId) && busyId !== item.targetId} style={{ flex: 1 }} /></View>
      </View>}
    />
  </SafeAreaView>;
}
