/**
 * Image dimension probing, from the file header alone.
 *
 * Why not `sharp` or `image-size`? Because this runs in three places — the
 * browser, a Node server, and an edge runtime — and a native binary rules out
 * two of them. Reading the handful of bytes that every format puts near the
 * front is a hundred lines and works everywhere.
 *
 * Dimensions matter more than they look: without them the editor cannot set an
 * intrinsic aspect ratio, so every uploaded image causes a layout shift the
 * first time it paints.
 */

export interface ImageInfo {
  mimeType: string;
  width: number;
  height: number;
  /** SVG has no intrinsic pixel size unless a viewBox says so. */
  scalable?: boolean;
}

const decoder = new TextDecoder();

export function probeImage(bytes: Uint8Array): ImageInfo | null {
  return (
    probePng(bytes) ??
    probeJpeg(bytes) ??
    probeGif(bytes) ??
    probeWebp(bytes) ??
    probeAvif(bytes) ??
    probeSvg(bytes) ??
    null
  );
}

function u16be(b: Uint8Array, o: number): number {
  return (b[o]! << 8) | b[o + 1]!;
}
function u32be(b: Uint8Array, o: number): number {
  return ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
}
function u16le(b: Uint8Array, o: number): number {
  return b[o]! | (b[o + 1]! << 8);
}
function u32le(b: Uint8Array, o: number): number {
  return (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;
}

function probePng(b: Uint8Array): ImageInfo | null {
  // 89 50 4E 47 0D 0A 1A 0A, then an IHDR chunk with width/height at 16.
  if (b.length < 24) return null;
  if (b[0] !== 0x89 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47) return null;
  return { mimeType: 'image/png', width: u32be(b, 16), height: u32be(b, 20) };
}

function probeJpeg(b: Uint8Array): ImageInfo | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;

  // Walk the segment chain to the first Start-Of-Frame marker. Skipping
  // segments by their declared length is the only reliable way through — EXIF
  // thumbnails would otherwise be mistaken for the image itself.
  let offset = 2;
  while (offset + 9 < b.length) {
    if (b[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = b[offset + 1]!;
    // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15 carry dimensions.
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

    if (isSof) {
      return { mimeType: 'image/jpeg', height: u16be(b, offset + 5), width: u16be(b, offset + 7) };
    }
    const length = u16be(b, offset + 2);
    if (length <= 0) return null;
    offset += 2 + length;
  }
  return null;
}

function probeGif(b: Uint8Array): ImageInfo | null {
  if (b.length < 10) return null;
  if (decoder.decode(b.subarray(0, 3)) !== 'GIF') return null;
  return { mimeType: 'image/gif', width: u16le(b, 6), height: u16le(b, 8) };
}

function probeWebp(b: Uint8Array): ImageInfo | null {
  if (b.length < 30) return null;
  if (decoder.decode(b.subarray(0, 4)) !== 'RIFF') return null;
  if (decoder.decode(b.subarray(8, 12)) !== 'WEBP') return null;

  const chunk = decoder.decode(b.subarray(12, 16));

  if (chunk === 'VP8 ') {
    // Lossy: 14-bit dimensions after the 3-byte start code.
    return {
      mimeType: 'image/webp',
      width: u16le(b, 26) & 0x3fff,
      height: u16le(b, 28) & 0x3fff,
    };
  }

  if (chunk === 'VP8L') {
    // Lossless packs width-1 and height-1 into 14 bits each.
    const bits = u32le(b, 21);
    return {
      mimeType: 'image/webp',
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }

  if (chunk === 'VP8X') {
    // Extended: 24-bit canvas dimensions minus one.
    const width = 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16));
    const height = 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16));
    return { mimeType: 'image/webp', width, height };
  }

  return null;
}

function probeAvif(b: Uint8Array): ImageInfo | null {
  if (b.length < 32) return null;
  if (decoder.decode(b.subarray(4, 8)) !== 'ftyp') return null;

  const brand = decoder.decode(b.subarray(8, 12));
  if (brand !== 'avif' && brand !== 'avis') return null;

  // Dimensions live in an `ispe` box somewhere in the meta box. Scanning for
  // the four-byte tag is cruder than a full box parse, but AVIF's box tree is
  // deep and this only needs the first spatial extent.
  for (let i = 12; i + 12 < b.length && i < 4096; i += 1) {
    if (b[i] === 0x69 && b[i + 1] === 0x73 && b[i + 2] === 0x70 && b[i + 3] === 0x65) {
      return { mimeType: 'image/avif', width: u32be(b, i + 8), height: u32be(b, i + 12) };
    }
  }
  return null;
}

function probeSvg(b: Uint8Array): ImageInfo | null {
  const head = decoder.decode(b.subarray(0, Math.min(b.length, 2048)));
  if (!/<svg[\s>]/i.test(head)) return null;

  const widthAttr = /\bwidth\s*=\s*["']?\s*([\d.]+)/i.exec(head);
  const heightAttr = /\bheight\s*=\s*["']?\s*([\d.]+)/i.exec(head);

  if (widthAttr && heightAttr) {
    return {
      mimeType: 'image/svg+xml',
      width: Math.round(Number(widthAttr[1])),
      height: Math.round(Number(heightAttr[1])),
      scalable: true,
    };
  }

  const viewBox = /\bviewBox\s*=\s*["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)/i.exec(head);
  if (viewBox) {
    return {
      mimeType: 'image/svg+xml',
      width: Math.round(Number(viewBox[1])),
      height: Math.round(Number(viewBox[2])),
      scalable: true,
    };
  }

  // A valid SVG with no intrinsic size: report zero and let the caller decide.
  return { mimeType: 'image/svg+xml', width: 0, height: 0, scalable: true };
}

/* -------------------------------------------------------------------------- */
/*                              base64 helpers                                */
/* -------------------------------------------------------------------------- */

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * base64 <-> bytes without `Buffer` or `atob`.
 *
 * `Buffer` does not exist in the browser and `atob` does not exist in older
 * Node; implementing it costs twenty lines and removes the branch entirely.
 */
export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/^data:[^,]+,/, '').replace(/[^A-Za-z0-9+/]/g, '');
  const length = Math.floor((clean.length * 3) / 4);
  const out = new Uint8Array(length);

  let byte = 0;
  let bits = 0;
  let index = 0;

  for (const char of clean) {
    const value = BASE64_ALPHABET.indexOf(char);
    if (value === -1) continue;
    byte = (byte << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[index++] = (byte >> bits) & 0xff;
    }
  }

  return index === length ? out : out.subarray(0, index);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];

    out += BASE64_ALPHABET[a >> 2];
    out += BASE64_ALPHABET[((a & 3) << 4) | ((b ?? 0) >> 4)];
    out += b === undefined ? '=' : BASE64_ALPHABET[((b & 15) << 2) | ((c ?? 0) >> 6)];
    out += c === undefined ? '=' : BASE64_ALPHABET[c & 63];
  }
  return out;
}

export function toDataUri(bytes: Uint8Array, mimeType: string): string {
  return `data:${mimeType};base64,${bytesToBase64(bytes)}`;
}

/** Parses a `data:` URI back into bytes plus its declared MIME type. */
export function parseDataUri(uri: string): { bytes: Uint8Array; mimeType: string } | null {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(uri);
  if (!match) return null;

  const mimeType = match[1]!;
  const body = match[3]!;

  if (match[2]) return { bytes: base64ToBytes(body), mimeType };
  return { bytes: new TextEncoder().encode(decodeURIComponent(body)), mimeType };
}
