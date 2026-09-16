import { requireClient } from '../lib/supabase';
import { escapeSearch, validateCategory, validateCollection, validateItem } from '../domain/validation';
import type { Category, Collection, CollectionRepository, Item, ItemImage } from '../domain/models';
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
  async listCategories() {
    const { data, error } = await requireClient().from('categories').select('*').order('created_at').order('id').limit(20);
    if (error) throw error;
    return data as Category[];
  },
  async saveCategory(draft, id) {
    const value = validateCategory(draft);
    const query = id ? requireClient().from('categories').update(value).eq('id', id) : requireClient().from('categories').insert(value);
    const { data, error } = await query.select().single();
    if (error) throw error;
    return data as Category;
  },
  async deleteCategory(id) {
    const { error } = await requireClient().from('categories').delete().eq('id', id);
    if (error?.code === '23503') throw new Error('Move or delete this category’s collections first.');
    if (error) throw error;
  },
  async listCollections() {
    const { data, error } = await requireClient().from('collections').select('*').order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    return data as Collection[];
  },
  async saveCollection(draft, id) {
    if (!draft.categoryId) throw new Error('Choose a category first.');
    const value = { ...validateCollection(draft), category_id: draft.categoryId };
    const query = id ? requireClient().from('collections').update(value).eq('id', id) : requireClient().from('collections').insert(value);
    const { data, error } = await query.select().single();
    if (error) throw error;
    return data as Collection;
  },
  async listItems({ categoryId, collectionId, search, page }) {
    let query = requireClient().from('items').select('*,collections!inner(category_id)', { count: 'exact' }).order('created_at', { ascending: false }).order('id', { ascending: false });
    if (categoryId) query = query.eq('collections.category_id', categoryId);
    if (collectionId) query = query.eq('collection_id', collectionId);
    if (search.trim()) query = query.ilike('title', `%${escapeSearch(search.trim())}%`);
    const { data, count, error } = await query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) throw error;
    return { items: data as Item[], total: count ?? 0, hasMore: (page + 1) * PAGE_SIZE < (count ?? 0) };
  },
  async saveItem(draft, id) {
    const value = { ...validateItem(draft), collection_id: draft.collectionId };
    const query = id ? requireClient().from('items').update(value).eq('id', id) : requireClient().from('items').insert(value);
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
