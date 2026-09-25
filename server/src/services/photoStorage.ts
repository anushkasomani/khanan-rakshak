import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { prisma } from '../db';

/**
 * Uploaded photos live in the database (the Photo table), so they survive redeploys on hosts whose disk is
 * wiped. They are served at /api/uploads/<id>. To move to cloud storage (S3, Cloudinary, ...), reimplement
 * savePhoto() to upload there and return its URL; nothing else in the app needs to change.
 *
 * Photo ids are random UUIDs, so a photo can only be opened by someone who was given its link.
 */
export const PUBLIC_PREFIX = '/api/uploads';

const MAX_BYTES = 3 * 1024 * 1024;
const TYPES: Record<string, { ext: string; mime: string; magic: (b: Buffer) => boolean }> = {
  jpeg: { ext: 'jpg', mime: 'image/jpeg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  png: { ext: 'png', mime: 'image/png', magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  webp: { ext: 'webp', mime: 'image/webp', magic: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
};

export class PhotoError extends Error {}

/** True for a URL this app already stored, so an edit can keep existing photos as they are. */
export const isStoredPhoto = (url: unknown) => typeof url === 'string' && /^\/api\/uploads\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(url);

/** Saves a base64 data-URL image and returns its public URL. Throws PhotoError for bad input. */
export async function savePhoto(dataUrl: unknown, folder: string): Promise<string> {
  const match = typeof dataUrl === 'string' && /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new PhotoError('Photos must be JPEG, PNG or WebP images.');
  const type = TYPES[match[1]];
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > MAX_BYTES) throw new PhotoError('Each photo must be under 3 MB.');
  if (!type.magic(bytes)) throw new PhotoError('One of the photos is not a valid image.');

  const id = `${randomUUID()}.${type.ext}`;
  await prisma.photo.create({ data: { id, folder, contentType: type.mime, data: bytes } });
  return `${PUBLIC_PREFIX}/${id}`;
}

/** GET /api/uploads/:id. <img> tags can't send the auth header, so photos are served without it. */
export async function servePhoto(req: Request, res: Response) {
  const photo = await prisma.photo.findUnique({ where: { id: String(req.params.id) } });
  if (!photo) return res.status(404).json({ error: 'Photo not found' });
  res.set('Content-Type', photo.contentType);
  res.set('Cache-Control', 'private, max-age=2592000, immutable');
  return res.send(Buffer.from(photo.data));
}
