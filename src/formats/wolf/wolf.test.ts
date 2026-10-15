import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checksum, crypt, msvcRand } from './crypto';
import { WolfGroup, WolfInt, WolfNode } from './parse';
import { parseWolfSave, serializeWolfSave, setWolfValue, WolfSave, wolfValue } from './save';
import { wolfTree } from './tree';
import { wolfFormat, wolfGameName } from './index';

/** Little-endian writer for building a save the way the game lays it out. */
class Writer {
  bytes: number[] = [];
  u8 = (v: number) => this.bytes.push(v & 0xff);
  u16 = (v: number) => (this.u8(v), this.u8(v >> 8));
  i32 = (v: number) => (this.u16(v & 0xffff), this.u16((v >>> 16) & 0xffff));
  many = (n: number, write: () => void) => Array.from({ length: n }, write);
  text = (s: string, lengthSize: 2 | 4) => {
    const data = s ? [...new TextEncoder().encode(s), 0] : [];
    if (lengthSize === 2) this.u16(data.length);
    else this.i32(data.length);
    data.forEach(this.u8);
  };
}

/** Part 1_1 (an event) at version 0x8c, with nothing in its lists. */
function event(w: Writer) {
  w.many(4, () => w.i32(0));
  w.u8(0);
  w.i32(0);
  w.text('', 2);
  w.many(4, () => w.u16(0));
  w.u8(0);
  w.u8(0);
  w.many(2, () => (w.many(6, () => w.u8(0)), w.i32(0)));
  w.many(6, () => w.u16(0));
  w.many(3, () => w.u8(0));
  w.i32(0); // var22: no list
  w.u8(0);
  w.u8(0); // >= 0x70
  w.many(4, () => w.i32(0)); // >= 0x73
  w.i32(0); // >= 0x78
  w.many(3, () => w.i32(0)); // >= 0x85
  w.u16(0); // >= 0x8a: no strings
  w.i32(0);
  w.u8(0);
  w.i32(0);
  w.i32(0);
  w.i32(0); // >= 0x8b
  w.i32(0); // >= 0x8c
}

/** A small but complete version 0x8c save: variables 100/200/300 and a Variable DB row (42, "Hero"). */
function makeSave(): Uint8Array {
  const w = new Writer();
  w.u8(0x19);
  w.text('Demo Wolf', 2);
  w.u16(0x8c);
  // Part 1
  w.many(3, () => w.i32(1));
  w.i32(0);
  w.i32(0);
  w.i32(-1); // no table
  w.text('', 4);
  w.many(31, () => w.text('', 4));
  w.i32(2);
  w.i32(7);
  w.i32(8);
  w.i32(0); // no events
  w.many(11, () => w.i32(0));
  w.i32(0);
  // Part 2
  w.u8(0);
  w.u8(0);
  w.many(19, () => w.i32(0));
  w.many(3, () => w.u16(0));
  w.i32(0);
  w.many(3, () => w.u16(0));
  w.many(9, () => w.i32(0));
  w.u8(0);
  w.u16(0);
  w.i32(0);
  w.i32(0);
  w.many(4, () => w.u16(0));
  w.many(3, () => w.i32(0));
  w.u8(0);
  w.i32(0); // var51
  w.many(2, () => w.i32(0)); // >= 98
  w.i32(0); // >= 100
  w.i32(0);
  w.u8(0);
  w.i32(0); // no mds1
  w.i32(0); // no vars1
  w.many(5, () => w.i32(0));
  w.many(6, () => w.i32(0)); // >= 101
  w.u16(0); // >= 102
  w.text('', 2); // >= 103
  w.text('', 2);
  w.i32(0); // >= 104
  w.many(3, () => w.i32(0)); // >= 106
  w.text('', 2); // >= 108
  w.many(3, () => w.i32(0));
  w.text('', 2);
  w.many(3, () => w.i32(0));
  w.text('', 2); // >= 109
  w.text('', 2);
  w.u8(0);
  w.u8(0); // >= 110
  w.many(3, () => w.text('', 2)); // >= 119
  w.many(5, () => w.i32(0)); // 121, 122, 124, 126, 128
  w.many(2, () => w.i32(0)); // 129
  w.i32(0); // 130
  w.i32(0); // 131
  w.many(4, () => w.i32(0)); // 132
  w.u8(0); // 134
  w.u8(0); // 136
  w.many(4 + 24, () => w.i32(0)); // 137
  w.many(4, () => w.i32(0)); // >= 0x8a
  w.text('', 4);
  w.i32(0);
  // Part 3: one list of variables
  w.i32(0);
  w.i32(0);
  w.i32(1);
  w.i32(3);
  [100, 200, 300].forEach(w.i32);
  w.i32(0); // no strings
  w.i32(0);
  w.i32(1);
  w.u8(0);
  // Part 4
  event(w);
  w.i32(0);
  w.u8(0);
  w.u8(0);
  w.i32(0);
  w.i32(0);
  // Part 5
  w.u16(0);
  // Variable DB: one type, fields [number, string], one row
  w.u8(0);
  w.i32(1);
  w.i32(-1);
  w.i32(2);
  w.i32(0);
  w.i32(2000);
  w.i32(1);
  w.i32(42);
  w.text('Hero', 4);
  // Part 7
  w.u8(0);
  w.u8(0x19);

  const plain = new Uint8Array(0x14 + w.bytes.length);
  plain.set([0x0b, 0x33, 0, 0x18, 0x38, 0x3c, 0x55, 0x3a, 0, 0x3a, 0x1f, 2, 0x27, 0x5f, 0x52, 0x45, 0x76, 0x3b, 0x51, 0x50]);
  plain.set(w.bytes, 0x14);
  plain[2] = checksum(plain);
  return crypt(plain);
}

