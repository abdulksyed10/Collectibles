export type Category = { id: string; owner_id: string; name: string; created_at: string };
export type CategoryDraft = { name: string };
export type CollectionVisibility = 'private' | 'public';
export type Collection = { id: string; owner_id: string; category_id: string; name: string; description: string; visibility: CollectionVisibility; acquired_on: string; created_at: string };
export type Item = { id: string; owner_id: string; collection_id: string; title: string; notes: string; created_at: string; updated_at: string };
export type ItemDraft = { title: string; notes: string; collectionId: string };
export type CollectionDraft = { name: string; description: string; categoryId: string; visibility?: CollectionVisibility; acquiredOn?: string };
export type ItemImage = { itemId: string; url: string; thumbnailUrl: string; expiresAt: string };
export type PreparedPhoto = { uri: string; imageBase64: string; thumbnailBase64: string };
export type ItemPage = { items: Item[]; hasMore: boolean; total: number };
export type SharedCollectionPage = {
  collection: { id: string; name: string; description: string; categoryName: string };
  items: { id: string; title: string; hasPhoto: boolean }[];
  total: number;
  hasMore: boolean;
};
export type PublicCollectionCard = {
  id: string;
  name: string;
  description: string;
  categoryName: string;
  itemCount: number;
  coverItemId: string | null;
  isOwner: boolean;
};
export type PublicCollectionPage = { collections: PublicCollectionCard[]; total: number; hasMore: boolean };
export interface CollectionRepository {
  listCategories(): Promise<Category[]>;
  saveCategory(draft: CategoryDraft, id?: string): Promise<Category>;
  deleteCategory(categoryId: string): Promise<void>;
  listCollections(): Promise<Collection[]>;
  saveCollection(draft: CollectionDraft, id?: string): Promise<Collection>;
  listItems(options: { categoryId?: string; collectionId?: string; search: string; page: number; visibility?: CollectionVisibility }): Promise<ItemPage>;
  readSharedCollection(collectionId: string, page: number): Promise<SharedCollectionPage>;
  listPublicCollections(page: number): Promise<PublicCollectionPage>;
  saveItem(draft: ItemDraft, id?: string): Promise<Item>;
  readImages(itemIds: string[]): Promise<ItemImage[]>;
  uploadPhoto(itemId: string, photo: PreparedPhoto): Promise<void>;
  deleteItem(itemId: string): Promise<void>;
  deleteCollection(collectionId: string): Promise<void>;
  deleteAccount(): Promise<void>;
}
