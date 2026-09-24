export type ItemVisibility = 'private' | 'public';

export type Collection = {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  acquired_on: string | null;
  created_at: string;
};
export type CollectionSummary = Collection & { itemCount: number; coverItemId: string | null; lastUploadedAt: string | null };

export type Category = {
  id: string;
  owner_id: string;
  collection_id: string;
  name: string;
  description: string;
  acquired_on: string | null;
  created_at: string;
};
export type CategoryDraft = { name: string; collectionId: string; description?: string; acquiredOn?: string | null };

export type Item = {
  id: string;
  owner_id: string;
  collection_id: string;
  category_id: string | null;
  visibility: ItemVisibility;
  title: string;
  notes: string;
  created_at: string;
  updated_at: string;
};
export type ItemDraft = { title: string; notes: string; collectionId: string; categoryId?: string | null; visibility?: ItemVisibility };
export type CollectionDraft = { name: string; description: string; acquiredOn?: string | null };
export type CollectionListOptions = { search?: string; visibility?: ItemVisibility };
export type ItemListOptions = { categoryId?: string; collectionId?: string; search: string; page: number; visibility?: ItemVisibility };
export type ItemImage = { itemId: string; url: string; thumbnailUrl: string; expiresAt: string };
export type PreparedPhoto = { uri: string; imageBase64: string; thumbnailBase64: string };
export type ItemPage = { items: Item[]; hasMore: boolean; total: number };
export type SharedCollectionPage = {
  collection: { id: string; name: string };
  scope: { collectionId: string; categoryId: string | null };
  categories: { id: string; name: string }[];
  items: { id: string; title: string; hasPhoto: boolean; categoryId: string | null; categoryName: string | null }[];
  total: number;
  hasMore: boolean;
};
export type PublicCollectionCard = {
  id: string;
  name: string;
  itemCount: number;
  coverItemId: string | null;
  isOwner: boolean;
};
export type PublicCollectionPage = { collections: PublicCollectionCard[]; total: number; hasMore: boolean };
export type PublicEntryCard = {
  id: string;
  title: string;
  hasPhoto: boolean;
  collectionId: string;
  collectionName: string;
};
export type PublicEntryPage = { entries: PublicEntryCard[]; total: number; hasMore: boolean };
export interface CollectionRepository {
  listCategories(collectionId?: string): Promise<Category[]>;
  saveCategory(draft: CategoryDraft, id?: string): Promise<Category>;
  deleteCategory(categoryId: string): Promise<void>;
  listCollections(options?: CollectionListOptions): Promise<CollectionSummary[]>;
  saveCollection(draft: CollectionDraft, id?: string): Promise<Collection>;
  listItems(options: ItemListOptions): Promise<ItemPage>;
  readSharedCollection(collectionId: string, page: number): Promise<SharedCollectionPage>;
  listPublicEntries(page: number): Promise<PublicEntryPage>;
  listPublicCollections(page: number): Promise<PublicCollectionPage>;
  saveItem(draft: ItemDraft, id?: string): Promise<Item>;
  readImages(itemIds: string[]): Promise<ItemImage[]>;
  uploadPhoto(itemId: string, photo: PreparedPhoto): Promise<void>;
  deleteItem(itemId: string): Promise<void>;
  deleteCollection(collectionId: string): Promise<void>;
  deleteAccount(): Promise<void>;
}
