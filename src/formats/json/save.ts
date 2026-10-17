import { JDoc, parseDoc, sameNode } from './doc';

/**
 * A JSON save: `save.json`, `slot1.json`..., the .es3 saves of Unity's Easy
 * Save 3 and the .nson saves of Naninovel (JSON compressed with deflate).
 *
 * An edit replaces the value in the text of the file, so nothing else in it
 * changes: indentation, key order, `1.0`, escapes and numbers too large for a
 * double stay as they are. The file keeps its BOM and its compression.
 */
export interface JsonSave {
  /** The JSON text (without a BOM) and where each value is in it. */
  doc: JDoc;
  /** The document as read, to tell whether anything differs. */
  loaded: JDoc;
  /** The file's bytes, written back as is when nothing was edited (set when read from a file). */
  bytes?: Uint8Array;
  bom: boolean;
  /** gzip (Easy Save), raw DEFLATE, or zlib-wrapped DEFLATE (Naninovel). */
  compression?: 'gzip' | 'deflate' | 'zlib';
}

const BOM = '﻿';

/** Whether `text` is a JSON object or list (used to recognise a save by its content). */
export function looksLikeJsonSave(text: string): boolean {
  const trimmed = text.replace(/^﻿/, '').trimStart();
  if (trimmed[0] !== '{' && trimmed[0] !== '[') return false;
  try {
    const value = JSON.parse(trimmed);
    return value !== null && typeof value === 'object';
  } catch {
    return false;
  }
}

export function parseJsonSave(text: string, extra: Partial<JsonSave> = {}): JsonSave {
  const bom = text.startsWith(BOM);
  const body = bom ? text.slice(1) : text;
  let doc: JDoc;
  try {
    doc = parseDoc(body);
  } catch (error) {
    throw new Error(`Not a JSON file: ${(error as Error).message}`);
  }
  if (doc.root.k !== 'object' && doc.root.k !== 'array') throw new Error('The JSON file has no object or list at its top level');
  return { doc, loaded: doc, bom, ...extra };
}

/** The file's text: as read when nothing was edited. */
export function serializeJsonSave(save: JsonSave): string {
  return (save.bom ? BOM : '') + save.doc.text;
}

/** Whether two saves hold the same values, ignoring how numbers are written (`1.0` equals `1`). */
export const sameJsonData = (a: JsonSave, b: JsonSave) => a.doc.text === b.doc.text || sameNode(a.doc.root, b.doc.root);

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([data as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

const isGzip = (bytes: Uint8Array) => bytes[0] === 0x1f && bytes[1] === 0x8b;

const NOT_JSON =
  "This file isn't JSON text. It may be encrypted (Unity's Easy Save can protect saves with a password, which the app can't read) or not a save.";

const decodeUtf8 = (bytes: Uint8Array): string | null => {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return null;
  }
};

/**
 * Opens the bytes of a file: JSON text, gzip-compressed JSON (Easy Save), or
 * raw or zlib-wrapped DEFLATE JSON (Naninovel). Anything else (encrypted
 * saves...) is refused.
 */
export async function parseJsonBytes(bytes: Uint8Array): Promise<JsonSave> {
  let compression: JsonSave['compression'];
  let text: string | null = null;
  if (isGzip(bytes)) {
    try {
      text = decodeUtf8(await pipe(bytes, new DecompressionStream('gzip')));
    } catch {
      throw new Error('This file is compressed, but not in a way the app can read');
    }
    compression = 'gzip';
  } else {
    text = decodeUtf8(bytes);
    if (text === null || !looksLikeJsonSave(text)) {
      // Naninovel's .nson is DEFLATE-compressed JSON. Some writers use raw
      // DEFLATE (RFC 1951), while others wrap it in a zlib header (RFC 1950).
      for (const [format, mode] of [['deflate', 'deflate-raw'], ['zlib', 'deflate']] as const) {
        try {
          const inflated = decodeUtf8(await pipe(bytes, new DecompressionStream(mode)));
          if (inflated !== null && looksLikeJsonSave(inflated)) {
            text = inflated;
            compression = format;
            break;
          }
        } catch {
          // Try the other DEFLATE wrapper, then report an unsupported file.
        }
      }
    }
  }
  if (text === null || !looksLikeJsonSave(text)) throw new Error(NOT_JSON);
  return parseJsonSave(text, { bytes, compression });
}

/** The file's bytes: as read when nothing was edited, else the new text, compressed again if it was. */
export async function serializeJsonBytes(save: JsonSave): Promise<Uint8Array> {
  if (save.doc.text === save.loaded.text && save.bytes) return save.bytes;
  const bytes = new TextEncoder().encode(serializeJsonSave(save));
  if (save.compression === 'gzip') return pipe(bytes, new CompressionStream('gzip'));
  if (save.compression === 'deflate') return pipe(bytes, new CompressionStream('deflate-raw'));
  if (save.compression === 'zlib') return pipe(bytes, new CompressionStream('deflate'));
  return bytes;
}
