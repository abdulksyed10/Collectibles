import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FolderHeart, Grid2X2, Layers3, LogOut, Package, Pencil, Plus, Search, Share2, Trash2, X } from 'lucide-react-native';
import type { Category, Collection, Item } from '../domain/models';
import { useRepository } from '../data/RepositoryProvider';
import { useLibrary } from '../data/useLibrary';
import { auth } from '../auth/session';
import { Brand, Button, colors, ErrorMessage, fonts, messageOf, Sheet, ui } from '../components/ui';
import { shareCollectionLink } from '../lib/sharing';
import { CategoryEditor, CollectionEditor, ConfirmDelete, ItemEditor } from './Editors';
import { PublicCatalog } from './PublicCatalog';

type Dialog =
  | { type: 'category'; category?: Category }
  | { type: 'collection'; collection?: Collection }
  | { type: 'item'; item?: Item }
  | { type: 'detail'; item: Item }
  | { type: 'delete-item'; item: Item }
  | { type: 'delete-collection'; collection: Collection }
  | { type: 'delete-category'; category: Category }
  | { type: 'settings' }
  | { type: 'delete-account' }
  | null;

export function LibraryScreen({ email, onExitDemo, onPreviewShared }: { email: string; onExitDemo?: () => void; onPreviewShared?: (collectionId: string) => void }) {
  const repository = useRepository();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const columns = width >= 1250 ? 4 : width >= 650 ? 3 : 2;
  const [categoryId, setCategoryId] = useState<string>();
  const [collectionId, setCollectionId] = useState<string>();
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [managingPublicCollection, setManagingPublicCollection] = useState(false);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [accountError, setAccountError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareStatus, setShareStatus] = useState('');
  const [shareError, setShareError] = useState('');
  useEffect(() => { const timeout = setTimeout(() => setQuery(search), 250); return () => clearTimeout(timeout); }, [search]);
  const library = useLibrary(categoryId, collectionId, query, visibility);
  const category = library.categories.find(c => c.id === categoryId);
  const collection = library.collections.find(c => c.id === collectionId);
  const visibleCollections = library.collections.filter(c => c.visibility === visibility && (!categoryId || c.category_id === categoryId));
  const canAddItem = visibleCollections.length > 0;
  const categoryFor = (itemCollection?: Collection) => library.categories.find(c => c.id === itemCollection?.category_id);
  function changed() { setDialog(null); library.refresh(); }
  function openAddItem() { setDialog(canAddItem ? { type: 'item' } : library.categories.length ? { type: 'collection' } : { type: 'category' }); }
  function selectVisibility(next: 'private' | 'public') { setVisibility(next); setManagingPublicCollection(false); setCategoryId(undefined); setCollectionId(undefined); setSearch(''); setShareStatus(''); setShareError(''); }
  async function shareCollection(id: string) {
    setShareBusy(true); setShareStatus(''); setShareError('');
    try { setShareStatus(await shareCollectionLink(id)); }
    catch (e) { setShareError(messageOf(e)); }
    finally { setShareBusy(false); }
  }
  async function signOut() {
    setAccountError(''); setSigningOut(true);
    try {
      if (onExitDemo) { await repository.deleteAccount(); await Image.clearMemoryCache(); onExitDemo(); }
      else { try { await auth.signOut(); } finally { await Image.clearMemoryCache(); } }
    } catch (e) { setAccountError(messageOf(e)); setSigningOut(false); }
  }
  function selectCategory(id?: string) { setCategoryId(id); setCollectionId(undefined); setSearch(''); }
  function selectCollection(value?: Collection) { setCollectionId(value?.id); if (value) { setCategoryId(value.category_id); if (visibility === 'public') setManagingPublicCollection(true); } else if (visibility === 'public') setManagingPublicCollection(false); setSearch(''); }
  function managePublicCollection(id: string) {
    const value = library.collections.find(collection => collection.id === id && collection.visibility === 'public');
    if (!value) return;
    setManagingPublicCollection(true); setCategoryId(value.category_id); setCollectionId(value.id); setSearch('');
  }
  const showingPublicCatalog = visibility === 'public' && !managingPublicCollection;
  const colorsForCollections = ['#E6ECD9', '#F0DDD0', '#DDE8EC', '#EBE0EC', '#F1E9CD'];
  function filterButton(key: string, label: string, active: boolean, onPress: () => void, icon: 'all' | 'category' | 'collection', index = 0) {
    return <Pressable key={key} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }} {...(Platform.OS === 'web' ? { 'aria-pressed': active } : {})} onPress={onPress} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, paddingHorizontal: 12, minHeight: 48, backgroundColor: active ? colors.pale : pressed ? '#F0F2EC' : 'transparent', marginBottom: wide ? 5 : 0, borderWidth: wide ? 0 : 1, borderColor: active ? '#C7D6C6' : colors.line, maxWidth: wide ? '100%' : 210 }]}>
      {icon === 'all' ? <Grid2X2 size={20} color={colors.green} /> : <View style={{ height: 25, width: 25, borderRadius: 8, backgroundColor: colorsForCollections[index % colorsForCollections.length], alignItems: 'center', justifyContent: 'center' }}>{icon === 'category' ? <Layers3 size={14} color={colors.green} /> : <FolderHeart size={14} color={colors.green} />}</View>}
      <Text numberOfLines={1} style={{ color: active ? colors.green : colors.muted, fontFamily: active ? fonts.bold : fonts.medium, fontSize: 14, flexShrink: 1 }}>{label}</Text>
    </Pressable>;
  }
  const categoryFilters = <>{filterButton('all', 'All items', !categoryId, () => selectCategory(undefined), 'all')}{library.categories.map((c, i) => filterButton(c.id, c.name, categoryId === c.id, () => selectCategory(c.id), 'category', i))}</>;
  const collectionFilters = <>{filterButton('all-collections', 'All collections', !collectionId, () => selectCollection(undefined), 'all')}{visibleCollections.map((c, i) => filterButton(c.id, c.name, collectionId === c.id, () => selectCollection(c), 'collection', i))}</>;
  const newCategory = <Pressable accessibilityRole="button" accessibilityLabel="New category" onPress={() => setDialog({ type: 'category' })} style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><Plus size={20} color={colors.green} /></Pressable>;
  const newCollection = <Pressable accessibilityRole="button" accessibilityLabel="New collection" onPress={() => setDialog(library.categories.length ? { type: 'collection' } : { type: 'category' })} style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><Plus size={20} color={colors.green} /></Pressable>;
  const noCollections = visibleCollections.length === 0;
  const emptyTitle = query ? 'No matching items' : noCollections ? `No ${visibility} collections` : 'No items yet';
  const emptyMessage = query ? 'Try another search.' : noCollections ? visibility === 'public' ? 'Edit a private collection and choose Public to share it.' : 'Create a collection to add items.' : 'Add an item to this collection.';
  const emptyAction = query ? 'Clear search' : noCollections && visibility === 'public' ? 'View private collections' : canAddItem ? 'Add item' : library.categories.length ? 'New collection' : 'New category';
  function onEmptyAction() { if (query) setSearch(''); else if (noCollections && visibility === 'public') selectVisibility('private'); else openAddItem(); }
  const header = <View style={{ paddingHorizontal: 8, paddingBottom: 16, gap: 12 }}>
    {onExitDemo ? <Text style={[ui.muted, { fontSize: 12 }]}>Demo · Changes reset when you leave.</Text> : null}
    <View style={{ flexDirection: 'row', gap: 8 }}>{(['private', 'public'] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityLabel={`${value === 'private' ? 'Private' : 'Public'} collections`} accessibilityState={{ selected: visibility === value }} {...(Platform.OS === 'web' ? { 'aria-selected': visibility === value } : {})} onPress={() => selectVisibility(value)} style={{ minHeight: 48, minWidth: 100, flex: wide ? 0 : 1, borderBottomWidth: visibility === value ? 3 : 1, borderBottomColor: visibility === value ? colors.green : colors.line, justifyContent: 'center', alignItems: 'center' }}><Text style={{ fontFamily: visibility === value ? fonts.bold : fonts.medium, color: visibility === value ? colors.green : colors.muted }}>{value === 'private' ? 'Private' : 'Public'} ({library.collections.filter(c => c.visibility === value).length})</Text></Pressable>)}</View>
    <View style={[ui.row, { justifyContent: 'space-between', minHeight: 48 }]}><Text numberOfLines={2} style={[ui.title, { flex: 1, fontSize: wide ? 36 : 30, lineHeight: wide ? 40 : 34 }]}>{collection?.name ?? category?.name ?? 'Collections'}</Text>{collection ? <Pressable accessibilityRole="button" accessibilityLabel="Edit this collection" onPress={() => setDialog({ type: 'collection', collection })} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.line }}><Pencil size={18} color={colors.green} /></Pressable> : category ? <Pressable accessibilityRole="button" accessibilityLabel="Edit this category" onPress={() => setDialog({ type: 'category', category })} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.line }}><Pencil size={18} color={colors.green} /></Pressable> : null}</View>
    {collection?.description ? <Text style={[ui.muted, { maxWidth: 650 }]}>{collection.description}</Text> : null}
    {collection ? <Text style={[ui.muted, { fontSize: 12 }]}>Acquired {collection.acquired_on}</Text> : null}
    {collection?.visibility === 'public' ? <View style={{ gap: 8 }}><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{onExitDemo ? null : <Button title="Share collection" icon={Share2} onPress={() => { void shareCollection(collection.id); }} loading={shareBusy} />}{onPreviewShared ? <Button title="Preview public view" secondary onPress={() => onPreviewShared(collection.id)} /> : null}</View>{shareStatus ? <Text accessibilityLiveRegion="polite" style={ui.muted}>{shareStatus}</Text> : null}<ErrorMessage message={shareError} /></View> : null}
    <View style={[ui.row, { flexWrap: 'wrap', gap: 8 }]}><View style={[ui.row, { flex: 1, minWidth: 180, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 14, minHeight: 48 }]}><Search size={18} color={colors.muted} /><TextInput accessibilityLabel="Search items" placeholder="Search items" placeholderTextColor="#8B968D" value={search} onChangeText={setSearch} style={{ flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.ink, paddingVertical: 12 }} />{search ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setSearch('')} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}><X size={16} color={colors.muted} /></Pressable> : null}</View><Button title="Add item" icon={Plus} onPress={openAddItem} disabled={library.loading && !library.categories.length} /></View>
    {!wide ? <View style={{ gap: 8 }}>
      <View style={{ gap: 2 }}><Text style={[ui.label, { marginBottom: 0, fontSize: 12 }]}>Categories ({library.categories.length})</Text><View style={[ui.row, { minWidth: 0, gap: 8 }]}><ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1, minWidth: 0 }} contentContainerStyle={{ gap: 8, alignItems: 'center' }}>{categoryFilters}</ScrollView>{newCategory}</View></View>
      <View style={{ gap: 2 }}><Text style={[ui.label, { marginBottom: 0, fontSize: 12 }]}>Collections ({visibleCollections.length})</Text><View style={[ui.row, { minWidth: 0, gap: 8 }]}><ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1, minWidth: 0 }} contentContainerStyle={{ gap: 8, alignItems: 'center' }}>{collectionFilters}</ScrollView>{newCollection}</View></View>
    </View> : null}
    <View style={[ui.row, { justifyContent: 'space-between', borderBottomWidth: 1, borderColor: colors.line, paddingBottom: 10 }]}><Text style={{ fontFamily: fonts.bold, fontSize: 15, color: colors.ink }}>{query ? 'Search results' : 'Items'} <Text style={{ color: colors.muted, fontFamily: fonts.body }}>{library.loading ? '' : `(${library.total})`}</Text></Text></View>
    <ErrorMessage message={library.error} />{library.error ? <Button title="Try again" secondary onPress={library.refresh} /> : null}
    {library.photoError ? <View style={{ padding: 14, backgroundColor: colors.sand, borderRadius: 12, gap: 10 }}><Text style={[ui.text, { fontSize: 13 }]}>{library.photoError}</Text><Button title="Retry photos" secondary onPress={() => { void library.refreshPhotos(); }} /></View> : null}
  </View>;
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }}><View style={[ui.row, { paddingHorizontal: wide ? 32 : 16, minHeight: 56, justifyContent: 'space-between', borderBottomWidth: 1, borderColor: colors.line, backgroundColor: colors.card }]}><Brand small={!wide} /><Pressable accessibilityRole="button" accessibilityLabel="Account settings" onPress={() => setDialog({ type: 'settings' })} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: colors.pale }}><Text style={{ color: colors.green, fontFamily: fonts.bold }}>{email[0]?.toUpperCase() ?? 'Y'}</Text></Pressable></View>
    {showingPublicCatalog ? <PublicCatalog demo={Boolean(onExitDemo)} onPrivate={() => selectVisibility('private')} onOpen={id => onPreviewShared?.(id)} onManage={managePublicCollection} /> : <View style={{ flex: 1, flexDirection: 'row', width: '100%', maxWidth: 1500, alignSelf: 'center' }}>
      {wide ? <View style={{ width: 246, padding: 16, borderRightWidth: 1, borderColor: colors.line }}><View style={[ui.row, { justifyContent: 'space-between', marginBottom: 4 }]}><Text style={ui.label}>Categories ({library.categories.length})</Text>{newCategory}</View><ScrollView style={{ maxHeight: '45%', flexGrow: 0 }}>{categoryFilters}</ScrollView><View style={[ui.row, { justifyContent: 'space-between', marginTop: 16, marginBottom: 4 }]}><Text style={ui.label}>Collections ({visibleCollections.length})</Text>{newCollection}</View><ScrollView>{collectionFilters}</ScrollView></View> : null}
      <FlatList key={columns} data={library.items} keyExtractor={item => item.id} numColumns={columns} style={{ flex: 1 }} contentContainerStyle={{ padding: wide ? 32 : 16, paddingBottom: 50, flexGrow: 1 }} ListHeaderComponent={header} refreshControl={<RefreshControl refreshing={library.loading} onRefresh={library.refresh} tintColor={colors.green} />} renderItem={({ item }) => {
        const image = library.images[item.id]; const itemCollection = library.collections.find(c => c.id === item.collection_id); const itemCategory = categoryFor(itemCollection);
        return <View style={{ width: `${100 / columns}%`, padding: 8 }}><Pressable accessibilityRole="button" accessibilityLabel={`Open ${item.title}`} onPress={() => setDialog({ type: 'detail', item })} style={({ pressed }) => [{ borderWidth: 1, borderColor: colors.line, borderRadius: 17, backgroundColor: colors.card, overflow: 'hidden', opacity: pressed ? 0.85 : 1 }]}><View style={{ aspectRatio: 1, backgroundColor: '#ECEFE7', alignItems: 'center', justifyContent: 'center' }}>{image ? <Image source={{ uri: image.thumbnailUrl }} cachePolicy="memory" style={{ width: '100%', height: '100%' }} contentFit="cover" transition={180} accessibilityLabel={item.title} /> : <View style={{ alignItems: 'center', gap: 8 }}><Package size={36} color="#94A18F" strokeWidth={1.2} /><Text style={{ fontSize: 11, color: colors.muted, fontFamily: fonts.body }}>No photo loaded</Text></View>}</View><View style={{ padding: 14, gap: 6 }}><Text numberOfLines={1} style={{ fontFamily: fonts.bold, fontSize: 14, color: colors.ink }}>{item.title}</Text><Text numberOfLines={1} style={[ui.muted, { fontSize: 11, lineHeight: 16 }]}>{itemCategory?.name ?? 'Category'} / {itemCollection?.name ?? 'Collection'}</Text></View></Pressable></View>;
      }} ListEmptyComponent={library.loading ? <View style={{ alignItems: 'center', padding: 32 }}><ActivityIndicator color={colors.green} /><Text style={[ui.muted, { marginTop: 8 }]}>Loading items…</Text></View> : !library.error ? <View style={{ alignItems: 'center', paddingVertical: 20, paddingHorizontal: 20, gap: 10 }}><Text style={[ui.text, { fontFamily: fonts.bold, textAlign: 'center' }]}>{emptyTitle}</Text><Text style={[ui.muted, { textAlign: 'center', maxWidth: 340 }]}>{emptyMessage}</Text><Button title={emptyAction} icon={query || noCollections && visibility === 'public' ? undefined : Plus} onPress={onEmptyAction} /></View> : null} ListFooterComponent={library.hasMore ? <Button title="Load more items" secondary onPress={() => { void library.loadMore(); }} loading={library.moreLoading} style={{ margin: 16 }} /> : null} />
    </View>}
    {dialog?.type === 'category' ? <CategoryEditor category={dialog.category} canDelete={!library.collections.some(c => c.category_id === dialog.category?.id)} onClose={() => setDialog(null)} onSaved={value => { selectCategory(value.id); changed(); }} onDelete={() => { if (dialog.category) setDialog({ type: 'delete-category', category: dialog.category }); }} /> : null}
    {dialog?.type === 'collection' ? <CollectionEditor collection={dialog.collection} categories={library.categories} initialCategory={categoryId} onClose={() => setDialog(null)} onSaved={value => { setCategoryId(value.category_id); setCollectionId(value.id); setVisibility(value.visibility); setManagingPublicCollection(value.visibility === 'public'); setShareStatus(''); setShareError(''); changed(); }} onDelete={() => { if (dialog.collection) setDialog({ type: 'delete-collection', collection: dialog.collection }); }} /> : null}
    {dialog?.type === 'item' ? <ItemEditor item={dialog.item} image={dialog.item ? library.images[dialog.item.id] : undefined} collections={dialog.item ? library.collections : library.collections.filter(c => c.visibility === visibility)} categories={library.categories} initialCategory={categoryId} initialCollection={collectionId} onClose={() => setDialog(null)} onSaved={changed} /> : null}
    {dialog?.type === 'detail' ? <Sheet title={dialog.item.title} onClose={() => setDialog(null)}><View style={{ aspectRatio: 1, backgroundColor: colors.pale, borderRadius: 18, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>{library.images[dialog.item.id] ? <Image source={{ uri: library.images[dialog.item.id]!.url }} cachePolicy="memory" style={{ width: '100%', height: '100%' }} contentFit="contain" accessibilityLabel={dialog.item.title} /> : <Package size={60} color="#94A18F" />}</View><Text style={ui.muted}>{categoryFor(library.collections.find(c => c.id === dialog.item.collection_id))?.name} / {library.collections.find(c => c.id === dialog.item.collection_id)?.name}</Text>{dialog.item.notes ? <View><Text style={ui.label}>Notes</Text><Text style={ui.text}>{dialog.item.notes}</Text></View> : null}<Text style={[ui.muted, { fontSize: 12 }]}>Added {new Date(dialog.item.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</Text><View style={ui.row}><Button title="Edit item" secondary icon={Pencil} onPress={() => setDialog({ type: 'item', item: dialog.item })} style={{ flex: 1 }} /><Button title="Delete" secondary danger icon={Trash2} onPress={() => setDialog({ type: 'delete-item', item: dialog.item })} /></View></Sheet> : null}
    {dialog?.type === 'delete-item' ? <ConfirmDelete kind="item" name={dialog.item.title} action={() => repository.deleteItem(dialog.item.id)} onClose={() => setDialog(null)} onDeleted={changed} /> : null}
    {dialog?.type === 'delete-collection' ? <ConfirmDelete kind="collection" name={dialog.collection.name} action={() => repository.deleteCollection(dialog.collection.id)} onClose={() => setDialog(null)} onDeleted={() => { setCollectionId(undefined); changed(); }} /> : null}
    {dialog?.type === 'delete-category' ? <ConfirmDelete kind="category" name={dialog.category.name} action={() => repository.deleteCategory(dialog.category.id)} onClose={() => setDialog(null)} onDeleted={() => { selectCategory(undefined); changed(); }} /> : null}
    {dialog?.type === 'settings' ? <Sheet title="Account" onClose={() => setDialog(null)} busy={signingOut}><View><Text style={ui.label}>{onExitDemo ? 'Demo' : 'Signed in as'}</Text><Text style={ui.text}>{email}</Text></View>{onExitDemo ? <Text style={ui.muted}>Demo changes reset when you leave.</Text> : null}<ErrorMessage message={accountError} /><Button title={onExitDemo ? 'Exit demo' : 'Sign out'} secondary icon={LogOut} loading={signingOut} onPress={() => { void signOut(); }} />{!onExitDemo ? <Button title="Delete my account" secondary danger icon={Trash2} disabled={signingOut} onPress={() => setDialog({ type: 'delete-account' })} /> : null}</Sheet> : null}
    {dialog?.type === 'delete-account' ? <ConfirmDelete kind="account" name="your account" action={() => repository.deleteAccount()} onClose={() => setDialog(null)} onDeleted={() => { setDialog({ type: 'settings' }); void signOut(); }} /> : null}
  </SafeAreaView>;
}
