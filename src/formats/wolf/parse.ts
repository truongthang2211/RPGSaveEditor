/**
 * Wolf RPG Editor save structure, after WolfSave by Sinflower (MIT License, see LICENSE-WolfSave.txt,
 * https://github.com/Sinflower/WolfSave). Most fields are only known by
 * position, so they keep WolfSave's numbered names (var1, var2...).
 *
 * Every value read is recorded with its offset, so an edit overwrites those
 * bytes in place and everything else in the file stays as is.
 */

/** A number at a fixed position. Counts and sizes are read-only: changing them would break the file. */
export interface WolfInt {
  kind: 'int';
  key: string;
  offset: number;
  size: 1 | 2 | 4 | 8;
  value: number;
  readOnly?: boolean;
}

/** A length-prefixed string (read-only: its length is part of the layout). */
export interface WolfText {
  kind: 'text';
  key: string;
  offset: number;
  value: string;
}

export interface WolfGroup {
  kind: 'group';
  key: string;
  children: WolfNode[];
}

export type WolfNode = WolfInt | WolfText | WolfGroup;

/** Highest save version WolfSave knows (Wolf RPG Editor 3.279). */
export const HIGHEST_SUPPORTED_VERSION = 0x8e;
const MAGIC = 0x19;

class Reader {
  pos: number;
  private readonly view: DataView;
  private readonly decoder: TextDecoder;
  private stack: WolfGroup[];

  constructor(private readonly data: Uint8Array, start: number, utf8: boolean, root: WolfGroup) {
    this.pos = start;
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    this.decoder = new TextDecoder(utf8 ? 'utf-8' : 'shift_jis');
    this.stack = [root];
  }

  private need(size: number) {
    if (this.pos + size > this.data.length) {
      throw new Error(`Unexpected end of the save at 0x${this.pos.toString(16)} (${this.stack.map((g) => g.key).join(' > ')})`);
    }
  }

  private add(node: WolfNode) {
    this.stack[this.stack.length - 1].children.push(node);
  }

  private int(key: string, size: 1 | 2 | 4 | 8, readOnly?: boolean): number {
    this.need(size);
    const offset = this.pos;
    let value: number;
    if (size === 1) value = this.view.getUint8(offset);
    else if (size === 2) value = this.view.getUint16(offset, true);
    else if (size === 4) value = this.view.getInt32(offset, true);
    else value = Number(this.view.getBigInt64(offset, true));
    this.pos += size;
    this.add({ kind: 'int', key, offset, size, value, ...(readOnly || size === 8 ? { readOnly: true } : {}) });
    return value;
  }

  u8 = (key: string) => this.int(key, 1);
  u16 = (key: string) => this.int(key, 2);
  /** A 32-bit value, shown signed (Wolf variables are signed). */
  i32 = (key: string) => this.int(key, 4);
  u64 = (key: string) => this.int(key, 8);
  /** A count or size: drives the layout, so it can't be edited. Returned unsigned like WolfSave's DWORD. */
  count32 = (key: string) => this.int(key, 4, true) >>> 0;
  count16 = (key: string) => this.int(key, 2, true);
  count8 = (key: string) => this.int(key, 1, true);
  /** A signed 32-bit value that drives the layout (read-only). */
  signed32 = (key: string) => this.int(key, 4, true);

  /** MemData: a length (2 or 4 bytes) then that many bytes, usually a 0-terminated string. */
  text(key: string, lengthSize: 2 | 4): string {
    const offset = this.pos;
    this.need(lengthSize);
    const length = lengthSize === 2 ? this.view.getUint16(this.pos, true) : this.view.getUint32(this.pos, true);
    this.pos += lengthSize;
    this.need(length);
    const bytes = this.data.subarray(this.pos, this.pos + length);
    this.pos += length;
    const value = this.decoder.decode(bytes[bytes.length - 1] === 0 ? bytes.subarray(0, -1) : bytes);
    this.add({ kind: 'text', key, offset, value });
    return value;
  }

