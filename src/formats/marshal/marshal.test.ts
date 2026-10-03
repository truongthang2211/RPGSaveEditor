import { describe, expect, it } from 'vitest';
import { readMarshal, readMarshalStream } from './reader';
import { writeMarshal, writeMarshalStream } from './writer';
import { MArray, MHash, MObject, MString, MUserDef } from './types';

/** Builds Marshal bytes from numbers and latin1 strings: m(0x04, 0x08, '[', 0x06, ...). */
const m = (...parts: (number | string)[]) =>
  Uint8Array.from(parts.flatMap((p) => (typeof p === 'number' ? [p] : [...p].map((c) => c.charCodeAt(0)))));

const roundTrip = (bytes: Uint8Array) => {
  expect(Array.from(writeMarshal(readMarshal(bytes)))).toEqual(Array.from(bytes));
};

describe('fixnums (w_long encoding)', () => {
  // Ruby: Marshal.dump(n).bytes for each n
  const cases: [number, number[]][] = [
    [0, [0x00]],
    [1, [0x06]],
    [122, [0x7f]],
    [123, [0x01, 0x7b]],
    [255, [0x01, 0xff]],
    [256, [0x02, 0x00, 0x01]],
    [-1, [0xfa]],
    [-123, [0x80]],
    [-124, [0xff, 0x84]],
    [-256, [0xff, 0x00]],
    [-257, [0xfe, 0xff, 0xfe]],
    [2 ** 30 - 1, [0x04, 0xff, 0xff, 0xff, 0x3f]],
    [-(2 ** 30), [0xfc, 0x00, 0x00, 0x00, 0xc0]],
  ];
  it.each(cases)('%d', (n, encoded) => {
    const bytes = m(0x04, 0x08, 'i', ...encoded);
    expect(readMarshal(bytes)).toBe(n);
    roundTrip(bytes);
  });

  it('writes integers beyond the 32-bit Fixnum range as Bignum', () => {
    // Marshal.dump(2**30) on 32-bit Ruby: l + 2 words 0x00 0x00 0x00 0x40
    expect(Array.from(writeMarshal(2 ** 30))).toEqual(Array.from(m(0x04, 0x08, 'l', '+', 0x07, 0x00, 0x00, 0x00, 0x40)));
  });
});

describe('basic values', () => {
  it.each([
    ['nil', m(0x04, 0x08, '0'), null],
    ['true', m(0x04, 0x08, 'T'), true],
    ['false', m(0x04, 0x08, 'F'), false],
  ])('%s', (_name, bytes, value) => {
    expect(readMarshal(bytes)).toBe(value);
    roundTrip(bytes);
  });

  it('floats keep their exact text', () => {
    const bytes = m(0x04, 0x08, 'f', 0x0d, '1.250000');
    expect(readMarshal(bytes)).toEqual({ kind: 'float', text: '1.250000' });
    roundTrip(bytes);
  });

  it('bignums keep their bytes', () => {
    roundTrip(m(0x04, 0x08, 'l', '-', 0x07, 0x01, 0x02, 0x03, 0x04));
  });
});

describe('strings and symbols', () => {
  it('keeps the encoding ivar of UTF-8 and US-ASCII strings', () => {
    // ["été", "abc".force_encoding("US-ASCII")]
    const bytes = m(0x04, 0x08, '[', 0x07,
      'I', '"', 0x0a, 0xc3, 0xa9, 't', 0xc3, 0xa9, 0x06, ':', 0x06, 'E', 'T',
      'I', '"', 0x08, 'abc', 0x06, ';', 0x00, 'F');
    const [utf8, ascii] = (readMarshal(bytes) as MArray).items as MString[];
    expect(utf8.ivars?.[0][1]).toBe(true);
    expect(ascii.ivars?.[0][1]).toBe(false);
    roundTrip(bytes);
  });

  it('keeps binary strings without an encoding wrapper', () => {
    roundTrip(m(0x04, 0x08, '"', 0x08, 0x00, 0xff, 'a'));
  });

  it('reuses symbols through ";" links', () => {
    // [:a, :b, :a]
    const bytes = m(0x04, 0x08, '[', 0x08, ':', 0x06, 'a', ':', 0x06, 'b', ';', 0x00);
    const items = (readMarshal(bytes) as MArray).items;
    expect(items[0]).toBe(items[2]);
    roundTrip(bytes);
  });

  it('handles encoded (non-ASCII) symbols', () => {
    // [:"名", :"名"] — the symbol slot is reserved before its E ivar, so E is ;1
    const bytes = m(0x04, 0x08, '[', 0x07,
      'I', ':', 0x08, 0xe5, 0x90, 0x8d, 0x06, ':', 0x06, 'E', 'T',
      ';', 0x00);
    roundTrip(bytes);
  });
});

