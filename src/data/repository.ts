import { requireClient } from '../lib/supabase';
import { escapeSearch, validateCollection, validatePin } from '../domain/validation';
import type { Collection, CollectionRepository, Pin, PinImage } from '../domain/models';
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
  async listCollections() {
    const { data, error } = await requireClient().from('collections').select('*').order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    return data as Collection[];
  },
  async saveCollection(draft, id) {
    const value = validateCollection(draft);
    const query = id ? requireClient().from('collections').update(value).eq('id', id) : requireClient().from('collections').insert(value);
    const { data, error } = await query.select().single();
    if (error) throw error;
    return data as Collection;
  },
  async listPins({ collectionId, search, page }) {
    let query = requireClient().from('pins').select('*', { count: 'exact' }).order('created_at', { ascending: false }).order('id', { ascending: false });
    if (collectionId) query = query.eq('collection_id', collectionId);
    if (search.trim()) query = query.ilike('title', `%${escapeSearch(search.trim())}%`);
    const { data, count, error } = await query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) throw error;
    return { pins: data as Pin[], total: count ?? 0, hasMore: (page + 1) * PAGE_SIZE < (count ?? 0) };
  },
  async savePin(draft, id) {
    const value = { ...validatePin(draft), collection_id: draft.collectionId };
    const query = id ? requireClient().from('pins').update(value).eq('id', id) : requireClient().from('pins').insert(value);
    const { data, error } = await query.select().single();
    if (error) throw error;
    return data as Pin;
  },
  async readImages(pinIds) {
    if (!pinIds.length) return [];
    const results: PinImage[] = [];
    for (let i = 0; i < pinIds.length; i += 24) {
      const result = await media<{ images: PinImage[] }>({ action: 'read', pinIds: pinIds.slice(i, i + 24) });
      results.push(...result.images);
    }
    return results;
  },
  async uploadPhoto(pinId, photo) { await media({ action: 'upload', pinId, imageBase64: photo.imageBase64, thumbnailBase64: photo.thumbnailBase64 }); },
  async deletePin(pinId) { await media({ action: 'delete-pin', pinId }); },
  async deleteCollection(collectionId) { await media({ action: 'delete-collection', collectionId }); },
  async deleteAccount() { await media({ action: 'delete-account' }); },
};