  skip(key: string, size: number) {
    this.need(size);
    this.pos += size;
    this.add({ kind: 'text', key, offset: this.pos - size, value: `${size} bytes` });
  }

  group<T>(key: string, read: () => T): T {
    const group: WolfGroup = { kind: 'group', key, children: [] };
    this.add(group);
    this.stack.push(group);
    try {
      return read();
    } finally {
      this.stack.pop();
    }
  }

  seekBack(bytes: number) {
    this.pos -= bytes;
    this.stack[this.stack.length - 1].children.pop();
  }
}

const times = (n: number, each: (i: number) => void) => {
  for (let i = 0; i < n; i++) each(i);
};
/** `(int)n > 0` in WolfSave: counts with the top bit set mean "none". */
const positive = (n: number) => (n | 0) > 0;

function savePart1_1_1_1(r: Reader) {
  r.u8('var1');
  const count2 = r.count8('var2');
  r.group('vars1', () => times(count2, (i) => r.i32(`[${i}]`)));
  const count3 = r.count8('var3');
  r.group('vars2', () => times(count3, (i) => r.u8(`[${i}]`)));
}

function savePart1_1_1(r: Reader) {
  for (let i = 1; i <= 6; i++) r.u8(`var${i}`);
  const count = r.count32('var7');
  if (count > 0x10000) return; // WolfSave stops reading this part here
  r.group('entries', () => times(count, (i) => r.group(`[${i}]`, () => savePart1_1_1_1(r))));
}

/** An event/character entry (used in parts 1 and 4). */
function savePart1_1(r: Reader, version: number) {
  for (let i = 1; i <= 4; i++) r.i32(`var${i}`);
  r.u8('var5');
  r.i32('var6');
  r.text('md1', 2);
  for (let i = 7; i <= 10; i++) r.u16(`var${i}`);
  r.u8('var11');
  r.u8('var12');
  r.group('sp1', () => savePart1_1_1(r));
  r.group('sp2', () => savePart1_1_1(r));
  for (let i = 13; i <= 18; i++) r.u16(`var${i}`);
  for (let i = 19; i <= 21; i++) r.u8(`var${i}`);
  const count22 = r.count32('var22');
  if (positive(count22)) r.group('vars1', () => times(count22, (i) => r.i32(`[${i}]`)));
  if (version >= 0x70) {
    r.u8('var23');
    r.u8('var24');
  }
  if (version >= 0x73) for (let i = 25; i <= 28; i++) r.i32(`var${i}`);
  if (version >= 0x78) r.i32('var29');
  if (version >= 0x85) for (let i = 30; i <= 32; i++) r.i32(`var${i}`);
  if (version >= 0x8a) {
    const count33 = r.count16('var33');
    if (((count33 << 16) >> 16) > 0) r.group('mds1', () => times(count33, (i) => r.text(`[${i}]`, 2)));
    r.i32('var34');
    r.u8('var35');
    r.i32('var36');
    r.i32('var37');
  }
  if (version >= 0x8b) r.i32('var38');
  if (version >= 0x8c) r.i32('var39');
}

function savePart1(r: Reader, version: number) {
  for (let i = 1; i <= 3; i++) r.i32(`var${i}`);
  if (version >= 0x69) {
    const rows = r.count32('var4');
    const cols = r.count32('var5');
    const marker = r.count32('var6');
    if (marker !== 0xffffffff) {
      r.seekBack(4);
      r.group('vars1', () => times(3 * rows * cols, (i) => r.i32(`[${i}]`)));
    }
  }
  r.text('md1', 4);
  const blobs = version >= 0x8a ? 31 : version >= 0x73 ? 15 : 7;
  r.group('mds1', () => times(blobs, (i) => r.text(`[${i}]`, 4)));
  const count7 = r.count32('var7');
  if (positive(count7)) r.group('vars2', () => times(count7, (i) => (version >= 0x64 ? r.i32(`[${i}]`) : r.u8(`[${i}]`))));
  const count8 = r.count32('var8');
  if (positive(count8)) r.group('events', () => times(count8, (i) => r.group(`[${i}]`, () => savePart1_1(r, version))));
  if (version >= 0x72) for (let i = 9; i <= 19; i++) r.i32(`var${i}`);
  const count20 = r.count32('var20');
  if (positive(count20)) r.group('vars3', () => times(count20, (i) => r.i32(`[${i}]`)));
}