describe('collections and objects', () => {
  it('hashes, including ones with a default value', () => {
    roundTrip(m(0x04, 0x08, '{', 0x07, 'i', 0x06, 'i', 0x07, 'i', 0x08, '0'));
    const withDefault = m(0x04, 0x08, '}', 0x06, 'i', 0x06, 'T', 'i', 0x00);
    expect((readMarshal(withDefault) as MHash).defaultValue).toBe(0);
    roundTrip(withDefault);
  });

  it('objects with instance variables', () => {
    // Game_Party with @gold = 10
    const bytes = m(0x04, 0x08, 'o', ':', 0x0f, 'Game_Party', 0x06, ':', 0x0a, '@gold', 'i', 0x0f);
    const party = readMarshal(bytes) as MObject;
    expect(party.className.name).toBe('Game_Party');
    expect(party.fields[0][1]).toBe(10);
    roundTrip(bytes);
  });

  it('shared and cyclic references come back as "@" links', () => {
    // a = []; a << a; [a, a]   ->  [ [@1], @1 ]
    const bytes = m(0x04, 0x08, '[', 0x07, '[', 0x06, '@', 0x06, '@', 0x06);
    const outer = readMarshal(bytes) as MArray;
    const inner = outer.items[0] as MArray;
    expect(inner.items[0]).toBe(inner);
    expect(outer.items[1]).toBe(inner);
    roundTrip(bytes);
  });

  it('_dump objects (RGSS Table/Color) are numbered after their payload', () => {
    // [Color(_dump 4 bytes), [same color via @2]] -> the userdef is object #2, after the inner array #1
    const bytes = m(0x04, 0x08, '[', 0x07,
      'u', ':', 0x0a, 'Color', 0x09, 0x01, 0x02, 0x03, 0x04,
      '[', 0x06, '@', 0x06);
    const outer = readMarshal(bytes) as MArray;
    const color = outer.items[0] as MUserDef;
    expect(color.className.name).toBe('Color');
    expect(Array.from(color.data)).toEqual([1, 2, 3, 4]);
    expect((outer.items[1] as MArray).items[0]).toBe(color);
    roundTrip(bytes);
  });

  it('structs, user-class wrappers, extended objects and marshal_dump objects', () => {
    roundTrip(m(0x04, 0x08, 'S', ':', 0x07, 'Pt', 0x06, ':', 0x06, 'x', 'i', 0x06));
    roundTrip(m(0x04, 0x08, 'C', ':', 0x08, 'Sub', '[', 0x00));
    roundTrip(m(0x04, 0x08, 'e', ':', 0x08, 'Mod', 'o', ':', 0x08, 'Obj', 0x00));
    roundTrip(m(0x04, 0x08, 'U', ':', 0x08, 'Set', '[', 0x06, 'i', 0x06));
  });
});

describe('streams and errors', () => {
  it('reads back-to-back dumps with separate link tables', () => {
    const one = m(0x04, 0x08, '[', 0x07, ':', 0x06, 'a', ';', 0x00);
    const two = m(0x04, 0x08, ':', 0x06, 'a');
    const stream = Uint8Array.from([...one, ...two]);
    const values = readMarshalStream(stream);
    expect(values).toHaveLength(2);
    expect(Array.from(writeMarshalStream(values))).toEqual(Array.from(stream));
  });

  it.each([
    ['wrong version', m(0x04, 0x09, '0')],
    ['truncated data', m(0x04, 0x08, '[', 0x07, '0')],
    ['unknown type', m(0x04, 0x08, 'Z')],
    ['dangling link', m(0x04, 0x08, '@', 0x06)],
  ])('rejects %s', (_name, bytes) => {
    expect(() => readMarshal(bytes)).toThrow();
  });
});
