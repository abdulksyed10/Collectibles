import { requireClient } from '../lib/supabase';
import { escapeSearch, validateCategory, validateCategorySettings, validateCollection, validateItem, validateItemSettings } from '../domain/validation';
import type { BlockedPublisher, Category, Collection, CollectionRepository, CollectionSummary, Item, ItemImage, PublicationStatus, PublicCollectionPage, PublicEntryPage, PublicReportReason, PublicTopicDetail, PublicTopicPage, SharedCollectionPage } from '../domain/models';
import { todayLocalDate } from '../domain/dates';
import { isCollectionId, validateSharedPage } from '../domain/sharing';
import { guestBlocks, saveGuestBlocks, publicPreferencesChanged } from '../lib/publisherPreferences';
const PAGE_SIZE = 24;
async function publicBlocksHeader() {
  const { data } = await requireClient().auth.getSession();
  return data.session ? '' : (await guestBlocks()).map(row => row.publisherId).join(',');
}
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
    const value = validateCollection(draft);
    const query = id ? requireClient().from('collections').update(value).eq('id', id) : requireClient().from('collections').insert(value);
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
    const items = data as Item[];
    if (items.length) {
      const { data: publicationRows, error: publicationError } = await requireClient().rpc('list_owned_publications', { p_item_ids: items.map(item => item.id) });
      if (publicationError) throw publicationError;
      const publications = new Map(((publicationRows ?? []) as Array<{ itemId: string; status: string; message: string }>).map(row => [row.itemId, row]));
      for (const item of items) {
        const publication = publications.get(item.id);
        if (publication && ['private', 'pending', 'approved', 'rejected', 'removed'].includes(publication.status)) item.publication = { status: publication.status as PublicationStatus, message: publication.message };
      }
    }
    return { items, total: count ?? 0, hasMore: (page + 1) * PAGE_SIZE < (count ?? 0) };
  },
  async readSharedCollection(collectionId, page) {
    if (!isCollectionId(collectionId)) throw new Error('Collection unavailable.');
    validateSharedPage(page);
    const { data, error } = await requireClient().rpc('get_shared_collection', { p_collection_id: collectionId, p_page: page }).setHeader('x-collectibles-blocks', await publicBlocksHeader());
    if (error) throw new Error('Unable to load this collection. Try again.');
    if (!data) throw new Error('Collection unavailable.');
    return data as SharedCollectionPage;
  },
  async listPublicEntries(page) {
    validateSharedPage(page);
    const { data, error } = await requireClient().rpc('list_public_entries', { p_page: page }).setHeader('x-collectibles-blocks', await publicBlocksHeader());
    if (error || !data) throw new Error('Unable to load Explore. Try again.');
    return data as PublicEntryPage;
  },
  async listPublicCollections(page) {
    validateSharedPage(page);
    const { data, error } = await requireClient().rpc('list_public_collections', { p_page: page }).setHeader('x-collectibles-blocks', await publicBlocksHeader());
    if (error || !data) throw new Error('Unable to load public collections. Try again.');
    return data as PublicCollectionPage;
  },
  async listPublicTopics(page) {
    validateSharedPage(page);
    const { data, error } = await requireClient().rpc('list_public_topics', { p_page: page }).setHeader('x-collectibles-blocks', await publicBlocksHeader());
    if (error || !data) throw new Error('Unable to load public collections. Try again.');
    return data as PublicTopicPage;
  },
  async readPublicTopic(topicKey, page) {
    if (!topicKey || topicKey.length > 160) throw new Error('Collection unavailable.');
    validateSharedPage(page);
    const { data, error } = await requireClient().rpc('get_public_topic', { p_topic_key: topicKey, p_page: page }).setHeader('x-collectibles-blocks', await publicBlocksHeader());
    if (error || !data) throw new Error('Collection unavailable.');
    return data as PublicTopicDetail;
  },
  async getPolicyAcceptance() {
    const { data, error } = await requireClient().rpc('get_policy_acceptance');
    if (error || !data) throw new Error('Unable to check Terms acceptance. Try again.');
    return data;
  },
  async acceptPublicRules() {
    const { error } = await requireClient().rpc('accept_public_rules', { p_version: '2026-10-04' });
    if (error) throw new Error('Unable to record your public-sharing agreement. Try again.');
  },
  async reportPublicContent(target) {
    if ((Boolean(target.itemId) === Boolean(target.collectionId)) || !target.reason) throw new Error('Choose the entry or collection to report.');
    const { data: session } = await requireClient().auth.getSession();
    const response = session.session
      ? await requireClient().rpc('report_public_content', { p_item_id: target.itemId ?? null, p_collection_id: target.collectionId ?? null, p_reason: target.reason, p_details: target.details?.trim() ?? '' })
      : await requireClient().functions.invoke('public-safety', { body: { itemId: target.itemId, collectionId: target.collectionId, reason: target.reason, details: target.details?.trim() ?? '', captchaToken: target.captchaToken } });
    if (response.error) throw new Error('Unable to send this report. Complete the verification or try again later. You can also contact support.');
  },
  async blockPublicCollection(collectionId) {
    if (!isCollectionId(collectionId)) throw new Error('Collection unavailable.');
    const { data: session } = await requireClient().auth.getSession();
    if (!session.session) {
      const shared = await this.readSharedCollection(collectionId, 0);
      if (!shared.collection.publisherId) throw new Error('Collector unavailable.');
      const rows = await guestBlocks();
      if (!rows.some(row => row.publisherId===shared.collection.publisherId)) await saveGuestBlocks([...rows, {publisherId: shared.collection.publisherId, blockedAt: new Date().toISOString()}]);
      return true;
    }
    const { data, error } = await requireClient().rpc('block_public_collection', { p_collection_id: collectionId });
    if (error) {
      if (error.code === '42501') throw new Error('Sign in to block a collector.');
      throw new Error('Unable to block this collector. Try again.');
    }
    publicPreferencesChanged();
    return Boolean(data);
  },
  async listBlockedPublishers() {
    const { data: session } = await requireClient().auth.getSession();
    if (!session.session) return guestBlocks();
    const { data, error } = await requireClient().rpc('list_blocked_publishers');
    if (error) throw new Error('Unable to load blocked collectors. Try again.');
    return (data ?? []) as BlockedPublisher[];
  },
  async unblockPublicPublisher(publisherId) {
    const { data: session } = await requireClient().auth.getSession();
    if (!session.session) { await saveGuestBlocks((await guestBlocks()).filter(row => row.publisherId!==publisherId)); return true; }
    if (!isCollectionId(publisherId)) throw new Error('Collector unavailable.');
    const { data, error } = await requireClient().rpc('unblock_public_publisher', { p_publisher_id: publisherId });
    if (error) throw new Error('Unable to unblock this collector. Try again.');
    publicPreferencesChanged();
    return Boolean(data);
  },
  async saveItem(draft, id) {
    const value = { ...validateItem(draft), ...validateItemSettings(draft) };
    const newCollectionName = draft.newCollectionName === undefined ? null : validateCollection({ name: draft.newCollectionName, description: '' }).name;
    const newCategoryName = draft.newCategoryName === undefined ? null : validateCategory({ name: draft.newCategoryName }).name;
    if (draft.collectionId && newCollectionName) throw new Error('Choose one collection option.');
    if (draft.categoryId && newCategoryName) throw new Error('Choose one category option.');

    if (id) {
      if (!draft.collectionId) throw new Error('Choose a collection first.');
      if (newCollectionName || newCategoryName) throw new Error('Create a new collection or category before moving an existing item.');
      const { data, error } = await requireClient().from('items').update({ ...value, collection_id: draft.collectionId }).eq('id', id).select().single();
      if (error) throw error;
      return data as Item;
    }

    const { data, error } = await requireClient().rpc('save_item_draft', {
      p_title: value.title,
      p_notes: value.notes,
      p_visibility: value.visibility ?? 'private',
      p_collection_id: draft.collectionId || null,
      p_new_collection_name: newCollectionName,
      p_category_id: value.category_id ?? null,
      p_new_category_name: newCategoryName,
      p_acquired_on: value.acquired_on === undefined ? todayLocalDate() : value.acquired_on,
    });
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