function savePart2(r: Reader, version: number) {
  r.u8('var1');
  r.u8('var2');
  for (let i = 3; i <= 21; i++) r.i32(`var${i}`);
  for (let i = 22; i <= 24; i++) r.u16(`var${i}`);
  r.i32('var25');
  for (let i = 26; i <= 28; i++) r.u16(`var${i}`);
  for (let i = 29; i <= 37; i++) r.i32(`var${i}`);
  r.u8('var38');
  r.u16('var39');
  r.i32('var40');
  r.i32('var41');
  for (let i = 42; i <= 45; i++) r.u16(`var${i}`);
  for (let i = 46; i <= 48; i++) r.i32(`var${i}`);
  r.u8('var49');
  if (version <= 96) r.i32('var50');
  r.i32('var51');
  if (version >= 98) {
    r.i32('var52');
    r.i32('var53');
  }
  if (version >= 100) {
    r.i32('var54');
    r.i32('var55');
    r.u8('var56');
    const count57 = r.count32('var57');
    if (positive(count57)) r.group('mds1', () => times(count57, (i) => r.text(`[${i}]`, 4)));
    const count58 = r.count32('var58');
    if (positive(count58)) r.group('vars1', () => times(count58, (i) => r.i32(`[${i}]`)));
    for (let i = 59; i <= 63; i++) r.i32(`var${i}`);
  }
  if (version >= 101) for (let i = 64; i <= 69; i++) r.i32(`var${i}`);
  if (version >= 102) r.u16('var70');
  if (version >= 103) {
    r.text('md1', 2);
    r.text('md2', 2);
  }
  if (version >= 104) r.i32('var71');
  if (version >= 106) for (let i = 72; i <= 74; i++) r.i32(`var${i}`);
  if (version >= 108) {
    r.text('md3', 2);
    for (let i = 75; i <= 77; i++) r.i32(`var${i}`);
    r.text('md4', 2);
    for (let i = 78; i <= 80; i++) r.i32(`var${i}`);
  }
  if (version >= 109) {
    r.text('md5', 2);
    r.text('md6', 2);
    r.u8('var81');
  }
  if (version >= 110) r.u8('var82');
  if (version >= 119) {
    r.text('md7', 2);
    r.text('md8', 2);
    r.text('md9', 2);
  }
  if (version >= 121) r.i32('var83');
  if (version >= 122) r.i32('var84');
  if (version >= 124) r.i32('var85');
  if (version >= 126) r.i32('var86');
  if (version >= 128) r.i32('var87');
  if (version >= 129) {
    r.i32('var88');
    r.i32('var89');
  }
  if (version >= 130) r.i32('var90');
  if (version >= 131) r.i32('var91');
  if (version >= 132) for (let i = 92; i <= 95; i++) r.i32(`var${i}`);
  if (version >= 134) r.u8('var96');
  if (version >= 136) r.u8('var97');
  if (version >= 137) {
    for (let i = 98; i <= 101; i++) r.i32(`var${i}`);
    r.group('vars2', () => times(24, (i) => r.i32(`[${i}]`)));
  }
  if (version >= 0x8a) {
    for (let i = 102; i <= 105; i++) r.i32(`var${i}`);
    r.text('md10', 4);
    const count106 = r.count32('var106');
    if (positive(count106)) r.group('mds2', () => times(count106, (i) => r.text(`[${i}]`, 4)));
  }
  if (version < 0x8d) return;
  for (let i = 107; i <= 120; i++) r.u8(`var${i}`);
  r.skip('bytes', 0x100);
  r.u8('var121');
  r.u8('var122');
  if (version >= 0x8e) r.i32('var123');
}

/** WolfSave's `return false` inside a part: the part ends there, and reading goes on with the next one. */
class EndOfPart extends Error {}

