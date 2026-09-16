import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Camera, Check, ImagePlus, Plus, Trash2 } from 'lucide-react-native';
import { Image } from 'expo-image';
import type { Collection, Pin, PinImage, PreparedPhoto } from '../domain/models';
import { useRepository } from '../data/RepositoryProvider';
import { pickPhoto } from '../lib/photos';
import { Button, colors, ErrorMessage, Field, fonts, messageOf, Sheet, ui } from '../components/ui';
export function CollectionEditor({ collection, onClose, onSaved, onDelete }: { collection?: Collection; onClose: () => void; onSaved: (value: Collection) => void; onDelete: () => void }) {
  const repository = useRepository();
  const [name, setName] = useState(collection?.name ?? ''); const [description, setDescription] = useState(collection?.description ?? ''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function save() { setError(''); setBusy(true); try { onSaved(await repository.saveCollection({ name, description }, collection?.id)); } catch (e) { setError(messageOf(e)); } finally { setBusy(false); } }
  return <Sheet title={collection ? 'Edit collection' : 'A new collection'} subtitle="Give your favorite finds a place to belong." onClose={onClose} busy={busy}><Field label="Collection name" placeholder="e.g. Little adventures" value={name} onChangeText={setName} maxLength={80} autoFocus editable={!busy} /><Field label="Description (optional)" placeholder="What makes this collection special?" value={description} onChangeText={setDescription} maxLength={500} multiline editable={!busy} /><ErrorMessage message={error} /><Button title={collection ? 'Save collection' : 'Create collection'} icon={collection ? Check : Plus} onPress={save} loading={busy} />{collection ? <Button title="Delete collection" icon={Trash2} secondary danger onPress={onDelete} disabled={busy} /> : null}</Sheet>;
}
export function PinEditor({ pin, image, collections, initialCollection, onClose, onSaved }: { pin?: Pin; image?: PinImage; collections: Collection[]; initialCollection?: string; onClose: () => void; onSaved: () => void }) {
  const repository = useRepository();
  const [title, setTitle] = useState(pin?.title ?? ''); const [notes, setNotes] = useState(pin?.notes ?? ''); const [collectionId, setCollectionId] = useState(pin?.collection_id ?? initialCollection ?? collections[0]?.id ?? '');
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null); const [savedId, setSavedId] = useState(pin?.id); const [busy, setBusy] = useState(false); const [picking, setPicking] = useState(false); const [error, setError] = useState('');
  async function choose(camera: boolean) { setError(''); setPicking(true); try { const next = await pickPhoto(camera); if (next) setPhoto(next); } catch (e) { setError(messageOf(e)); } finally { setPicking(false); } }
  async function save() {
    if (!collectionId) { setError('Choose a collection first.'); return; }
    setBusy(true); setError(''); let metadataSaved = false;
    try { const saved = await repository.savePin({ title, notes, collectionId }, savedId); setSavedId(saved.id); metadataSaved = true; if (photo) await repository.uploadPhoto(saved.id, photo); onSaved(); }
    catch (e) { setError(`${metadataSaved && photo ? 'Your pin details are saved. The photo was not confirmed; you can retry or close and check your pin. ' : ''}${messageOf(e)}`); }
    finally { setBusy(false); }
  }
  function close() { if (savedId) onSaved(); else onClose(); }
  return <Sheet title={pin ? 'Edit your pin' : 'Add a little treasure'} subtitle="A photo, a name, a story. Make it yours." onClose={close} busy={busy || picking}>
    <View style={{ backgroundColor: colors.pale, borderRadius: 18, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', minHeight: 170 }}>
      {photo?.uri || image?.url ? <Image source={{ uri: photo?.uri ?? image?.url }} style={{ width: '100%', height: 200 }} contentFit="contain" cachePolicy="memory" accessibilityLabel="Pin photo preview" /> : <View style={{ alignItems: 'center', gap: 10, padding: 25 }}><ImagePlus size={35} color={colors.green} strokeWidth={1.4} /><Text style={ui.muted}>Give your pin its close-up</Text></View>}
    </View>
    {!image ? <View style={ui.row}><Button title={photo ? 'Choose another' : 'Choose photo'} secondary icon={ImagePlus} onPress={() => { void choose(false); }} disabled={busy || picking} style={{ flex: 1 }} /><Button title="Camera" secondary icon={Camera} onPress={() => { void choose(true); }} disabled={busy || picking} /></View> : <Text style={[ui.muted, { fontSize: 12 }]}>Your photo is saved privately. You can edit its details below.</Text>}
    <Field label="Pin name" placeholder="e.g. Yosemite enamel pin" value={title} onChangeText={setTitle} maxLength={120} editable={!busy} />
    <View><Text style={ui.label}>Collection</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{collections.map(c => <Pressable key={c.id} accessibilityRole="button" accessibilityState={{ selected: collectionId === c.id }} onPress={() => setCollectionId(c.id)} disabled={busy} style={{ padding: 12, borderRadius: 12, backgroundColor: collectionId === c.id ? colors.green : colors.card, borderWidth: 1, borderColor: colors.line }}><Text style={{ fontFamily: fonts.medium, color: collectionId === c.id ? '#FFF' : colors.ink }}>{c.name}</Text></Pressable>)}</ScrollView></View>
    <Field label="Notes (optional)" placeholder="Where you found it, who gave it to you, or why you love it…" value={notes} onChangeText={setNotes} maxLength={2000} multiline editable={!busy} /><ErrorMessage message={error} /><Button title={pin || savedId ? 'Save pin' : 'Add to collection'} icon={Check} onPress={save} loading={busy} disabled={picking} /><Text style={[ui.muted, { textAlign: 'center', fontSize: 12 }]}>Only you can see this pin and its photo.</Text>
  </Sheet>;
}
export function ConfirmDelete({ kind, name, action, onClose, onDeleted }: { kind: 'pin' | 'collection' | 'account'; name: string; action: () => Promise<void>; onClose: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [confirmation, setConfirmation] = useState('');
  async function remove() { setError(''); setBusy(true); try { await action(); onDeleted(); } catch (e) { setError(messageOf(e)); setBusy(false); } }
  return <Sheet title={`Delete ${kind}?`} onClose={onClose} busy={busy}><Text style={ui.text}>{kind === 'account' ? 'This permanently deletes your account, every collection, and all your pin photos.' : kind === 'collection' ? `“${name}” and all its pins and photos will be permanently deleted.` : `“${name}” and its photo will be permanently deleted.`} This cannot be undone.</Text>{kind === 'account' ? <Field label="Type DELETE to confirm" value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" editable={!busy} /> : null}<ErrorMessage message={error} /><Button title={`Permanently delete ${kind}`} danger icon={Trash2} onPress={remove} loading={busy} disabled={kind === 'account' && confirmation !== 'DELETE'} /><Button title="Keep it" secondary onPress={onClose} disabled={busy} /></Sheet>;
}