const ints = (node: WolfNode): WolfInt[] => (node.kind === 'group' ? node.children.flatMap(ints) : node.kind === 'int' ? [node] : []);
const find = (group: WolfGroup, ...keys: string[]): WolfNode => keys.reduce<WolfNode>((g, k) => (g as WolfGroup).children.find((c) => c.key === k)!, group);

describe('Wolf RPG Editor encryption', () => {
  it('uses MSVC rand(): decrypting and encrypting are the same operation', () => {
    const data = new Uint8Array(200).map((_, i) => (i * 37) & 0xff);
    expect(crypt(crypt(data))).toEqual(data);
    // The header (with the seeds) stays in the clear.
    expect(crypt(data).subarray(0, 0x14)).toEqual(data.subarray(0, 0x14));
  });

  it('reproduces MSVC rand()', () => {
    const rand = msvcRand(1);
    expect([rand(), rand(), rand(), rand()]).toEqual([41, 18467, 6334, 26500]);
  });
});

describe('Wolf RPG Editor saves', () => {
  it('reads the structure, the variables and the Variable DB', () => {
    const save = parseWolfSave(makeSave());
    expect(save.structure).toMatchObject({ version: 0x8c, utf8: true, gameName: 'Demo Wolf' });
    const vars = find(save.structure.root, 'part 3', 'vars4', '[0]') as WolfGroup;
    expect(ints(vars).filter((n) => n.key.startsWith('[')).map((n) => n.value)).toEqual([100, 200, 300]);
    expect(find(save.structure.root, 'variable db', 'type 0', 'row 0', 'field 0')).toMatchObject({ value: 42 });
    expect(find(save.structure.root, 'variable db', 'type 0', 'row 0', 'field 1')).toMatchObject({ kind: 'text', value: 'Hero' });
  });

  it('writes the file back unchanged when nothing was edited', () => {
    const raw = makeSave();
    const save = parseWolfSave(raw);
    expect(serializeWolfSave(save)).toBe(raw);
    const field = find(save.structure.root, 'variable db', 'type 0', 'row 0', 'field 0') as WolfInt;
    expect(serializeWolfSave(setWolfValue(setWolfValue(save, field, 5), field, 42))).toBe(raw);
  });

  it('overwrites only the edited number, with a valid checksum', () => {
    const raw = makeSave();
    const save = parseWolfSave(raw);
    const variable = (find(save.structure.root, 'part 3', 'vars4', '[0]') as WolfGroup).children[2] as WolfInt;
    const field = find(save.structure.root, 'variable db', 'type 0', 'row 0', 'field 0') as WolfInt;
    const edited = setWolfValue(setWolfValue(save, variable, 99999), field, -5);
    const written = serializeWolfSave(edited);

    const back = parseWolfSave(written);
    expect((find(back.structure.root, 'part 3', 'vars4', '[0]') as WolfGroup).children[2]).toMatchObject({ value: 99999 });
    expect(find(back.structure.root, 'variable db', 'type 0', 'row 0', 'field 0')).toMatchObject({ value: -5 });
    const plain = crypt(written);
    expect(plain[2]).toBe(checksum(plain));
    const differing = [...plain].filter((b, i) => b !== save.plain[i]).length;
    expect(differing).toBeLessThanOrEqual(1 + 4 + 4); // checksum + two Int32
  });

  it('refuses counts, out-of-range values and text', () => {
    const save = parseWolfSave(makeSave());
    const count = find(save.structure.root, 'part 3', 'var3') as WolfInt;
    expect(() => setWolfValue(save, count, 2)).toThrow(/read-only/);
    const byte = find(save.structure.root, 'part 2', 'var1') as WolfInt;
    expect(() => setWolfValue(save, byte, 300)).toThrow(/0 to 255/);
    const [hero] = wolfTree.roots(save).filter((n) => n.key === 'variable db');
    expect(hero.type).toBe('Group');
  });

  it('shows numbers as editable tree leaves', () => {
    const save = parseWolfSave(makeSave());
    const roots = wolfTree.roots(save);
    expect(roots.map((n) => n.key)).toContain('variable db');
    const part3 = roots.find((n) => n.key === 'part 3')!;
    const vars4 = wolfTree.children(save, part3).find((n) => n.key === 'vars4')!;
    const list = wolfTree.children(save, wolfTree.children(save, vars4)[0]);
    const value = list.find((n) => n.key === '[1]')!;
    expect(value).toMatchObject({ type: 'Int32', value: 200, editable: 'number', integer: true });
    const edited = wolfTree.setValue(save, value, 250) as WolfSave;
    expect(wolfTree.valueOf(edited, value)).toBe(250);
    expect(wolfValue(save, (find(save.structure.root, 'part 3', 'vars4', '[0]') as WolfGroup).children[2] as WolfInt)).toBe(200);
  });

  it('lists the normal variables from 0 on the Variables page, whole numbers only', () => {
    const save = parseWolfSave(makeSave());
    const editor = wolfFormat.editor;
    expect(editor.getVariables(save)).toEqual({ 0: 100, 1: 200, 2: 300 });
    expect(editor).toMatchObject({ firstVariableId: 0, integerVariables: true });
    const edited = editor.setVariable(save, 1, 99999);
    expect(editor.getVariables(edited)).toEqual({ 0: 100, 1: 99999, 2: 300 });
    expect(() => editor.setVariable(save, 1, 1.5)).toThrow(/whole number/);
    expect(() => editor.setVariable(save, 9, 1)).toThrow(/No variable 9/);
    expect(wolfFormat.pages).toEqual(['Variables', 'Advanced']);
  });

  it('gets the game name from the folder', () => {
    expect(wolfGameName('C:\\Games\\Hero Quest\\Save\\SaveData01.sav')).toBe('Hero Quest');
    expect(wolfGameName('/games/Hero/SaveData01.sav')).toBe('Hero');
  });
});