function savePart3(r: Reader, version: number) {
  try {
    savePart3Body(r, version);
  } catch (error) {
    if (!(error instanceof EndOfPart)) throw error;
  }
}

function savePart3Body(r: Reader, version: number) {
  const fail = () => {
    throw new EndOfPart();
  };
  r.i32('var1');
  const count2 = r.count32('var2');
  if ((count2 | 0) < 0) return;
  r.group('vars1', () =>
    times(count2, (i) =>
      r.group(`[${i}]`, () => {
        const v1 = r.count32('count');
        if ((v1 | 0) < 0) fail();
        times(v1, (j) =>
          r.group(`[${j}]`, () => {
            const v2 = r.count8('count');
            times(v2, (k) => r.i32(`[${k}]`));
          }),
        );
      }),
    ),
  );
  const count3 = r.count32('var3');
  if (count3 > 0x270f) return;
  if ((count3 | 0) > 0) {
    r.group('vars4', () =>
      times(count3, (i) =>
        r.group(`[${i}]`, () => {
          const v = r.count32('count');
          if ((v | 0) < 0) fail();
          times(v, (j) => r.i32(`[${j}]`));
        }),
      ),
    );
  }
  const count4 = r.count32('var4');
  if ((count4 | 0) < 0) return;
  r.group('mds1', () => times(count4, (i) => r.text(`[${i}]`, version < 0x6f ? 2 : 4)));
  const count5 = r.count32('var5');
  if ((count5 | 0) < 0 || count5 > 10000) fail();
  r.group('vars6', () =>
    times(count5, (i) =>
      r.group(`[${i}]`, () => {
        const v = r.count8('count');
        times(v, (j) => r.i32(`[${j}]`));
      }),
    ),
  );
  const count6 = r.count32('var6');
  if (count6 > 10000) return;
  if ((count6 | 0) <= 0) fail();
  r.group('vars8', () =>
    times(count6, (i) =>
      r.group(`[${i}]`, () => {
        const v = r.count8('count');
        times(v, (j) => r.text(`[${j}]`, version < 0x6f ? 2 : 4));
      }),
    ),
  );
}

function savePart4(r: Reader, version: number) {
  r.group('event', () => savePart1_1(r, version));
  const count1 = r.count32('var1');
  r.group('events', () => times(count1, (i) => r.group(`[${i}]`, () => savePart1_1(r, version))));
  r.u8('var2');
  r.u8('var3');
  const count4 = r.count32('var4');
  if (positive(count4)) r.group('vars1', () => times(count4, (i) => r.i32(`[${i}]`)));
  if (version < 0x8a) return;
  const count5 = r.count32('var5');
  if (positive(count5)) r.group('vars2', () => times(count5, (i) => r.u64(`[${i}]`)));
}

function savePart5_1(r: Reader, version: number) {
  r.i32('var1');
  r.u8('var2');
  r.u8('var3');
  r.u16('var4');
  r.u8('var5');
  r.u8('var6');
  r.text('md1', 2);
  for (let i = 7; i <= 18; i++) r.i32(`var${i}`);
  r.group('vals1', () => times(6, (i) => r.i32(`[${i}]`)));
  if (version >= 0x69) for (let i = 19; i <= 36; i++) r.i32(`var${i}`);
  if (version >= 0x6b) r.u8('var37');
  if (version >= 0x72) {
    r.u8('var38');
    r.u8('var39');
    r.group('vals2', () => times(4, (i) => r.i32(`[${i}]`)));
    r.group('vals3', () => times(4, (i) => r.i32(`[${i}]`)));
  }
  if (version >= 0x73) {
    for (let i = 40; i <= 43; i++) r.i32(`var${i}`);
    if (version >= 0x74) for (let i = 44; i <= 48; i++) r.i32(`var${i}`);
    if (version >= 0x75) for (let i = 49; i <= 54; i++) r.i32(`var${i}`);
    for (let i = 55; i <= 60; i++) r.i32(`var${i}`);
  }
  if (version >= 0x76) for (let i = 61; i <= 63; i++) r.i32(`var${i}`);
  if (version < 0x81) return;
  for (let i = 64; i <= 84; i++) r.i32(`var${i}`);
  if (version >= 0x87) for (let i = 85; i <= 89; i++) r.i32(`var${i}`);
  if (version >= 0x89) {
    const count90 = r.count32('var90');
    if (positive(count90)) {
      r.group('vals4', () =>
        times(count90, (i) =>
          r.group(`[${i}]`, () => {
            const v = r.count32('count');
            if (positive(v)) times(v, (j) => r.i32(`[${j}]`));
          }),
        ),
      );
    }
    for (let i = 91; i <= 97; i++) r.i32(`var${i}`);
  }
}

