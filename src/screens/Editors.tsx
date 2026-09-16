import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Camera, Check, ImagePlus, Plus, Trash2 } from 'lucide-react-native';
import { Image } from 'expo-image';
import type { Category, Collection, Item, ItemImage, PreparedPhoto } from '../domain/models';
import { useRepository } from '../data/RepositoryProvider';
import { pickPhoto } from '../lib/photos';
import { Button, colors, ErrorMessage, Field, fonts, messageOf, Sheet, ui } from '../components/ui';
function Choices({ label, options, value, onChange, disabled }: { label: string; options: { id: string; name: string; subtitle?: string }[]; value: string; onChange: (id: string) => void; disabled?: boolean }) {
  return <View><Text style={ui.label}>{label}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{options.map(option => <Pressable key={option.id} accessibilityRole="button" accessibilityLabel={`${label}: ${option.name}`} accessibilityState={{ selected: value === option.id }} {...(Platform.OS === 'web' ? { 'aria-pressed': value === option.id } : {})} onPress={() => onChange(option.id)} disabled={disabled} style={{ padding: 12, borderRadius: 12, backgroundColor: value === option.id ? colors.green : colors.card, borderWidth: 1, borderColor: colors.line }}><Text style={{ fontFamily: fonts.medium, color: value === option.id ? '#FFF' : colors.ink }}>{option.name}</Text>{option.subtitle ? <Text style={{ color: value === option.id ? '#E8EFE8' : colors.muted, fontSize: 11 }}>{option.subtitle}</Text> : null}</Pressable>)}</ScrollView></View>;
}
export function CategoryEditor({ category, canDelete, onClose, onSaved, onDelete }: { category?: Category; canDelete: boolean; onClose: () => void; onSaved: (value: Category) => void; onDelete: () => void }) {
  const repository = useRepository(); const [name, setName] = useState(category?.name ?? ''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function save() { setError(''); if (!name.trim()) { setError('Enter a category name.'); return; } setBusy(true); try { onSaved(await repository.saveCategory({ name: name.trim() }, category?.id)); } catch (e) { setError(messageOf(e)); } finally { setBusy(false); } }
  return <Sheet title={category ? 'Edit category' : 'New category'} subtitle="Categories are types of collectibles: pins, Pokémon cards, bottle caps, boots, or anything you collect." onClose={onClose} busy={busy}><Field label="Category name" placeholder="e.g. Bottle Caps" value={name} onChangeText={setName} maxLength={80} autoFocus editable={!busy} /><ErrorMessage message={error} /><Button title={category ? 'Save category' : 'Create category'} icon={category ? Check : Plus} onPress={save} loading={busy} />{category && canDelete ? <Button title="Delete category" icon={Trash2} secondary danger onPress={onDelete} disabled={busy} /> : category ? <Text style={ui.muted}>Move or delete this category’s collections before deleting it.</Text> : null}</Sheet>;
}
export function CollectionEditor({ collection, categories, initialCategory, onClose, onSaved, onDelete }: { collection?: Collection; categories: Category[]; initialCategory?: string; onClose: () => void; onSaved: (value: Collection) => void; onDelete: () => void }) {
  const repository = useRepository();
  const [name, setName] = useState(collection?.name ?? ''); const [description, setDescription] = useState(collection?.description ?? ''); const [categoryId, setCategoryId] = useState(collection?.category_id ?? initialCategory ?? categories[0]?.id ?? ''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function save() { setError(''); if (!categoryId) { setError('Choose a category first.'); return; } setBusy(true); try { onSaved(await repository.saveCollection({ name, description, categoryId }, collection?.id)); } catch (e) { setError(messageOf(e)); } finally { setBusy(false); } }
  return <Sheet title={collection ? 'Edit collection' : 'A new collection'} subtitle="Give your favorite finds a place to belong." onClose={onClose} busy={busy}><Field label="Collection name" placeholder="e.g. Little adventures" value={name} onChangeText={setName} maxLength={80} autoFocus editable={!busy} /><Choices label="Category" options={categories} value={categoryId} onChange={setCategoryId} disabled={busy} /><Field label="Description (optional)" placeholder="What makes this collection special?" value={description} onChangeText={setDescription} maxLength={500} multiline editable={!busy} /><ErrorMessage message={error} /><Button title={collection ? 'Save collection' : 'Create collection'} icon={collection ? Check : Plus} onPress={save} loading={busy} />{collection ? <Button title="Delete collection" icon={Trash2} secondary danger onPress={onDelete} disabled={busy} /> : null}</Sheet>;
}
export function ItemEditor({ item, image, collections, categories, initialCollection, initialCategory, onClose, onSaved }: { item?: Item; image?: ItemImage; collections: Collection[]; categories: Category[]; initialCollection?: string; initialCategory?: string; onClose: () => void; onSaved: () => void }) {
  const repository = useRepository();
  const preferred = collections.filter(c => !initialCategory || c.category_id === initialCategory);
  const [title, setTitle] = useState(item?.title ?? ''); const [notes, setNotes] = useState(item?.notes ?? ''); const [collectionId, setCollectionId] = useState(item?.collection_id ?? initialCollection ?? preferred[0]?.id ?? '');
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null); const [savedId, setSavedId] = useState(item?.id); const [busy, setBusy] = useState(false); const [picking, setPicking] = useState(false); const [error, setError] = useState('');
  async function choose(camera: boolean) { setError(''); setPicking(true); try { const next = await pickPhoto(camera); if (next) setPhoto(next); } catch (e) { setError(messageOf(e)); } finally { setPicking(false); } }
  async function save() {
    if (!collectionId) { setError('Choose a collection first.'); return; }
    setBusy(true); setError(''); let metadataSaved = false;
    try { const saved = await repository.saveItem({ title, notes, collectionId }, savedId); setSavedId(saved.id); metadataSaved = true; if (photo) await repository.uploadPhoto(saved.id, photo); onSaved(); }
    catch (e) { setError(`${metadataSaved && photo ? 'Your item details are saved. The photo was not confirmed; you can retry or close and check your item. ' : ''}${messageOf(e)}`); }
    finally { setBusy(false); }
  }
  function close() { if (savedId) onSaved(); else onClose(); }
  return <Sheet title={item ? 'Edit item' : 'Add an item'} subtitle="A photo, a name, a story. Make it yours." onClose={close} busy={busy || picking}>
    <View style={{ backgroundColor: colors.pale, borderRadius: 18, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', minHeight: 170 }}>
      {photo?.uri || image?.url ? <Image source={{ uri: photo?.uri ?? image?.url }} style={{ width: '100%', height: 200 }} contentFit="contain" cachePolicy="memory" accessibilityLabel="Item photo preview" /> : <View style={{ alignItems: 'center', gap: 10, padding: 25 }}><ImagePlus size={35} color={colors.green} strokeWidth={1.4} /><Text style={ui.muted}>Give your item its close-up</Text></View>}
    </View>
    {!image ? <View style={ui.row}><Button title={photo ? 'Choose another' : 'Choose photo'} secondary icon={ImagePlus} onPress={() => { void choose(false); }} disabled={busy || picking} style={{ flex: 1 }} /><Button title="Camera" secondary icon={Camera} onPress={() => { void choose(true); }} disabled={busy || picking} /></View> : <Text style={[ui.muted, { fontSize: 12 }]}>Your photo is saved privately. You can edit its details below.</Text>}
    <Field label="Item name" placeholder="e.g. A favorite find" value={title} onChangeText={setTitle} maxLength={120} editable={!busy} />
    <Choices label="Collection" options={collections.map(c => ({ id: c.id, name: c.name, subtitle: categories.find(category => category.id === c.category_id)?.name }))} value={collectionId} onChange={setCollectionId} disabled={busy} />
    <Field label="Notes (optional)" placeholder="Where you found it, who gave it to you, or why you love it…" value={notes} onChangeText={setNotes} maxLength={2000} multiline editable={!busy} /><ErrorMessage message={error} /><Button title={item || savedId ? 'Save item' : 'Add item'} icon={Check} onPress={save} loading={busy} disabled={picking} /><Text style={[ui.muted, { textAlign: 'center', fontSize: 12 }]}>Only you can see this item and its photo.</Text>
  </Sheet>;
}
export function ConfirmDelete({ kind, name, action, onClose, onDeleted }: { kind: 'item' | 'collection' | 'category' | 'account'; name: string; action: () => Promise<void>; onClose: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [confirmation, setConfirmation] = useState('');
  async function remove() { setError(''); setBusy(true); try { await action(); onDeleted(); } catch (e) { setError(messageOf(e)); setBusy(false); } }
  const message = kind === 'account' ? 'This permanently deletes your account, every category, collection, item, and photo.' : kind === 'category' ? `“${name}” will be permanently deleted. A category must be empty before it can be deleted.` : kind === 'collection' ? `“${name}” and all its items and photos will be permanently deleted.` : `“${name}” and its photo will be permanently deleted.`;
  return <Sheet title={`Delete ${kind}?`} onClose={onClose} busy={busy}><Text style={ui.text}>{message} This cannot be undone.</Text>{kind === 'account' ? <Field label="Type DELETE to confirm" value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" editable={!busy} /> : null}<ErrorMessage message={error} /><Button title={`Permanently delete ${kind}`} danger icon={Trash2} onPress={remove} loading={busy} disabled={kind === 'account' && confirmation !== 'DELETE'} /><Button title="Keep it" secondary onPress={onClose} disabled={busy} /></Sheet>;
}
