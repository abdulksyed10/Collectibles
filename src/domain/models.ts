export type Collection = { id: string; owner_id: string; name: string; description: string; created_at: string };
export type Pin = { id: string; owner_id: string; collection_id: string; title: string; notes: string; created_at: string; updated_at: string };
export type PinDraft = { title: string; notes: string; collectionId: string };
export type CollectionDraft = { name: string; description: string };
export type PinImage = { pinId: string; url: string; thumbnailUrl: string; expiresAt: string };
export type PreparedPhoto = { uri: string; imageBase64: string; thumbnailBase64: string };
export type PinPage = { pins: Pin[]; hasMore: boolean; total: number };
export interface CollectionRepository {
  listCollections(): Promise<Collection[]>;
  saveCollection(draft: CollectionDraft, id?: string): Promise<Collection>;
  listPins(options: { collectionId?: string; search: string; page: number }): Promise<PinPage>;
  savePin(draft: PinDraft, id?: string): Promise<Pin>;
  readImages(pinIds: string[]): Promise<PinImage[]>;
  uploadPhoto(pinId: string, photo: PreparedPhoto): Promise<void>;
  deletePin(pinId: string): Promise<void>;
  deleteCollection(collectionId: string): Promise<void>;
  deleteAccount(): Promise<void>;
}
