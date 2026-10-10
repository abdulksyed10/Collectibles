import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { Brand, Button, colors, ErrorMessage, ui } from '../components/ui';
import { useRepository } from '../data/RepositoryProvider';
import type { CollectorProfile, SharedEntry } from './types';
import { SharedEntryDetail } from './SharedEntryDetail';
import { VisibleCollectionScreen } from './VisibleCollectionScreen';

/** Opens a shared entry from an opaque public link. Private and Friends-only
 * entries are rejected by the same server-side visibility predicate as feeds. */
export function SharedEntryScreen({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const repository = useRepository();
  const [entry, setEntry] = useState<SharedEntry | null>(null);
  const [collector, setCollector] = useState<CollectorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [collectionId, setCollectionId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setEntry(null); setCollector(null); setCollectionId(null);
    void repository.readSharedEntry(itemId).then(async value => {
      if (!active) return;
      if (!value) { setError('This entry is unavailable.'); return; }
      setEntry(value);
      try {
        const profile = await repository.getCollector(value.publisherId);
        if (active) setCollector(profile);
      } catch { /* A visible entry remains available when profile details cannot load. */ }
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'This entry is unavailable.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [itemId, repository]);

  if (collectionId) return <VisibleCollectionScreen collectionId={collectionId} onClose={() => setCollectionId(null)} />;
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }}>
    <View style={[ui.row, { minHeight: 60, paddingHorizontal: 16, justifyContent: 'space-between', borderBottomWidth: 1, borderColor: colors.line, backgroundColor: colors.card }]}><Button title="Back" icon={ArrowLeft} secondary onPress={onClose} /><Brand small /></View>
    {loading ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}><ActivityIndicator color={colors.green} /><Text style={ui.muted}>Opening shared entry…</Text></View> : null}
    {!loading && error ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}><ErrorMessage message={error} /><Button title="Back to Collectibles" secondary onPress={onClose} /></View> : null}
    {entry ? <SharedEntryDetail entry={entry} collector={collector} accessRevision={0} onClose={onClose} onOpenCollection={() => setCollectionId(entry.collectionId)} onEntryChanged={setEntry} /> : null}
  </SafeAreaView>;
}
