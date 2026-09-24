import React, { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Camera, Check, ImagePlus, Plus, Trash2 } from 'lucide-react-native';
import { Image } from 'expo-image';
import type { Category, Collection, Item, ItemImage, PreparedPhoto } from '../domain/models';
import { useRepository } from '../data/RepositoryProvider';
import { pickPhoto } from '../lib/photos';
import { todayLocalDate, validateAcquiredDate } from '../domain/dates';
import { AcquiredDateField } from '../components/AcquiredDateField';
import { Button, colors, ErrorMessage, Field, fonts, messageOf, Sheet, ui } from '../components/ui';

function Choices({ label, options, value, onChange, disabled }: { label: string; options: { id: string; name: string; subtitle?: string }[]; value: string; onChange: (id: string) => void; disabled?: boolean }) {
  return <View><Text style={ui.label}>{label}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{options.map(option => <Pressable key={option.id} accessibilityRole="button" accessibilityLabel={`${label}: ${option.name}`} accessibilityState={{ selected: value === option.id }} {...(Platform.OS === 'web' ? { 'aria-pressed': value === option.id } : {})} onPress={() => onChange(option.id)} disabled={disabled} style={{ minHeight: 48, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 12, backgroundColor: value === option.id ? colors.green : colors.card, borderWidth: 1, borderColor: colors.line }}><Text style={{ fontFamily: fonts.medium, color: value === option.id ? '#FFF' : colors.ink }}>{option.name}</Text>{option.subtitle ? <Text style={{ color: value === option.id ? '#E8EFE8' : colors.muted, fontSize: 11 }}>{option.subtitle}</Text> : null}</Pressable>)}</ScrollView></View>;
}

export function CategoryEditor({ category, collection, onClose, onSaved, onDelete }: { category?: Category; collection: Collection; onClose: () => void; onSaved: (value: Category) => void; onDelete: () => void }) {
  const repository = useRepository();
  const [name, setName] = useState(category?.name ?? '');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function save() {
    setError('');
    if (!name.trim()) { setError('Enter a category name.'); return; }
    setBusy(true);
    try { onSaved(await repository.saveCategory({ name: name.trim(), collectionId: collection.id }, category?.id)); }
    catch (reason) { setError(messageOf(reason)); }
    finally { setBusy(false); }
  }
  return <Sheet title={category ? 'Edit category' : 'New category'} subtitle={`In ${collection.name}`} onClose={onClose} busy={busy}>
    <Field label="Category name" placeholder="e.g. Local breweries" value={name} onChangeText={setName} maxLength={80} autoFocus editable={!busy} />
    <ErrorMessage message={error} />
    <Button title={category ? 'Save category' : 'Create category'} icon={category ? Check : Plus} onPress={() => { void save(); }} loading={busy} />
    {category ? <Button title="Delete category" icon={Trash2} secondary danger onPress={onDelete} disabled={busy} /> : null}
    {category ? <Text style={[ui.muted, { fontSize: 12 }]}>Entries in this category stay in {collection.name} if you delete it.</Text> : null}
  </Sheet>;
}

export function CollectionEditor({ collection, onClose, onSaved, onDelete }: { collection?: Collection; onClose: () => void; onSaved: (value: Collection) => void; onDelete: () => void }) {
  const repository = useRepository();
  const [name, setName] = useState(collection?.name ?? '');
  const [description, setDescription] = useState(collection?.description ?? '');
  const [acquiredOn, setAcquiredOn] = useState<string | null>(collection ? collection.acquired_on : todayLocalDate());
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function save() {
    setError('');
    if (!name.trim()) { setError('Enter a collection name.'); return; }
    try { validateAcquiredDate(acquiredOn); } catch (reason) { setError(messageOf(reason)); return; }
    setBusy(true);
    try { onSaved(await repository.saveCollection({ name: name.trim(), description, acquiredOn }, collection?.id)); }
    catch (reason) { setError(messageOf(reason)); }
    finally { setBusy(false); }
  }
  return <Sheet title={collection ? 'Edit collection' : 'New collection'} onClose={onClose} busy={busy}>
    <Field label="Collection name" placeholder="e.g. Bottle caps" value={name} onChangeText={setName} maxLength={80} autoFocus editable={!busy} />
    <Field label="Description (optional)" placeholder="A short note about this collection" value={description} onChangeText={setDescription} maxLength={500} multiline editable={!busy} />
    <AcquiredDateField value={acquiredOn} onChange={setAcquiredOn} disabled={busy} />
    <ErrorMessage message={error} />
    <Button title={collection ? 'Save collection' : 'Create collection'} icon={collection ? Check : Plus} onPress={() => { void save(); }} loading={busy} />
    {collection ? <Button title="Delete collection" icon={Trash2} secondary danger onPress={onDelete} disabled={busy} /> : null}
  </Sheet>;
}

