/**
 * Read-only access to RGSS3A archives (Game.rgss3a, RPG Maker VX Ace
 * "encrypted archive"). Only the index and the requested files are read, so
 * large archives (graphics/audio) are never loaded whole.
 *
 * Layout: "RGSSAD\0" + version 3, a u32 seed (key = seed * 9 + 3), then index
 * entries of u32 offset/size/fileKey/nameLength XOR key, followed by the name
 * XOR'd with the key bytes; an offset of 0 ends the index. File data is XOR'd
 * in 4-byte blocks with fileKey, which advances as key * 7 + 3 per block.
 */

export const RGSS3A_MAGIC = [0x52, 0x47, 0x53, 0x53, 0x41, 0x44, 0x00]; // "RGSSAD\0"
export const RGSS3A_VERSION = 3;

/** Reads `length` bytes at `offset` (may return fewer at end of file). */
export type ReadAt = (offset: number, length: number) => Promise<Uint8Array>;

export interface ArchiveEntry {
  /** Path inside the archive with "/" separators, e.g. "Data/Items.rvdata2". */
  name: string;
  offset: number;
  size: number;
  key: number;
}

const u32 = (bytes: Uint8Array, at: number) =>
  (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0;

const nextKey = (key: number) => (Math.imul(key, 7) + 3) >>> 0;

/** XORs data with the per-file key stream (the same operation encrypts and decrypts). */
export function xorFileData(data: Uint8Array, fileKey: number): Uint8Array {
  const out = new Uint8Array(data.length);
  let key = fileKey >>> 0;
  for (let i = 0; i < data.length; i++) {
    out[i] = data[i] ^ ((key >>> (8 * (i % 4))) & 0xff);
    if (i % 4 === 3) key = nextKey(key);
  }
  return out;
}

const INDEX_CHUNK = 64 * 1024;

/** Parses the archive index. */
export async function readRgss3aIndex(readAt: ReadAt): Promise<ArchiveEntry[]> {
  let buffer = await readAt(0, INDEX_CHUNK);
  const ensure = async (end: number) => {
    while (buffer.length < end) {
      const more = await readAt(buffer.length, Math.max(INDEX_CHUNK, end - buffer.length));
      if (more.length === 0) throw new Error('Unexpected end of RGSS3A archive index');
      const joined = new Uint8Array(buffer.length + more.length);
      joined.set(buffer);
      joined.set(more, buffer.length);
      buffer = joined;
    }
  };

  await ensure(12);
  if (!RGSS3A_MAGIC.every((b, i) => buffer[i] === b)) throw new Error('Not an RGSS archive');
  if (buffer[7] !== RGSS3A_VERSION) {
    throw new Error(`Unsupported RGSS archive version ${buffer[7]} (only VX Ace's version 3 is supported)`);
  }
  const key = (Math.imul(u32(buffer, 8), 9) + 3) >>> 0;

  const entries: ArchiveEntry[] = [];
  let pos = 12;
  for (;;) {
    await ensure(pos + 4);
    const offset = (u32(buffer, pos) ^ key) >>> 0;
    if (offset === 0) break;
    await ensure(pos + 16);
    const size = (u32(buffer, pos + 4) ^ key) >>> 0;
    const fileKey = (u32(buffer, pos + 8) ^ key) >>> 0;
    const nameLength = (u32(buffer, pos + 12) ^ key) >>> 0;
    if (nameLength > 4096) throw new Error('Corrupt RGSS archive index');
    pos += 16;
    await ensure(pos + nameLength);
    const nameBytes = new Uint8Array(nameLength);
    for (let i = 0; i < nameLength; i++) {
      nameBytes[i] = buffer[pos + i] ^ ((key >>> (8 * (i % 4))) & 0xff);
    }
    pos += nameLength;
    const name = new TextDecoder().decode(nameBytes).replace(/\\/g, '/');
    entries.push({ name, offset, size, key: fileKey });
  }
  return entries;
}

export function findEntry(entries: ArchiveEntry[], path: string): ArchiveEntry | undefined {
  const wanted = path.replace(/\\/g, '/').toLowerCase();
  return entries.find((entry) => entry.name.toLowerCase() === wanted);
}

/** Reads and decrypts one file from the archive. */
export async function readRgss3aFile(readAt: ReadAt, entry: ArchiveEntry): Promise<Uint8Array> {
  const data = await readAt(entry.offset, entry.size);
  if (data.length !== entry.size) throw new Error(`Truncated archive entry ${entry.name}`);
  return xorFileData(data, entry.key);
}
