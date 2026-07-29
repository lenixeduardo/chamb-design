'use client';

import { AssetIngestor, DataUriStorage, HttpStorage } from '@opendesign/assets';

/**
 * The host's storage choice.
 *
 * Local-first by default: bytes are inlined into the document, so a project
 * stays a single self-contained JSON blob that needs no server. When
 * `NEXT_PUBLIC_ASSET_UPLOAD_URL` is set the same pipeline uploads instead, and
 * nothing else in the app changes — the document still just holds a URL.
 *
 * The 2 MB inline cap is not arbitrary: base64 inflates bytes by a third and
 * `localStorage` typically dies around 5 MB, so a larger default would let
 * someone lose a project by dropping in one photo.
 */
let ingestor: AssetIngestor | null = null;

export function getIngestor(): AssetIngestor {
  if (ingestor) return ingestor;

  const uploadUrl = process.env.NEXT_PUBLIC_ASSET_UPLOAD_URL;

  ingestor = new AssetIngestor({
    storage: uploadUrl
      ? new HttpStorage(uploadUrl, { label: 'Uploaded to the server' })
      : new DataUriStorage(2 * 1024 * 1024),
    maxBytes: uploadUrl ? 20 * 1024 * 1024 : 2 * 1024 * 1024,
  });

  return ingestor;
}

/** Extracts image files from a drop or paste event. */
export function imageFilesFrom(source: DataTransfer | ClipboardEvent['clipboardData']): File[] {
  if (!source) return [];

  const files: File[] = [];

  // `items` carries pasted screenshots, which never appear in `files`.
  for (const item of Array.from(source.items ?? [])) {
    if (item.kind !== 'file') continue;
    const file = item.getAsFile();
    if (file && file.type.startsWith('image/')) files.push(file);
  }

  if (files.length === 0) {
    for (const file of Array.from(source.files ?? [])) {
      if (file.type.startsWith('image/')) files.push(file);
    }
  }

  return files;
}

/** Reads a file as base64 without the data URI prefix — the shape vision wants. */
export async function fileToBase64(file: File | Blob): Promise<{ data: string; mimeType: string }> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  let binary = '';
  // Chunked to avoid blowing the argument limit on large screenshots.
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }

  return { data: btoa(binary), mimeType: file.type || 'image/png' };
}
