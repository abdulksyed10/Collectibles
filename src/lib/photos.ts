import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import type { PreparedPhoto } from '../domain/models';
export async function pickPhoto(camera = false): Promise<PreparedPhoto | null> {
  if (camera) {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('Allow camera access in your device settings to take a photo.');
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: false, quality: 1, exif: false };
  const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.assets?.[0];
  if (result.canceled || !asset) return null;
  const resize = asset.width > asset.height ? { width: Math.min(asset.width, 1600) } : { height: Math.min(asset.height, 1600) };
  const image = await manipulateAsync(asset.uri, [{ resize }], { compress: 0.78, format: SaveFormat.JPEG, base64: true });
  const thumb = await manipulateAsync(image.uri, [{ resize: asset.width > asset.height ? { width: 360 } : { height: 360 } }], { compress: 0.65, format: SaveFormat.JPEG, base64: true });
  if (!image.base64 || !thumb.base64) throw new Error('This photo could not be prepared. Please choose another image.');
  if (image.base64.length * 0.75 > 2 * 1024 * 1024 || thumb.base64.length * 0.75 > 200 * 1024) throw new Error('This photo is too large. Try cropping it or choosing a smaller photo.');
  return { uri: image.uri, imageBase64: image.base64, thumbnailBase64: thumb.base64 };
}
