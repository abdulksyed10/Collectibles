import type { CollectionRepository, Item, ItemImage, PreparedPhoto } from './models';
import { todayLocalDate } from './dates';

type PhotoRepository = Pick<CollectionRepository, 'readImages' | 'uploadPhoto'>;

export function initialItemAcquiredOn(item?: Pick<Item, 'acquired_on'>) {
  return item ? item.acquired_on : todayLocalDate();
}

export function savedItemPlacement(item: Pick<Item, 'id' | 'collection_id' | 'category_id'>) {
  return { id: item.id, collectionId: item.collection_id, categoryId: item.category_id };
}

/**
 * A completed request can lose its response. Confirm the item image before
 * offering another upload, so a retry never creates a second media attempt
 * when the original upload already committed.
 */
export async function confirmPhotoUpload(repository: PhotoRepository, itemId: string, photo: PreparedPhoto): Promise<'uploaded' | 'already-uploaded'> {
  try {
    await repository.uploadPhoto(itemId, photo);
    return 'uploaded';
  } catch (uploadError) {
    let images: ItemImage[];
    try { images = await repository.readImages([itemId]); }
    catch { throw uploadError; }
    if (images.some(image => image.itemId === itemId)) return 'already-uploaded';
    throw uploadError;
  }
}
