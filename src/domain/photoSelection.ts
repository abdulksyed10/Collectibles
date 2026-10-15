export const MAX_PHOTO_SELECTION = 10;
export const maxPhotoSelectionMessage = 'You can add up to 10 images at a time.';

/** The picker fields needed by the queue, without retaining photo bytes. */
export type SelectedPhotoAsset = {
  uri: string;
  width: number;
  height: number;
  type?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
};

export function appendPhotoAssets<T extends SelectedPhotoAsset>(current: T[], incoming: T[]): T[] {
  if (current.length + incoming.length > MAX_PHOTO_SELECTION) throw new Error(maxPhotoSelectionMessage);
  return [...current, ...incoming];
}
