import { describe, expect, it } from 'vitest';
import { findEntry, ReadAt, readRgss3aFile, readRgss3aIndex, RGSS3A_MAGIC, xorFileData } from './archive';

const le32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];

/** Builds an RGSS3A archive the way RPG Maker VX Ace does. */
function buildArchive(files: { name: string; data: Uint8Array; key: number }[], seed = 0x12345678) {
  const key = (Math.imul(seed, 9) + 3) >>> 0;
  const xor32 = (n: number) => le32((n ^ key) >>> 0);
  const names = files.map((f) => new TextEncoder().encode(f.name));
  const indexSize = 12 + names.reduce((n, name) => n + 16 + name.length, 0) + 4;

  const index: number[] = [...RGSS3A_MAGIC, 3, ...le32(seed)];
  const body: number[] = [];
  files.forEach((file, i) => {
    const offset = indexSize + body.length;
    index.push(...xor32(offset), ...xor32(file.data.length), ...xor32(file.key), ...xor32(names[i].length));
    names[i].forEach((b, j) => index.push(b ^ ((key >>> (8 * (j % 4))) & 0xff)));
    body.push(...xorFileData(file.data, file.key));
  });
  index.push(...xor32(0));
  return Uint8Array.from([...index, ...body]);
}

/** In-memory ReadAt that also records how much was read. */
function memoryReader(bytes: Uint8Array) {
  const reads: [number, number][] = [];
  const readAt: ReadAt = async (offset, length) => {
    reads.push([offset, length]);
    return bytes.slice(offset, offset + length);
  };
  return { readAt, reads };
}

const files = [
  { name: 'Data\\Items.rvdata2', data: Uint8Array.from([4, 8, 0x5b, 0x00]), key: 0xdeadbeef },
  { name: 'Data\\System.rvdata2', data: new TextEncoder().encode('odd length!'), key: 7 },
  { name: 'Graphics\\Pictures\\big.png', data: new Uint8Array(1000).fill(9), key: 0xffffffff },
];

describe('RGSS3A archives', () => {
  it('lists entries with "/" separators', async () => {
    const { readAt } = memoryReader(buildArchive(files));
    const entries = await readRgss3aIndex(readAt);
    expect(entries.map((e) => [e.name, e.size])).toEqual([
      ['Data/Items.rvdata2', 4],
      ['Data/System.rvdata2', 11],
      ['Graphics/Pictures/big.png', 1000],
    ]);
  });

  it('decrypts files, including lengths that are not a multiple of 4', async () => {
    const { readAt } = memoryReader(buildArchive(files));
    const entries = await readRgss3aIndex(readAt);
    for (const file of files) {
      const entry = findEntry(entries, file.name)!;
      expect(Array.from(await readRgss3aFile(readAt, entry))).toEqual(Array.from(file.data));
    }
  });

  it('finds entries case-insensitively with either separator', async () => {
    const { readAt } = memoryReader(buildArchive(files));
    const entries = await readRgss3aIndex(readAt);
    expect(findEntry(entries, 'data/items.RVDATA2')?.name).toBe('Data/Items.rvdata2');
    expect(findEntry(entries, 'Data\\Missing.rvdata2')).toBeUndefined();
  });

  it('only reads the index and the requested file, not the whole archive', async () => {
    const archive = buildArchive(files);
    const { readAt, reads } = memoryReader(archive);
    const entries = await readRgss3aIndex(readAt);
    reads.length = 0;
    await readRgss3aFile(readAt, findEntry(entries, 'Data/Items.rvdata2')!);
    expect(reads).toEqual([[entries[0].offset, 4]]);
  });

  it('handles an index larger than one read chunk', async () => {
    const many = Array.from({ length: 3000 }, (_, i) => ({
      name: `Graphics\\Characters\\character_${String(i).padStart(4, '0')}.png`,
      data: Uint8Array.from([i & 0xff]),
      key: i,
    }));
    const { readAt } = memoryReader(buildArchive(many));
    const entries = await readRgss3aIndex(readAt);
    expect(entries).toHaveLength(3000);
    expect(Array.from(await readRgss3aFile(readAt, entries[2999]))).toEqual([2999 & 0xff]);
  });

  it('rejects other files and other archive versions', async () => {
    await expect(readRgss3aIndex(memoryReader(new TextEncoder().encode('not an archive at all')).readAt)).rejects.toThrow(/Not an RGSS/);
    const v1 = buildArchive(files);
    v1[7] = 1;
    await expect(readRgss3aIndex(memoryReader(v1).readAt)).rejects.toThrow(/version 1/);
  });
});