function savePart5(r: Reader, version: number) {
  const count = r.count16('var1');
  if ((count & 0x8000) === 0) r.group('entries', () => times(count, (i) => r.group(`[${i}]`, () => savePart5_1(r, version))));
}

/**
 * The Variable DB (可変DB): types, each with numbered fields and data rows.
 * Field types below 2000 are numbers, 2000 and up are strings; a row stores
 * all its numbers first, then its strings.
 */
function variableDatabase(r: Reader) {
  r.u8('unknown');
  const typeCount = r.count32('type count');
  times(typeCount, (t) =>
    r.group(`type ${t}`, () => {
      const unknown = r.signed32('unknown');
      let fieldCount = unknown;
      if (unknown <= -1) {
        if (unknown <= -2) r.count32('data id specification');
        fieldCount = r.count32('field count');
      }
      const config: number[] = [];
      if (fieldCount > 0) r.group('field types', () => times(fieldCount, (i) => config.push(r.count32(`[${i}]`))));
      const rows = r.count32('row count');
      times(rows, (row) =>
        r.group(`row ${row}`, () => {
          config.forEach((def, field) => {
            if (def < 2000) r.i32(`field ${field}`);
          });
          config.forEach((def, field) => {
            if (def >= 2000) r.text(`field ${field}`, 4);
          });
        }),
      );
    }),
  );
}

function savePart7(r: Reader) {
  const flag = r.count8('var1');
  if (flag !== 1) return;
  const count = r.count32('var2');
  r.group('entries', () =>
    times(count, (i) =>
      r.group(`[${i}]`, () => {
        const v = r.count8('kind');
        if (v < 0xfa) r.u8('value');
        else r.i32('value');
      }),
    ),
  );
}

export interface WolfStructure {
  version: number;
  utf8: boolean;
  gameName: string;
  root: WolfGroup;
}

/** Walks a decrypted save (see crypto.ts) and returns every value with its position. */
export function parseWolfStructure(plain: Uint8Array): WolfStructure {
  const utf8 = plain[6] === 0x55;
  const root: WolfGroup = { kind: 'group', key: 'save', children: [] };
  const r = new Reader(plain, 0x14, utf8, root);
  if (r.count8('start') !== MAGIC) throw new Error('Not a Wolf RPG Editor save (unexpected start byte)');
  const gameName = r.text('game name', 2);
  const version = r.count16('file version');
  if (version === 0) throw new Error('Not a Wolf RPG Editor save (no version)');
  if (version > HIGHEST_SUPPORTED_VERSION) {
    throw new Error(`This Wolf RPG Editor save version (0x${version.toString(16)}) is newer than supported (0x${HIGHEST_SUPPORTED_VERSION.toString(16)})`);
  }
  r.group('part 1', () => savePart1(r, version));
  r.group('part 2', () => savePart2(r, version));
  r.group('part 3', () => savePart3(r, version));
  r.group('part 4', () => savePart4(r, version));
  r.group('part 5', () => savePart5(r, version));
  r.group('variable db', () => variableDatabase(r));
  r.group('part 7', () => savePart7(r));
  if (r.pos + 1 !== plain.length || plain[r.pos] !== MAGIC) {
    throw new Error('Unexpected data at the end of the Wolf RPG Editor save');
  }
  return { version, utf8, gameName, root };
}
