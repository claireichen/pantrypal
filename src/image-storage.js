'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const MIME_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp']
]);

function decodeImage(dataUrl) {
  if (!dataUrl) return null;
  if (typeof dataUrl !== 'string') throw Object.assign(new Error('Invalid recipe photo.'), { statusCode: 400 });
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([a-zA-Z0-9+/=]+)$/);
  if (!match || !MIME_TYPES.has(match[1])) {
    throw Object.assign(new Error('Choose a JPG, PNG, or WebP image.'), { statusCode: 400 });
  }
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > 3 * 1024 * 1024) {
    throw Object.assign(new Error('The prepared recipe photo must be smaller than 3 MB.'), { statusCode: 400 });
  }
  return { buffer, mimeType: match[1], extension: MIME_TYPES.get(match[1]) };
}

async function uploadRecipeImage(dataUrl) {
  const image = decodeImage(dataUrl);
  if (!image) return '';
  const fileName = `recipe-${crypto.randomUUID()}.${image.extension}`;
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    const baseUrl = SUPABASE_URL.replace(/\/$/, '');
    const response = await fetch(`${baseUrl}/storage/v1/object/recipe-images/${fileName}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': image.mimeType,
        'x-upsert': 'false'
      },
      body: image.buffer
    });
    if (!response.ok) throw new Error(`Recipe photo upload failed (${response.status}).`);
    return `${baseUrl}/storage/v1/object/public/recipe-images/${fileName}`;
  }

  if (process.env.VERCEL) throw new Error('Cloud image storage is not configured.');
  const uploadDirectory = path.resolve(__dirname, '../public/uploads');
  await fs.mkdir(uploadDirectory, { recursive: true });
  await fs.writeFile(path.join(uploadDirectory, fileName), image.buffer);
  return `/uploads/${fileName}`;
}

async function removeRecipeImage(imageUrl) {
  if (!imageUrl) return;
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    const baseUrl = SUPABASE_URL.replace(/\/$/, '');
    const prefix = `${baseUrl}/storage/v1/object/public/recipe-images/`;
    if (!imageUrl.startsWith(prefix)) return;
    const fileName = imageUrl.slice(prefix.length);
    await fetch(`${baseUrl}/storage/v1/object/recipe-images/${encodeURIComponent(fileName)}`, {
      method: 'DELETE',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
      }
    });
    return;
  }
  if (/^\/uploads\/[a-zA-Z0-9._-]+$/.test(imageUrl)) {
    await fs.unlink(path.resolve(__dirname, `../public${imageUrl}`)).catch(() => {});
  }
}

module.exports = { decodeImage, uploadRecipeImage, removeRecipeImage };
