import { describe, expect, it } from 'vitest';
import { deflateSync, inflateSync } from 'node:zlib';
import LZString from 'lz-string';
import { decodeRpgsave, encodeRpgsave, preferredCodecForPath } from './rpgsaveUtils';

const save = {
  system: { _saveCount: 3 },
  party: { _gold: 1234, _items: { 1: 5 } },
  actors: { _data: [null, { _name: 'Hải Đăng 勇者' }] },
};
const json = JSON.stringify(save);

/** What RPG Maker MV writes: LZ-String Base64. */
const mvFile = () => LZString.compressToBase64(json);

/** What RPG Maker MZ writes: pako.deflate(json, { to: 'string' }) saved as UTF-8 text. */
const mzFile = () => deflateSync(Buffer.from(json, 'utf8'), { level: 1 }).toString('latin1');

/** How MZ reads its own save back. */
const readAsMz = (text: string) => JSON.parse(inflateSync(Buffer.from(text, 'latin1')).toString('utf8'));

describe('decodeRpgsave', () => {
  it('decodes MV (LZ-String) saves', async () => {
    const result = await decodeRpgsave(mvFile(), 'lzstring');
    expect(result.codec).toBe('lzstring');
    expect(result.data).toEqual(save);
  });

  it('decodes MZ (zlib) saves', async () => {
    const result = await decodeRpgsave(mzFile(), 'pako');
    expect(result.codec).toBe('pako');
    expect(result.data).toEqual(save);
  });

  it('falls back to the other codec for mislabeled files', async () => {
    expect((await decodeRpgsave(mzFile(), 'lzstring')).codec).toBe('pako');
    expect((await decodeRpgsave(mvFile(), 'pako')).codec).toBe('lzstring');
  });

  it.each(['', 'hello world', '{"a":1}', 'N4IgLgnhA'])('rejects garbage %j', async (input) => {
    await expect(decodeRpgsave(input, 'pako')).rejects.toThrow(/Failed to decompress/);
  });
});

describe('encodeRpgsave', () => {
  it('round-trips MV saves in a format MV can read', async () => {
    const encoded = await encodeRpgsave(json, 'lzstring');
    expect(JSON.parse(LZString.decompressFromBase64(encoded)!)).toEqual(save);
  });

  it('round-trips MZ saves in a format MZ can read', async () => {
    const encoded = await encodeRpgsave(json, 'pako');
    expect(readAsMz(encoded)).toEqual(save);
  });
});

describe('preferredCodecForPath', () => {
  it('picks the codec from the extension', () => {
    expect(preferredCodecForPath('C:\\Game\\save\\file1.rmmzsave')).toBe('pako');
    expect(preferredCodecForPath('/game/save/file1.RMMZSAVE')).toBe('pako');
    expect(preferredCodecForPath('C:\\Game\\www\\save\\file1.rpgsave')).toBe('lzstring');
  });
});
