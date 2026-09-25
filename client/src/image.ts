/**
 * Shrinks a photo on the phone before upload: longest side capped at 1600 px, re-encoded as JPEG.
 * A 4-8 MB camera photo becomes roughly 200-500 KB, which matters on weak mine-site networks.
 */
export async function compressImage(file: File, maxSide = 1600, quality = 0.72): Promise<string> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error(`${file.name} is not an image this browser can read.`);
  });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', quality);
}
