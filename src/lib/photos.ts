import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import type { PreparedPhoto } from '../domain/models';
import { assertImageAsset, normalizePickerError } from '../domain/photoValidation';
import { appendPhotoAssets, type SelectedPhotoAsset } from '../domain/photoSelection';

export type PickedPhotoAsset = ImagePicker.ImagePickerAsset & SelectedPhotoAsset;

export async function selectPhotoAssets({ camera = false, remaining }: { camera?: boolean; remaining: number }): Promise<PickedPhotoAsset[]> {
  if (!Number.isInteger(remaining) || remaining < 1 || remaining > 10) throw new Error('You can add up to 10 images at a time.');
  if (camera) {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('Allow camera access in your device settings to take a photo.');
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'], allowsEditing: false, quality: 1, exif: false,
    ...(!camera ? { allowsMultipleSelection: remaining > 1, selectionLimit: remaining } : {}),
  };
  let result: ImagePicker.ImagePickerResult;
  try {
    result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  } catch (error) {
    const message = normalizePickerError(error);
    if (message) throw new Error(message);
    throw error;
  }
  const assets = result.assets ?? [];
  if (result.canceled || !assets.length) return [];
  if (assets.length > remaining) throw new Error(`Choose up to ${remaining} more ${remaining === 1 ? 'image' : 'images'}. You can add 10 images in total.`);
  for (const asset of assets) assertImageAsset(asset);
  return appendPhotoAssets([], assets as PickedPhotoAsset[]);
}

export async function preparePhoto(asset: PickedPhotoAsset): Promise<PreparedPhoto> {
  assertImageAsset(asset);
  const resize = asset.width > asset.height ? { width: Math.min(asset.width, 1600) } : { height: Math.min(asset.height, 1600) };
  let image: Awaited<ReturnType<typeof manipulateAsync>>;
  let thumb: Awaited<ReturnType<typeof manipulateAsync>>;
  try {
    image = await manipulateAsync(asset.uri, [{ resize }], { compress: 0.78, format: SaveFormat.JPEG, base64: true });
    thumb = await manipulateAsync(image.uri, [{ resize: asset.width > asset.height ? { width: 360 } : { height: 360 } }], { compress: 0.65, format: SaveFormat.JPEG, base64: true });
  } catch {
    throw new Error('This image could not be opened. Choose another image.');
  }
  if (!image.base64 || !thumb.base64) throw new Error('This photo could not be prepared. Please choose another image.');
  if (image.base64.length * 0.75 > 2 * 1024 * 1024 || thumb.base64.length * 0.75 > 200 * 1024) throw new Error('This photo is too large. Try cropping it or choosing a smaller photo.');
  return { uri: image.uri, imageBase64: image.base64, thumbnailBase64: thumb.base64 };
}

/** Existing single-photo callers still receive a prepared image. */
export async function pickPhoto(camera = false): Promise<PreparedPhoto | null> {
  const [asset] = await selectPhotoAssets({ camera, remaining: 1 });
  return asset ? preparePhoto(asset) : null;
}
