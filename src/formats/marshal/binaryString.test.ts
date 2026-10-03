import { afterEach, describe, expect, it, vi } from 'vitest';
import { binaryStringToBytes, bytesToBinaryString } from './binaryString';

/**
 * Browsers (and the app's WebView2) decode the 'latin1' label as windows-1252,
 * which maps bytes 0x80-0x9F to other code points (0x99 -> U+2122 "TM").
 * Node keeps those bytes, so tests passed while saves written by the app were
 * corrupted. This decoder behaves like a browser for that range.
 */
const WINDOWS_1252: Record<number, number> = { 0x80: 0x20ac, 0x99: 0x2122, 0x9a: 0x0161, 0x9c: 0x0153, 0x82: 0x201a };
const RealTextDecoder = TextDecoder;
class BrowserLikeTextDecoder {
  private readonly real: TextDecoder;
  private readonly windows1252: boolean;
  constructor(label = 'utf-8', options?: TextDecoderOptions) {
    this.real = new RealTextDecoder(label, options);
    this.windows1252 = this.real.encoding === 'windows-1252';
  }
  get encoding() {
    return this.real.encoding;
  }
  decode(input?: BufferSource) {
    if (!this.windows1252 || !input) return this.real.decode(input);
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input as ArrayBuffer);
    return Array.from(bytes, (b) => String.fromCharCode(WINDOWS_1252[b] ?? b)).join('');
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('binary strings', () => {
  it('round-trips every byte value', () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(Array.from(binaryStringToBytes(bytesToBinaryString(all)))).toEqual(Array.from(all));
  });

  it('handles long inputs', () => {
    const big = new Uint8Array(100_000).map((_, i) => i & 0xff);
    expect(binaryStringToBytes(bytesToBinaryString(big))).toEqual(big);
  });
});

describe('Marshal round-trip in a browser-like environment', () => {
  it('keeps symbol bytes 0x80-0x9F (e.g. UTF-8 symbol names) intact', async () => {
    vi.stubGlobal('TextDecoder', BrowserLikeTextDecoder);
    vi.resetModules();
    const { readMarshal } = await import('./reader');
    const { writeMarshal } = await import('./writer');

    // { :"\x99\x9a\x80" => 1 } and a float — symbol bytes in the windows-1252 trouble range
    const bytes = Uint8Array.from([0x04, 0x08, 0x7b, 0x06, 0x3a, 0x08, 0x99, 0x9a, 0x80, 0x69, 0x06]);
    const out = writeMarshal(readMarshal(bytes));
    expect(Array.from(out)).toEqual(Array.from(bytes));
  });
});
