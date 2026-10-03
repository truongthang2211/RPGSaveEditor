/**
 * Read-only access to RGSS encrypted archives:
 * - version 1 ("RGSSAD\0\x01"): XP Game.rgssad, VX Game.rgss2a
 * - version 3 ("RGSSAD\0\x03"): VX Ace Game.rgss3a
 * Only index data and the requested files are read, so large archives
 * (graphics/audio) are never loaded whole.
 *
 * File data is XOR'd in 4-byte blocks with a per-file key that advances as
 * key * 7 + 3 per block (both versions).
 *
 * v3: a u32 seed (key = seed * 9 + 3), then index entries of u32
 * offset/size/fileKey/nameLength XOR key followed by the name XOR'd with the
 * key bytes; an offset of 0 ends the index.
 *
 * v1: no central index. Entries follow each other: u32 nameLength, the name
 * (one byte at a time), u32 size, then the data. The key starts at 0xDEADCAFE
 * and advances after every field and name byte; the key at the start of the
 * data is that file's key.
 */

export const RGSSAD_MAGIC = [0x52, 0x47, 0x53, 0x53, 0x41, 0x44, 0x00]; // "RGSSAD\0"
export const SUPPORTED_VERSIONS = [1, 3];

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

const decodeName = (bytes: Uint8Array) => new TextDecoder().decode(bytes).replace(/\\/g, '/');

const MAX_NAME_LENGTH = 4096;

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

/** Serves small reads from a cached block to keep the number of real reads low. */
class BlockReader {
  private start = 0;
  private block: Uint8Array = new Uint8Array(0);

  constructor(private readonly readAt: ReadAt, private readonly blockSize = 256 * 1024) {}

  /** Exactly `length` bytes at `offset`, or fewer only at end of file. */
  async bytes(offset: number, length: number): Promise<Uint8Array> {
    const end = offset + length;
    if (offset < this.start || end > this.start + this.block.length) {
      this.start = offset;
      this.block = await this.readAt(offset, Math.max(length, this.blockSize));
    }
    return this.block.subarray(offset - this.start, Math.min(end, this.start + this.block.length) - this.start);
  }

  async u32(offset: number): Promise<number | null> {
    const b = await this.bytes(offset, 4);
    return b.length === 4 ? u32(b, 0) : null;
  }
}

export interface IndexOptions {
  /** Stop scanning once this returns true (useful for v1, which has no central index). */
  stopWhen?: (entries: ArchiveEntry[]) => boolean;
}

/** Lists the files in an RGSS archive (v1 or v3). */
export async function readArchiveIndex(readAt: ReadAt, options: IndexOptions = {}): Promise<ArchiveEntry[]> {
  const reader = new BlockReader(readAt);
  const header = await reader.bytes(0, 8);
  if (header.length < 8 || !RGSSAD_MAGIC.every((b, i) => header[i] === b)) throw new Error('Not an RGSS archive');
  const version = header[7];
  if (version === 3) return readV3Index(reader, options);
  if (version === 1) return readV1Index(reader, options);
  throw new Error(`Unsupported RGSS archive version ${version} (supported: ${SUPPORTED_VERSIONS.join(', ')})`);
}

async function readV3Index(reader: BlockReader, { stopWhen }: IndexOptions): Promise<ArchiveEntry[]> {
  const seed = await reader.u32(8);
  if (seed === null) throw new Error('Unexpected end of RGSS archive index');
  const key = (Math.imul(seed, 9) + 3) >>> 0;

  const entries: ArchiveEntry[] = [];
  let pos = 12;
  for (;;) {
    const fields = await reader.bytes(pos, 16);
    if (fields.length < 4) throw new Error('Unexpected end of RGSS archive index');
    const offset = (u32(fields, 0) ^ key) >>> 0;
    if (offset === 0) break;
    if (fields.length < 16) throw new Error('Unexpected end of RGSS archive index');
    const size = (u32(fields, 4) ^ key) >>> 0;
    const fileKey = (u32(fields, 8) ^ key) >>> 0;
    const nameLength = (u32(fields, 12) ^ key) >>> 0;
    if (nameLength > MAX_NAME_LENGTH) throw new Error('Corrupt RGSS archive index');
    pos += 16;

    const raw = await reader.bytes(pos, nameLength);
    if (raw.length < nameLength) throw new Error('Unexpected end of RGSS archive index');
    const name = raw.map((b, i) => b ^ ((key >>> (8 * (i % 4))) & 0xff));
    pos += nameLength;

    entries.push({ name: decodeName(name), offset, size, key: fileKey });
    if (stopWhen?.(entries)) break;
  }
  return entries;
}

async function readV1Index(reader: BlockReader, { stopWhen }: IndexOptions): Promise<ArchiveEntry[]> {
  const entries: ArchiveEntry[] = [];
  let key = 0xdeadcafe;
  let pos = 8;
  for (;;) {
    const rawLength = await reader.u32(pos);
    if (rawLength === null) break; // end of archive
    const nameLength = (rawLength ^ key) >>> 0;
    key = nextKey(key);
    if (nameLength > MAX_NAME_LENGTH) throw new Error('Corrupt RGSS archive');
    pos += 4;

    const raw = await reader.bytes(pos, nameLength);
    if (raw.length < nameLength) throw new Error('Unexpected end of RGSS archive');
    const name = new Uint8Array(nameLength);
    for (let i = 0; i < nameLength; i++) {
      name[i] = raw[i] ^ (key & 0xff);
      key = nextKey(key);
    }
    pos += nameLength;

    const rawSize = await reader.u32(pos);
    if (rawSize === null) throw new Error('Unexpected end of RGSS archive');
    const size = (rawSize ^ key) >>> 0;
    key = nextKey(key);
    pos += 4;

    entries.push({ name: decodeName(name), offset: pos, size, key });
    pos += size;
    if (stopWhen?.(entries)) break;
  }
  return entries;
}

export function findEntry(entries: ArchiveEntry[], path: string): ArchiveEntry | undefined {
  const wanted = path.replace(/\\/g, '/').toLowerCase();
  return entries.find((entry) => entry.name.toLowerCase() === wanted);
}

/** Reads and decrypts one file from the archive. */
export async function readArchiveFile(readAt: ReadAt, entry: ArchiveEntry): Promise<Uint8Array> {
  const data = await readAt(entry.offset, entry.size);
  if (data.length !== entry.size) throw new Error(`Truncated archive entry ${entry.name}`);
  return xorFileData(data, entry.key);
}
