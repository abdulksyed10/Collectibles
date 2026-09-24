import { requireClient } from '../lib/supabase';
import { escapeSearch, validateCategory, validateCategorySettings, validateCollection, validateCollectionSettings, validateItem, validateItemSettings } from '../domain/validation';
import type { Category, Collection, CollectionRepository, CollectionSummary, Item, ItemImage, PublicCollectionPage, PublicEntryPage, SharedCollectionPage } from '../domain/models';
import { todayLocalDate } from '../domain/dates';
import { isCollectionId, validateSharedPage } from '../domain/sharing';
const PAGE_SIZE = 24;
async function media<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await requireClient().functions.invoke('media', { body });
  if (error) {
    let message = 'The photo service could not complete that request. Please try again.';
    if (error.context instanceof Response) {
      try { const details = await error.context.json(); if (typeof details.error === 'string') message = details.error; } catch { /* Use safe fallback. */ }
    }
    throw new Error(message);
  }
  return data as T;
}
export const repository: CollectionRepository = {
  async listCategories(collectionId) {
    let query = requireClient().from('categories').select('*').order('created_at').order('id').limit(50);
    if (collectionId) query = query.eq('collection_id', collectionId);
    const { data, error } = await query;
    if (error) throw error;
    return data as Category[];
  },
  async saveCategory(draft, id) {
    const value = { ...validateCategory(draft), ...validateCategorySettings(draft) };
    const query = id
      ? requireClient().from('categories').update(value).eq('id', id)
      : requireClient().from('categories').insert({ ...value, collection_id: draft.collectionId, description: value.description ?? '', acquired_on: value.acquired_on ?? null });
    const { data, error } = await query.select().single();
    if (error) throw error;
    return data as Category;
  },
  async deleteCategory(id) {
    const { error } = await requireClient().rpc('delete_category', { p_category_id: id });
    if (error) throw error;
  },
  async listCollections(options = {}) {
    const { data, error } = await requireClient().rpc('list_owned_collections', { p_search: options.search ?? '', p_visibility: options.visibility ?? null });
    if (error || !data) throw new Error('Unable to load your collections. Try again.');
    const rows = (data as { collections?: Array<{ id: string; ownerId: string; name: string; description: string; acquiredOn: string | null; createdAt: string; itemCount: number; coverItemId: string | null; lastUploadedAt: string | null }> }).collections ?? [];
    return rows.map(row => ({ id: row.id, owner_id: row.ownerId, name: row.name, description: row.description, acquired_on: row.acquiredOn, created_at: row.createdAt, itemCount: row.itemCount, coverItemId: row.coverItemId, lastUploadedAt: row.lastUploadedAt })) as CollectionSummary[];
  },
  async saveCollection(draft, id) {
    const value = { ...validateCollection(draft), ...validateCollectionSettings(draft) };
    const createValue = { ...value, acquired_on: value.acquired_on === undefined ? todayLocalDate() : value.acquired_on };
    const query = id ? requireClient().from('collections').update(value).eq('id', id) : requireClient().from('collections').insert(createValue);
    const { data, error } = await query.select().single();
    if (error) throw error;
    return data as Collection;
  },
  async listItems({ categoryId, collectionId, search, page, visibility }) {
    let query = requireClient().from('items').select('*', { count: 'exact' }).order('created_at', { ascending: false }).order('id', { ascending: false });
    if (visibility) query = query.eq('visibility', visibility);
    if (categoryId) query = query.eq('category_id', categoryId);
    if (collectionId) query = query.eq('collection_id', collectionId);
    if (search.trim()) query = query.ilike('title', `%${escapeSearch(search.trim())}%`);
    const { data, count, error } = await query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) throw error;
    return { items: data as Item[], total: count ?? 0, hasMore: (page + 1) * PAGE_SIZE < (count ?? 0) };
  },
  async readSharedCollection(collectionId, page) {
    if (!isCollectionId(collectionId)) throw new Error('Collection unavailable.');
    validateSharedPage(page);
    const { data, error } = await requireClient().rpc('get_shared_collection', { p_collection_id: collectionId, p_page: page });
    if (error) throw new Error('Unable to load this collection. Try again.');
    if (!data) throw new Error('Collection unavailable.');
    return data as SharedCollectionPage;
  },
  async listPublicEntries(page) {
    validateSharedPage(page);
    const { data, error } = await requireClient().rpc('list_public_entries', { p_page: page });
    if (error || !data) throw new Error('Unable to load Explore. Try again.');
    return data as PublicEntryPage;
  },
  async listPublicCollections(page) {
    validateSharedPage(page);
    const { data, error } = await requireClient().rpc('list_public_collections', { p_page: page });
    if (error || !data) throw new Error('Unable to load public collections. Try again.');
    return data as PublicCollectionPage;
  },
  async saveItem(draft, id) {
    const value = { ...validateItem(draft), ...validateItemSettings(draft), collection_id: draft.collectionId };
    const query = id
      ? requireClient().from('items').update(value).eq('id', id)
      : requireClient().from('items').insert({ ...value, category_id: value.category_id ?? null, visibility: value.visibility ?? 'private' });
    const { data, error } = await query.select().single();
    if (error) throw error;
    return data as Item;
  },
  async readImages(itemIds) {
    if (!itemIds.length) return [];
    const results: ItemImage[] = [];
    for (let i = 0; i < itemIds.length; i += 24) {
      const result = await media<{ images: ItemImage[] }>({ action: 'read', itemIds: itemIds.slice(i, i + 24) });
      results.push(...result.images);
    }
    return results;
  },
  async uploadPhoto(itemId, photo) { await media({ action: 'upload', itemId, imageBase64: photo.imageBase64, thumbnailBase64: photo.thumbnailBase64 }); },
  async deleteItem(itemId) { await media({ action: 'delete-item', itemId }); },
  async deleteCollection(collectionId) { await media({ action: 'delete-collection', collectionId }); },
  async deleteAccount() { await media({ action: 'delete-account' }); },
};
