export const unsupportedPhotoTypeMessage = 'Unsupported file type. Only images are supported.';

export type PhotoAssetMetadata = { type?: string | null; mimeType?: string | null };

export function assertImageAsset(asset: PhotoAssetMetadata) {
  if (asset.type && asset.type !== 'image') throw new Error(unsupportedPhotoTypeMessage);
  if (asset.mimeType && !asset.mimeType.toLowerCase().startsWith('image/')) throw new Error(unsupportedPhotoTypeMessage);
}

export function normalizePickerError(error: unknown): string | null {
  const message = error instanceof Error ? error.message : '';
  return /^Unsupported file type(?::[^.]+)?\. Only images and videos are supported\.?$/i.test(message.trim()) ? unsupportedPhotoTypeMessage : null;
}
