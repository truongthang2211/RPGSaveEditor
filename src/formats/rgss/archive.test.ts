import { describe, expect, it } from 'vitest';
import { findEntry, ReadAt, readArchiveFile, readArchiveIndex, RGSSAD_MAGIC, xorFileData } from './archive';

const le32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
const nextKey = (key: number) => (Math.imul(key, 7) + 3) >>> 0;

type ArchiveFile = { name: string; data: Uint8Array; key: number };

/** Builds an RGSS3A archive the way RPG Maker VX Ace does. */
function buildV3(files: ArchiveFile[], seed = 0x12345678) {
  const key = (Math.imul(seed, 9) + 3) >>> 0;
  const xor32 = (n: number) => le32((n ^ key) >>> 0);
  const names = files.map((f) => new TextEncoder().encode(f.name));
  const indexSize = 12 + names.reduce((n, name) => n + 16 + name.length, 0) + 4;

  const index: number[] = [...RGSSAD_MAGIC, 3, ...le32(seed)];
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

/** Builds an RGSSAD v1 archive the way RPG Maker XP/VX do (file keys come from the key stream). */
function buildV1(files: { name: string; data: Uint8Array }[]) {
  const out: number[] = [...RGSSAD_MAGIC, 1];
  let key = 0xdeadcafe;
  for (const file of files) {
    const name = new TextEncoder().encode(file.name);
    out.push(...le32((name.length ^ key) >>> 0));
    key = nextKey(key);
    for (const b of name) {
      out.push(b ^ (key & 0xff));
      key = nextKey(key);
    }
    out.push(...le32((file.data.length ^ key) >>> 0));
    key = nextKey(key);
    out.push(...xorFileData(file.data, key));
  }
  return Uint8Array.from(out);
}

/** In-memory ReadAt that records each read. */
function memoryReader(bytes: Uint8Array) {
  const reads: [number, number][] = [];
  const readAt: ReadAt = async (offset, length) => {
    reads.push([offset, length]);
    return bytes.slice(offset, offset + length);
  };
  return { readAt, reads };
}

const files: ArchiveFile[] = [
  { name: 'Data\\Items.rvdata2', data: Uint8Array.from([4, 8, 0x5b, 0x00]), key: 0xdeadbeef },
  { name: 'Data\\System.rvdata2', data: new TextEncoder().encode('odd length!'), key: 7 },
  { name: 'Graphics\\Pictures\\big.png', data: new Uint8Array(1000).fill(9), key: 0xffffffff },
];

describe.each([
  ['v3 (VX Ace)', () => buildV3(files)],
  ['v1 (XP/VX)', () => buildV1(files)],
])('RGSS archive %s', (_name, build) => {
  it('lists entries with "/" separators', async () => {
    const entries = await readArchiveIndex(memoryReader(build()).readAt);
    expect(entries.map((e) => [e.name, e.size])).toEqual([
      ['Data/Items.rvdata2', 4],
      ['Data/System.rvdata2', 11],
      ['Graphics/Pictures/big.png', 1000],
    ]);
  });

  it('decrypts files, including lengths that are not a multiple of 4', async () => {
    const { readAt } = memoryReader(build());
    const entries = await readArchiveIndex(readAt);
    for (const file of files) {
      const entry = findEntry(entries, file.name)!;
      expect(Array.from(await readArchiveFile(readAt, entry))).toEqual(Array.from(file.data));
    }
  });

  it('finds entries case-insensitively with either separator', async () => {
    const entries = await readArchiveIndex(memoryReader(build()).readAt);
    expect(findEntry(entries, 'data/items.RVDATA2')?.name).toBe('Data/Items.rvdata2');
    expect(findEntry(entries, 'Data\\Missing.rvdata2')).toBeUndefined();
  });

  it('only reads the requested file, not the whole archive', async () => {
    const { readAt, reads } = memoryReader(build());
    const entries = await readArchiveIndex(readAt);
    reads.length = 0;
    const entry = findEntry(entries, 'Data/Items.rvdata2')!;
    await readArchiveFile(readAt, entry);
    expect(reads).toEqual([[entry.offset, 4]]);
  });

  it('can stop scanning early', async () => {
    const entries = await readArchiveIndex(memoryReader(build()).readAt, {
      stopWhen: (found) => found.some((e) => e.name === 'Data/System.rvdata2'),
    });
    expect(entries.map((e) => e.name)).toEqual(['Data/Items.rvdata2', 'Data/System.rvdata2']);
  });
});

describe('RGSS archive index size', () => {
  const many = Array.from({ length: 3000 }, (_, i) => ({
    name: `Graphics\\Characters\\character_${String(i).padStart(4, '0')}.png`,
    data: Uint8Array.from([i & 0xff, 1, 2]),
    key: i,
  }));

  it.each([
    ['v3', () => buildV3(many)],
    ['v1', () => buildV1(many)],
  ])('%s: handles indexes larger than one read block with few reads', async (_name, build) => {
    const { readAt, reads } = memoryReader(build());
    const entries = await readArchiveIndex(readAt);
    expect(entries).toHaveLength(3000);
    expect(reads.length).toBeLessThan(10);
    expect(Array.from(await readArchiveFile(readAt, entries[2999]))).toEqual([2999 & 0xff, 1, 2]);
  });
});

describe('RGSS archive errors', () => {
  it('rejects other files and unsupported versions', async () => {
    await expect(readArchiveIndex(memoryReader(new TextEncoder().encode('not an archive at all')).readAt)).rejects.toThrow(/Not an RGSS/);
    const v2 = buildV3(files);
    v2[7] = 2;
    await expect(readArchiveIndex(memoryReader(v2).readAt)).rejects.toThrow(/version 2/);
  });

  it('rejects a truncated v1 archive', async () => {
    const archive = buildV1(files);
    await expect(readArchiveIndex(memoryReader(archive.slice(0, 30)).readAt)).rejects.toThrow();
  });
});
