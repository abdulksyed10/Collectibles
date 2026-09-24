import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, RefreshControl, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LogOut, Package, Pencil, Plus, Search, Share2, Trash2, X } from 'lucide-react-native';
import type { Category, Collection, Item } from '../domain/models';
import { useRepository } from '../data/RepositoryProvider';
import { useLibrary } from '../data/useLibrary';
import { auth } from '../auth/session';
import { Brand, Button, colors, ErrorMessage, fonts, messageOf, Sheet, ui } from '../components/ui';
import { CollectionNavigator } from '../components/CollectionNavigator';
import { shareCollectionLink } from '../lib/sharing';
import { CategoryEditor, CollectionEditor, ConfirmDelete, ItemEditor } from './Editors';
import { PublicCatalog } from './PublicCatalog';

type Dialog =
  | { type: 'category'; category?: Category; collection: Collection }
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
  const columns = width >= 1180 ? 4 : width >= 620 ? 3 : 2;
  const [tab, setTab] = useState<'library' | 'explore'>('library');
  const [categoryId, setCategoryId] = useState<string>();
  const [collectionId, setCollectionId] = useState<string>();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [accountError, setAccountError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareStatus, setShareStatus] = useState('');
  const [shareError, setShareError] = useState('');
  const [hasPublicEntries, setHasPublicEntries] = useState(false);

  useEffect(() => { const timeout = setTimeout(() => setQuery(search), 250); return () => clearTimeout(timeout); }, [search]);
  const library = useLibrary(categoryId, collectionId, query);
  const collection = library.collections.find(value => value.id === collectionId);
  const category = library.categories.find(value => value.id === categoryId);
  const collectionForCategory = category ? library.collections.find(value => value.id === category.collection_id) : undefined;

  useEffect(() => {
    let current = true;
    if (!collectionId) { setHasPublicEntries(false); return () => { current = false; }; }
    void repository.listItems({ collectionId, search: '', page: 0, visibility: 'public' }).then(page => { if (current) setHasPublicEntries(page.total > 0); }).catch(() => { if (current) setHasPublicEntries(false); });
    return () => { current = false; };
  }, [collectionId, repository, library.total]);

  function changed() { setDialog(null); setShareStatus(''); setShareError(''); library.refresh(); }
  function selectCollection(id?: string) { setCollectionId(id); setCategoryId(undefined); setSearch(''); }
  function selectCategory(parentId: string, id?: string) { setCollectionId(parentId); setCategoryId(id); setSearch(''); }
  function openAddItem() { if (!library.collections.length) setDialog({ type: 'collection' }); else setDialog({ type: 'item' }); }
  function openCategory(parentId: string) {
    const parent = library.collections.find(value => value.id === parentId);
    if (parent) setDialog({ type: 'category', collection: parent });
  }
  async function shareCollection(id: string) {
    setShareBusy(true); setShareStatus(''); setShareError('');
    try { setShareStatus(await shareCollectionLink(id)); }
    catch (reason) { setShareError(messageOf(reason)); }
    finally { setShareBusy(false); }
  }
  async function signOut() {
    setAccountError(''); setSigningOut(true);
    try {
      if (onExitDemo) { await repository.deleteAccount(); await Image.clearMemoryCache(); onExitDemo(); }
      else { try { await auth.signOut(); } finally { await Image.clearMemoryCache(); } }
    } catch (reason) { setAccountError(messageOf(reason)); setSigningOut(false); }
  }
  const itemCategory = (item: Item) => library.categories.find(value => value.id === item.category_id);
  const itemCollection = (item: Item) => library.collections.find(value => value.id === item.collection_id);
  const emptyTitle = query ? 'No matching entries' : !library.collections.length ? 'No collections yet.' : 'No entries yet.';
  const emptyMessage = query ? 'Try another search.' : !library.collections.length ? 'Create a collection, then add your first entry.' : 'Add an entry to this collection.';
  const emptyActionLabel = query ? 'Clear search' : !library.collections.length ? 'New collection' : 'Add item';
  function performEmptyAction() { if (query) setSearch(''); else openAddItem(); }

  const header = <View style={{ paddingBottom: 16, gap: 14 }}>
    {onExitDemo ? <Text style={[ui.muted, { fontSize: 12 }]}>Demo · Changes reset when you leave.</Text> : null}
    <View style={{ flexDirection: 'row', gap: 8, borderBottomWidth: 1, borderColor: colors.line }}>
      <Pressable accessibilityRole="button" accessibilityLabel="My collections" accessibilityState={{ selected: tab === 'library' }} {...(Platform.OS === 'web' ? { 'aria-pressed': tab === 'library' } : {})} onPress={() => setTab('library')} style={{ minHeight: 48, paddingHorizontal: 14, justifyContent: 'center', borderBottomWidth: tab === 'library' ? 3 : 0, borderBottomColor: colors.green }}><Text style={{ fontFamily: tab === 'library' ? fonts.bold : fonts.medium, color: tab === 'library' ? colors.green : colors.muted }}>My collections</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Explore" accessibilityState={{ selected: tab === 'explore' }} {...(Platform.OS === 'web' ? { 'aria-pressed': tab === 'explore' } : {})} onPress={() => setTab('explore')} style={{ minHeight: 48, paddingHorizontal: 14, justifyContent: 'center', borderBottomWidth: tab === 'explore' ? 3 : 0, borderBottomColor: colors.green }}><Text style={{ fontFamily: tab === 'explore' ? fonts.bold : fonts.medium, color: tab === 'explore' ? colors.green : colors.muted }}>Explore</Text></Pressable>
    </View>
    <View style={[ui.row, { justifyContent: 'space-between', minHeight: 48 }]}>
      <View style={{ flex: 1, gap: 2 }}><Text numberOfLines={1} style={[ui.title, { fontSize: wide ? 36 : 30, lineHeight: wide ? 40 : 34 }]}>{collection?.name ?? 'All collections'}</Text>{category ? <Text style={ui.muted}>{category.name}</Text> : null}</View>
      {category && collectionForCategory ? <Pressable accessibilityRole="button" accessibilityLabel="Edit this category" onPress={() => setDialog({ type: 'category', category, collection: collectionForCategory })} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.line }}><Pencil size={18} color={colors.green} /></Pressable> : collection ? <Pressable accessibilityRole="button" accessibilityLabel="Edit this collection" onPress={() => setDialog({ type: 'collection', collection })} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.line }}><Pencil size={18} color={colors.green} /></Pressable> : null}
    </View>
    {collection?.description ? <Text style={[ui.muted, { maxWidth: 650 }]}>{collection.description}</Text> : null}
    {collection?.acquired_on ? <Text style={[ui.muted, { fontSize: 12 }]}>Acquired {collection.acquired_on}</Text> : null}
    {collection ? <View style={{ gap: 8 }}><View style={[ui.row, { flexWrap: 'wrap' }]}>{onExitDemo ? null : <Button title="Share collection" icon={Share2} onPress={() => { void shareCollection(collection.id); }} loading={shareBusy} disabled={!hasPublicEntries} />}{onPreviewShared ? <Button title="Preview public view" secondary onPress={() => onPreviewShared(collection.id)} disabled={!hasPublicEntries} /> : null}</View>{!hasPublicEntries ? <Text style={[ui.muted, { fontSize: 12 }]}>Make an entry public to share this collection.</Text> : null}{shareStatus ? <Text accessibilityLiveRegion="polite" style={ui.muted}>{shareStatus}</Text> : null}<ErrorMessage message={shareError} /></View> : null}
    <View style={[ui.row, { gap: 8 }]}><View style={[ui.row, { flex: 1, minWidth: 0, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingLeft: 14, minHeight: 48 }]}><Search size={18} color={colors.muted} /><TextInput accessibilityLabel="Search entries" placeholder="Search entries" placeholderTextColor="#8B968D" value={search} onChangeText={setSearch} style={{ flex: 1, minWidth: 0, fontFamily: fonts.body, fontSize: 14, color: colors.ink, paddingVertical: 12 }} />{search ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setSearch('')} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}><X size={16} color={colors.muted} /></Pressable> : null}</View><Button title="Add item" icon={Plus} onPress={openAddItem} /></View>
    {!wide ? <CollectionNavigator compact collections={library.collections} categories={library.categories} selectedCollectionId={collectionId} selectedCategoryId={categoryId} onSelectCollection={selectCollection} onSelectCategory={selectCategory} onAddCollection={() => setDialog({ type: 'collection' })} onAddCategory={openCategory} /> : null}
    <View style={[ui.row, { justifyContent: 'space-between', borderBottomWidth: 1, borderColor: colors.line, paddingBottom: 10 }]}><Text style={{ fontFamily: fonts.bold, fontSize: 15, color: colors.ink }}>{query ? 'Search results' : 'Entries'} <Text style={{ color: colors.muted, fontFamily: fonts.body }}>{library.loading ? '' : `(${library.total})`}</Text></Text></View>
    <ErrorMessage message={library.error} />{library.error ? <Button title="Try again" secondary onPress={library.refresh} /> : null}
    {library.photoError ? <View style={{ padding: 14, backgroundColor: colors.sand, borderRadius: 12, gap: 10 }}><Text style={[ui.text, { fontSize: 13 }]}>{library.photoError}</Text><Button title="Retry photos" secondary onPress={() => { void library.refreshPhotos(); }} /></View> : null}
  </View>;

  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }}><View style={[ui.row, { paddingHorizontal: wide ? 32 : 16, minHeight: 56, justifyContent: 'space-between', borderBottomWidth: 1, borderColor: colors.line, backgroundColor: colors.card }]}><Brand small={!wide} /><Pressable accessibilityRole="button" accessibilityLabel="Account settings" onPress={() => setDialog({ type: 'settings' })} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: colors.pale }}><Text style={{ color: colors.green, fontFamily: fonts.bold }}>{email[0]?.toUpperCase() ?? 'Y'}</Text></Pressable></View>
    {tab === 'explore' ? <PublicCatalog demo={Boolean(onExitDemo)} onLibrary={() => setTab('library')} onOpen={id => onPreviewShared?.(id)} /> : <View style={{ flex: 1, flexDirection: 'row', width: '100%', maxWidth: 1500, alignSelf: 'center' }}>
      {wide ? <View style={{ width: 260, padding: 16, borderRightWidth: 1, borderColor: colors.line }}><CollectionNavigator collections={library.collections} categories={library.categories} selectedCollectionId={collectionId} selectedCategoryId={categoryId} onSelectCollection={selectCollection} onSelectCategory={selectCategory} onAddCollection={() => setDialog({ type: 'collection' })} onAddCategory={openCategory} /></View> : null}
      <FlatList key={columns} data={library.items} keyExtractor={item => item.id} numColumns={columns} style={{ flex: 1 }} contentContainerStyle={{ padding: wide ? 32 : 16, paddingBottom: 50, flexGrow: 1 }} ListHeaderComponent={header} refreshControl={<RefreshControl refreshing={library.loading} onRefresh={library.refresh} tintColor={colors.green} />} renderItem={({ item }) => {
        const image = library.images[item.id]; const itemParent = itemCollection(item); const itemGroup = itemCategory(item);
        return <View style={{ width: `${100 / columns}%`, padding: 7 }}><Pressable accessibilityRole="button" accessibilityLabel={`Open ${item.title}`} onPress={() => setDialog({ type: 'detail', item })} style={({ pressed }) => [{ borderWidth: 1, borderColor: colors.line, borderRadius: 17, backgroundColor: colors.card, overflow: 'hidden', opacity: pressed ? 0.85 : 1 }]}><View style={{ aspectRatio: 1, backgroundColor: '#ECEFE7', alignItems: 'center', justifyContent: 'center' }}>{image ? <Image source={{ uri: image.thumbnailUrl }} cachePolicy="memory" style={{ width: '100%', height: '100%' }} contentFit="cover" transition={180} accessibilityLabel={item.title} /> : <Package size={36} color="#94A18F" strokeWidth={1.2} />}</View><View style={{ padding: 13, gap: 5 }}><Text numberOfLines={1} style={{ fontFamily: fonts.bold, fontSize: 14, color: colors.ink }}>{item.title}</Text><Text numberOfLines={1} style={[ui.muted, { fontSize: 11, lineHeight: 16 }]}>{itemParent?.name ?? 'Collection'}{itemGroup ? ` / ${itemGroup.name}` : ''}</Text><Text style={{ color: item.visibility === 'public' ? colors.green : colors.muted, fontFamily: fonts.medium, fontSize: 11 }}>{item.visibility === 'public' ? 'Public' : 'Private'}</Text></View></Pressable></View>;
      }} ListEmptyComponent={library.loading ? <View style={{ alignItems: 'center', padding: 32 }}><ActivityIndicator color={colors.green} /><Text style={[ui.muted, { marginTop: 8 }]}>Loading entries…</Text></View> : !library.error ? <View style={{ alignItems: 'center', paddingVertical: 24, paddingHorizontal: 20, gap: 10 }}><Text style={[ui.text, { fontFamily: fonts.bold, textAlign: 'center' }]}>{emptyTitle}</Text><Text style={[ui.muted, { textAlign: 'center', maxWidth: 340 }]}>{emptyMessage}</Text><Button title={emptyActionLabel} icon={query ? undefined : Plus} onPress={performEmptyAction} /></View> : null} ListFooterComponent={library.hasMore ? <Button title="Load more entries" secondary onPress={() => { void library.loadMore(); }} loading={library.moreLoading} style={{ margin: 16 }} /> : null} />
    </View>}
    {dialog?.type === 'category' ? <CategoryEditor category={dialog.category} collection={dialog.collection} onClose={() => setDialog(null)} onSaved={value => { selectCategory(value.collection_id, value.id); changed(); }} onDelete={() => { if (dialog.category) setDialog({ type: 'delete-category', category: dialog.category }); }} /> : null}
    {dialog?.type === 'collection' ? <CollectionEditor collection={dialog.collection} onClose={() => setDialog(null)} onSaved={value => { selectCollection(value.id); changed(); }} onDelete={() => { if (dialog.collection) setDialog({ type: 'delete-collection', collection: dialog.collection }); }} /> : null}
    {dialog?.type === 'item' ? <ItemEditor item={dialog.item} image={dialog.item ? library.images[dialog.item.id] : undefined} collections={library.collections} categories={library.categories} initialCategory={categoryId} initialCollection={collectionId} onClose={() => setDialog(null)} onSaved={changed} /> : null}
    {dialog?.type === 'detail' ? <Sheet title={dialog.item.title} onClose={() => setDialog(null)}><View style={{ aspectRatio: 1, backgroundColor: colors.pale, borderRadius: 18, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>{library.images[dialog.item.id] ? <Image source={{ uri: library.images[dialog.item.id]!.url }} cachePolicy="memory" style={{ width: '100%', height: '100%' }} contentFit="contain" accessibilityLabel={dialog.item.title} /> : <Package size={60} color="#94A18F" />}</View><Text style={ui.muted}>{itemCollection(dialog.item)?.name ?? 'Collection'}{itemCategory(dialog.item) ? ` / ${itemCategory(dialog.item)?.name}` : ''}</Text><Text style={[ui.muted, { fontSize: 12 }]}>{dialog.item.visibility === 'public' ? 'Public' : 'Private'}</Text>{dialog.item.notes ? <View><Text style={ui.label}>Notes</Text><Text style={ui.text}>{dialog.item.notes}</Text></View> : null}<Text style={[ui.muted, { fontSize: 12 }]}>Added {new Date(dialog.item.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</Text><View style={ui.row}><Button title="Edit item" secondary icon={Pencil} onPress={() => setDialog({ type: 'item', item: dialog.item })} style={{ flex: 1 }} /><Button title="Delete" secondary danger icon={Trash2} onPress={() => setDialog({ type: 'delete-item', item: dialog.item })} /></View></Sheet> : null}
    {dialog?.type === 'delete-item' ? <ConfirmDelete kind="item" name={dialog.item.title} action={() => repository.deleteItem(dialog.item.id)} onClose={() => setDialog(null)} onDeleted={changed} /> : null}
    {dialog?.type === 'delete-collection' ? <ConfirmDelete kind="collection" name={dialog.collection.name} action={() => repository.deleteCollection(dialog.collection.id)} onClose={() => setDialog(null)} onDeleted={() => { selectCollection(undefined); changed(); }} /> : null}
    {dialog?.type === 'delete-category' ? <ConfirmDelete kind="category" name={dialog.category.name} action={() => repository.deleteCategory(dialog.category.id)} onClose={() => setDialog(null)} onDeleted={() => { selectCategory(collectionId ?? '', undefined); changed(); }} /> : null}
    {dialog?.type === 'settings' ? <Sheet title="Account" onClose={() => setDialog(null)} busy={signingOut}><View><Text style={ui.label}>{onExitDemo ? 'Demo' : 'Signed in as'}</Text><Text style={ui.text}>{email}</Text></View>{onExitDemo ? <Text style={ui.muted}>Demo changes reset when you leave.</Text> : null}<ErrorMessage message={accountError} /><Button title={onExitDemo ? 'Exit demo' : 'Sign out'} secondary icon={LogOut} loading={signingOut} onPress={() => { void signOut(); }} />{!onExitDemo ? <Button title="Delete my account" secondary danger icon={Trash2} disabled={signingOut} onPress={() => setDialog({ type: 'delete-account' })} /> : null}</Sheet> : null}
    {dialog?.type === 'delete-account' ? <ConfirmDelete kind="account" name="your account" action={() => repository.deleteAccount()} onClose={() => setDialog(null)} onDeleted={() => { setDialog({ type: 'settings' }); void signOut(); }} /> : null}
  </SafeAreaView>;
}