// Real saves dropped into save_files/ (git-ignored).
const dir = join(process.cwd(), 'save_files');
const realSaves = existsSync(dir) ? readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.sav')) : [];

describe.skipIf(realSaves.length === 0)('real Wolf RPG Editor saves', () => {
  it.each(realSaves)('%s: reads, edits a number in place and writes back losslessly', (file) => {
    const raw = new Uint8Array(readFileSync(join(dir, file)));
    const save = parseWolfSave(raw);
    expect(save.plain[2]).toBe(checksum(save.plain));
    expect(serializeWolfSave(save)).toBe(raw);

    const target = ints((find(save.structure.root, 'part 3', 'vars4') as WolfGroup).children[0]).find((n) => !n.readOnly)!;
    const written = serializeWolfSave(setWolfValue(save, target, target.value + 1));
    expect(written.length).toBe(raw.length);
    const back = parseWolfSave(written);
    const before = ints(save.structure.root);
    const after = ints(back.structure.root);
    expect(after.length).toBe(before.length);
    after.forEach((n, i) => expect(n.value).toBe(n.offset === target.offset ? target.value + 1 : before[i].value));
    expect(serializeWolfSave(setWolfValue(back, after.find((n) => n.offset === target.offset)!, target.value))).toEqual(raw);
  });

  // In the game this save is from, the money shown (11000) is normal variable 7; editing it was checked in game.
  it.skipIf(!realSaves.includes('SaveData03.sav'))('SaveData03.sav: variable 7 is the money', () => {
    const save = parseWolfSave(new Uint8Array(readFileSync(join(dir, 'SaveData03.sav'))));
    expect(wolfFormat.editor.getVariables(save)[7]).toBe(11000);
  });
});