export function ItemEditor({ item, image, collections, categories, initialCollection, initialCategory, onClose, onSaved }: { item?: Item; image?: ItemImage; collections: Collection[]; categories: Category[]; initialCollection?: string; initialCategory?: string; onClose: () => void; onSaved: () => void }) {
  const repository = useRepository();
  const [title, setTitle] = useState(item?.title ?? '');
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [collectionId, setCollectionId] = useState(item?.collection_id ?? initialCollection ?? collections[0]?.id ?? '');
  const [categoryId, setCategoryId] = useState<string>(item?.category_id ?? initialCategory ?? '');
  const [visibility, setVisibility] = useState<'private' | 'public'>(item?.visibility ?? 'private');
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null); const [savedId, setSavedId] = useState(item?.id);
  const [busy, setBusy] = useState(false); const [picking, setPicking] = useState(false); const [error, setError] = useState('');
  const selectedCategories = useMemo(() => categories.filter(category => category.collection_id === collectionId), [categories, collectionId]);
  async function choose(camera: boolean) { setError(''); setPicking(true); try { const next = await pickPhoto(camera); if (next) setPhoto(next); } catch (reason) { setError(messageOf(reason)); } finally { setPicking(false); } }
  function chooseCollection(id: string) { setCollectionId(id); if (!categories.some(category => category.id === categoryId && category.collection_id === id)) setCategoryId(''); }
  async function save() {
    if (!collectionId) { setError('Choose a collection first.'); return; }
    setBusy(true); setError(''); let metadataSaved = false;
    try {
      const saved = await repository.saveItem({ title, notes, collectionId, categoryId: categoryId || null, visibility }, savedId);
      setSavedId(saved.id); metadataSaved = true;
      if (photo) await repository.uploadPhoto(saved.id, photo);
      onSaved();
    } catch (reason) { setError(`${metadataSaved && photo ? 'Your item details are saved. The photo was not confirmed; you can retry or close and check your item. ' : ''}${messageOf(reason)}`); }
    finally { setBusy(false); }
  }
  function close() { if (savedId) onSaved(); else onClose(); }
  return <Sheet title={item ? 'Edit item' : 'Add item'} onClose={close} busy={busy || picking}>
    <View style={{ backgroundColor: colors.pale, borderRadius: 18, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', minHeight: 170 }}>
      {photo?.uri || image?.url ? <Image source={{ uri: photo?.uri ?? image?.url }} style={{ width: '100%', height: 200 }} contentFit="contain" cachePolicy="memory" accessibilityLabel="Item photo preview" /> : <View style={{ alignItems: 'center', gap: 10, padding: 25 }}><ImagePlus size={35} color={colors.green} strokeWidth={1.4} /><Text style={ui.muted}>No photo</Text></View>}
    </View>
    {!image ? <View style={ui.row}><Button title={photo ? 'Choose another' : 'Choose photo'} secondary icon={ImagePlus} onPress={() => { void choose(false); }} disabled={busy || picking} style={{ flex: 1 }} /><Button title="Camera" secondary icon={Camera} onPress={() => { void choose(true); }} disabled={busy || picking} /></View> : null}
    <Field label="Item name" placeholder="Item name" value={title} onChangeText={setTitle} maxLength={120} editable={!busy} />
    <Choices label="Collection" options={collections.map(collection => ({ id: collection.id, name: collection.name }))} value={collectionId} onChange={chooseCollection} disabled={busy} />
    <Choices label="Category" options={[{ id: '', name: 'No category' }, ...selectedCategories.map(category => ({ id: category.id, name: category.name }))]} value={categoryId} onChange={setCategoryId} disabled={busy} />
    <Choices label="Visibility" options={[{ id: 'private', name: 'Private' }, { id: 'public', name: 'Public' }]} value={visibility} onChange={value => setVisibility(value as 'private' | 'public')} disabled={busy} />
    <Text style={[ui.muted, { fontSize: 12, lineHeight: 18 }]}>{visibility === 'public' ? 'This item can appear in the public view. Notes stay private.' : 'Only you can view this item.'}</Text>
    <Field label="Notes (optional)" placeholder="Item notes" value={notes} onChangeText={setNotes} maxLength={2000} multiline editable={!busy} />
    <ErrorMessage message={error} /><Button title={item || savedId ? 'Save item' : 'Add item'} icon={Check} onPress={() => { void save(); }} loading={busy} disabled={picking} />
  </Sheet>;
}

export function ConfirmDelete({ kind, name, action, onClose, onDeleted }: { kind: 'item' | 'collection' | 'category' | 'account'; name: string; action: () => Promise<void>; onClose: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [confirmation, setConfirmation] = useState('');
  async function remove() { setError(''); setBusy(true); try { await action(); onDeleted(); } catch (reason) { setError(messageOf(reason)); setBusy(false); } }
  const message = kind === 'account' ? 'This permanently deletes your account, every collection, category, item, and photo.' : kind === 'category' ? `“${name}” will be permanently deleted. Its entries will remain in the collection without a category.` : kind === 'collection' ? `“${name}” and all its items and photos will be permanently deleted.` : `“${name}” and its photo will be permanently deleted.`;
  return <Sheet title={`Delete ${kind}?`} onClose={onClose} busy={busy}><Text style={ui.text}>{message} This cannot be undone.</Text>{kind === 'account' ? <Field label="Type DELETE to confirm" value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" editable={!busy} /> : null}<ErrorMessage message={error} /><Button title={`Permanently delete ${kind}`} danger icon={Trash2} onPress={() => { void remove(); }} loading={busy} disabled={kind === 'account' && confirmation !== 'DELETE'} /><Button title="Keep it" secondary onPress={onClose} disabled={busy} /></Sheet>;
}
