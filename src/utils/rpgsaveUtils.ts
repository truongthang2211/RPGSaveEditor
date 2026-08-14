import LZString from 'lz-string';
import { RPGSave } from '../types/RPGSave';

/** MV = LZ-String Base64; official MZ = pako/zlib written as a UTF-8 binary string. */
export type SaveCodec = 'lzstring' | 'pako';

function tryLzString(save: string): RPGSave | null {
  try {
    const decoded = LZString.decompressFromBase64(save);
    if (!decoded) return null;
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function binaryStringToBytes(save: string): Uint8Array {
  const compressed = new Uint8Array(save.length);
  for (let i = 0; i < save.length; i++) {
    compressed[i] = save.charCodeAt(i) & 0xff;
  }
  return compressed;
}

function bytesToBinaryString(bytes: Uint8Array): string {
  const chunk = 0x2000;
  let result = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    result += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return result;
}

async function tryPako(save: string): Promise<RPGSave | null> {
  try {
    if (typeof DecompressionStream === 'undefined') return null;
    const compressed = binaryStringToBytes(save);
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate'));
    const jsonStr = await new Response(stream).text();
    if (!jsonStr) return null;
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

async function deflateZlib(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  return bytesToBinaryString(bytes);
}

/**
 * Decode an RPG Maker MV (.rpgsave) or MZ (.rmmzsave) payload.
 * Tries the preferred codec first, then the other, so mislabeled files still open.
 */
export async function decodeRpgsave(save: string, preferred: SaveCodec = 'lzstring'): Promise<{ data: RPGSave; codec: SaveCodec }> {
  const order: SaveCodec[] = preferred === 'pako' ? ['pako', 'lzstring'] : ['lzstring', 'pako'];
  for (const codec of order) {
    const data = codec === 'lzstring' ? tryLzString(save) : await tryPako(save);
    if (data) return { data, codec };
  }
  throw new Error('Failed to decompress save data (tried LZ-String and pako/zlib)');
}

/**
 * Encode save JSON using the same codec the file was opened with.
 */
export async function encodeRpgsave(save: string, codec: SaveCodec = 'lzstring'): Promise<string> {
  const parsed = JSON.parse(save);
  const minified = JSON.stringify(parsed, null, 0);
  if (codec === 'pako') {
    return deflateZlib(minified);
  }
  return LZString.compressToBase64(minified);
}

export function preferredCodecForPath(filePath: string): SaveCodec {
  return filePath.toLowerCase().endsWith('.rmmzsave') ? 'pako' : 'lzstring';
}
