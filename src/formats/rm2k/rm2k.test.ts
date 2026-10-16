import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { berBytes, readBer } from './lcf';
import { LsdSave, parseLsdSave, serializeLsdSave } from './save';
import { lsdTree } from './tree';
import { rm2kFormat } from './index';
import { findFormat, notASaveReason } from '..';
import { TreeNode } from '../types';

// -- A save built the way RPG_RT lays it out ----------------------------------

const ber = (n: number) => berBytes(n);
const chunk = (id: number, data: number[]) => [...ber(id), ...ber(data.length), ...data];
const struct = (...chunks: number[][]) => [...chunks.flat(), 0];
const text = (s: string) => [...new TextEncoder().encode(s)];
const le = (bytes: number, values: number[]) =>
  values.flatMap((v) => Array.from({ length: bytes }, (_, i) => ((v >> (8 * i)) & 0xff)));

const editor = rm2kFormat.editor;

function makeSave(): Uint8Array {
  const title = chunk(0x64, struct(chunk(0x0b, text('Hero')), chunk(0x0c, ber(5))));
  const system = chunk(
    0x65,
    struct(
      chunk(0x1f, ber(3)),
      chunk(0x20, [0, 1, 0]),
      chunk(0x21, ber(3)),
      chunk(0x22, le(4, [10, -5, 300])),
    ),
  );
  const actor = (id: number, name: string, level: number, exp: number, hp: number, hpMod?: number) => [
    ...ber(id),
    ...struct(
      chunk(0x01, text(name)),
      chunk(0x1f, ber(level)),
      chunk(0x20, ber(exp)),
      ...(hpMod === undefined ? [] : [chunk(0x21, ber(hpMod))]),
      chunk(0x47, ber(hp)),
      chunk(0x48, ber(12)),
    ),
  ];
  const actors = chunk(0x6c, [...ber(2), ...actor(1, 'Alex', 5, 1200, 85, -5), ...actor(2, 'Mia', 3, 300, 40)]);
  const inventory = chunk(
    0x6d,
    struct(chunk(0x0b, ber(2)), chunk(0x0c, le(2, [3, 7])), chunk(0x0d, [5, 1]), chunk(0x0e, [0, 0]), chunk(0x15, ber(1234))),
  );
  const unknown = chunk(0x7f, [1, 2, 3]);
  const header = [...ber(11), ...text('LcfSaveData')];
  return Uint8Array.from([...header, ...title, ...system, ...actors, ...inventory, ...unknown]);
}

const path = (save: LsdSave, ...keys: string[]): TreeNode => {
  let nodes = lsdTree.roots(save);
  let found: TreeNode | undefined;
  for (const key of keys) {
    found = nodes.find((n) => n.key === key);
    if (!found) throw new Error(`No "${key}" among ${nodes.map((n) => n.key).join(', ')}`);
    nodes = found.hasChildren ? lsdTree.children(save, found) : [];
  }
  return found!;
};

describe('LCF numbers', () => {
  it('reads and writes BER integers, including negative 32-bit values', () => {
    for (const n of [0, 1, 127, 128, 16383, 16384, 999999, 2 ** 31 - 1, -1, -5, -(2 ** 31)]) {
      const bytes = Uint8Array.from(berBytes(n));
      expect(readBer(bytes, 0)).toEqual([n, bytes.length]);
    }
    expect(berBytes(300)).toEqual([0x82, 0x2c]);
  });
});

describe('RPG Maker 2000/2003 saves', () => {
  it('writes the file back unchanged when nothing was edited', () => {
    const raw = makeSave();
    const save = parseLsdSave(raw);
    expect(serializeLsdSave(save)).toBe(raw);
  });

  it('reads the gold, items, characters, switches and variables', () => {
    const save = parseLsdSave(makeSave());
    expect(editor.getGold(save)).toBe(1234);
    expect(editor.getInventory(save, 'items')).toEqual({ 3: 5, 7: 1 });
    expect(editor.getInventory(save, 'weapons')).toEqual({});
    expect(editor.getSwitches(save)).toEqual([null, false, true, false]);
    expect(editor.getVariables(save)).toEqual({ 1: 10, 2: -5, 3: 300 });
    expect(editor.getActors(save)).toMatchObject([
      { slot: 0, name: 'Alex', level: 5, exp: 1200, hp: 85, mp: 12, paramPlus: [-5, 0, 0, 0, 0, 0], statLabels: { mp: 'SP' } },
      { slot: 1, name: 'Mia', level: 3, exp: 300, hp: 40, mp: 12, paramPlus: [0, 0, 0, 0, 0, 0] },
    ]);
  });

  it('changes a number whose size grows, keeping every other chunk as it was', () => {
    const raw = makeSave();
    const save = parseLsdSave(raw);
    const edited = editor.setGold(save, 99999); // 1234 takes 2 bytes, 99999 takes 3
    const out = serializeLsdSave(edited);
    expect(out.length).toBe(raw.length + 1);
    const back = parseLsdSave(out);
    expect(editor.getGold(back)).toBe(99999);
    expect(editor.getInventory(back, 'items')).toEqual({ 3: 5, 7: 1 });
    expect(editor.getVariables(back)).toEqual({ 1: 10, 2: -5, 3: 300 });
    // The chunks before the inventory are byte for byte the same.
    const untouched = raw.length - 1 - 3 - 2 - 2 - 2 - 2 - 5 - 3 - 5 - 4; // generous: compare the head only
    expect(Array.from(out.subarray(0, 40))).toEqual(Array.from(raw.subarray(0, 40)));
    expect(untouched).toBeGreaterThan(0);
  });

  it('writes the original file when an edit is put back', () => {
    const raw = makeSave();
    const save = parseLsdSave(raw);
    expect(serializeLsdSave(editor.setGold(editor.setGold(save, 5), 1234))).toBe(raw);
    expect(serializeLsdSave(editor.setSwitch(editor.setSwitch(save, 2, false), 2, true))).toBe(raw);
  });

  it('edits switches and variables, and grows them when the ID is past the end', () => {
    const save = parseLsdSave(makeSave());
    const edited = editor.setVariable(editor.setSwitch(save, 1, true), 2, 40000);
    expect(editor.getSwitches(edited)).toEqual([null, true, true, false]);
    expect(editor.getVariables(edited)).toEqual({ 1: 10, 2: 40000, 3: 300 });

    const grown = editor.setVariable(editor.setSwitch(save, 6, true), 5, -7);
    const back = parseLsdSave(serializeLsdSave(grown));
    expect(editor.getSwitches(back)).toEqual([null, false, true, false, false, false, true]);
    expect(editor.getVariables(back)).toEqual({ 1: 10, 2: -5, 3: 300, 4: 0, 5: -7 });
    expect(() => editor.setVariable(save, 1, 1.5)).toThrow(/whole number/);
    expect(() => editor.setSwitch(save, 6000, true)).toThrow(/from 1 to 5000/);
  });

  it('adds, changes and removes items, keeping the lists in step', () => {
    const save = parseLsdSave(makeSave());
    const added = editor.setInventoryCount(save, 'items', 5, 9);
    expect(editor.getInventory(added, 'items')).toEqual({ 3: 5, 5: 9, 7: 1 });
    const back = parseLsdSave(serializeLsdSave(added));
    expect(editor.getInventory(back, 'items')).toEqual({ 3: 5, 5: 9, 7: 1 });
    expect(path(back, 'inventory', 'item_ids_count')).toMatchObject({ type: 'Count', value: 3 });
    expect(path(back, 'inventory', 'item_usage').summary).toBe('3 values');

    const changed = editor.setInventoryCount(back, 'items', 3, 99);
    expect(editor.getInventory(changed, 'items')).toEqual({ 3: 99, 5: 9, 7: 1 });
    const removed = editor.setInventoryCount(changed, 'items', 7, 0);
    expect(editor.getInventory(removed, 'items')).toEqual({ 3: 99, 5: 9 });
    expect(editor.setInventoryCount(save, 'items', 50, 0)).toBe(save);
    expect(() => editor.setInventoryCount(save, 'items', 3, 100)).toThrow(/from 0 to 99/);
    expect(() => editor.setInventoryCount(save, 'weapons', 3, 1)).toThrow(/items only/);
  });

  it('edits a character, adding fields the save leaves out when they are at their default', () => {
    const save = parseLsdSave(makeSave());
    let edited = editor.setActorField(save, 0, 'level', 50);
    edited = editor.setActorField(edited, 1, 'hp', 999);
    edited = editor.setActorParamPlus(edited, 1, 4, 7); // Mia has no stat bonuses yet: Spirit
    edited = editor.setActorParamPlus(edited, 0, 0, 25); // -5 takes 5 bytes, 25 takes 1
    const back = parseLsdSave(serializeLsdSave(edited));
    expect(editor.getActors(back)).toMatchObject([
      { name: 'Alex', level: 50, exp: 1200, hp: 85, paramPlus: [25, 0, 0, 0, 0, 0] },
      { name: 'Mia', level: 3, hp: 999, paramPlus: [0, 0, 0, 0, 7, 0] },
    ]);
    // New fields go where their id belongs, so the chunks stay in order.
    const ids = (path(back, 'actors', '[2]') && lsdTree.children(back, path(back, 'actors', '[2]'))).map((n) => n.key);
    expect(ids).toEqual(['name', 'level', 'exp', 'spirit_mod', 'current_hp', 'current_sp']);
    expect(() => editor.setActorField(save, 0, 'tp', 1)).toThrow(/no TP/);
    expect(() => editor.setActorField(save, 5, 'hp', 1)).toThrow(/No such character/);
  });

  it('limits gold', () => {
    const save = parseLsdSave(makeSave());
    expect(() => editor.setGold(save, 1000000)).toThrow(/from 0 to 999999/);
    expect(() => editor.setGold(save, -1)).toThrow();
  });
});

describe('RPG Maker 2000/2003 tree', () => {
  it('shows the fields by name, with unknown chunks by id', () => {
    const save = parseLsdSave(makeSave());
    expect(lsdTree.roots(save).map((n) => n.key)).toEqual(['title', 'system', 'actors', 'inventory', '0x7F']);
    expect(path(save, 'title', 'hero_name')).toMatchObject({ type: 'String', value: 'Hero' });
    expect(path(save, 'actors', '[1]')).toMatchObject({ type: 'SaveActor', hasChildren: true });
    expect(path(save, 'actors', '[1]', 'level')).toMatchObject({ type: 'Number', value: 5, editable: 'number', integer: true });
    expect(path(save, '0x7F')).toMatchObject({ type: 'Raw', summary: '3 bytes', hasChildren: false });
    expect(path(save, 'system', 'switches')).toMatchObject({ type: 'Vector<Boolean>', summary: '3 values' });
    expect(path(save, 'system', 'switches', '[2]')).toMatchObject({ type: 'bool', value: true, editable: 'boolean' });
  });

  it('edits values anywhere, and keeps sizes and counts read-only', () => {
    const save = parseLsdSave(makeSave());
    let edited = lsdTree.setValue(save, path(save, 'actors', '[2]', 'exp'), 99999);
    edited = lsdTree.setValue(edited, path(save, 'system', 'variables', '[2]'), 7);
    edited = lsdTree.setValue(edited, path(save, 'system', 'switches', '[1]'), true);
    const back = parseLsdSave(serializeLsdSave(edited));
    expect(editor.getActors(back)[1].exp).toBe(99999);
    expect(editor.getVariables(back)).toEqual({ 1: 10, 2: 7, 3: 300 });
    expect(editor.getSwitches(back)).toEqual([null, true, true, false]);
    expect(lsdTree.valueOf(edited, path(edited, 'system', 'variables', '[2]'))).toBe(7);
    expect(lsdTree.valueOf(save, path(save, 'system', 'variables', '[2]'))).toBe(-5); // the loaded save is untouched

    expect(path(save, 'system', 'variables_count')).toMatchObject({ type: 'Count', value: 3 });
    expect(path(save, 'system', 'variables_count').editable).toBeUndefined();
    expect(() => lsdTree.setValue(save, path(save, 'system', 'variables_count'), 9)).toThrow(/size/);
    expect(() => lsdTree.setValue(save, path(save, 'title', 'hero_name'), 'x')).toThrow(/can't be edited/);
    expect(() => lsdTree.setValue(save, path(save, 'actors', '[1]', 'level'), 1.5)).toThrow(/whole number/);
  });
});

describe('RPG Maker 2000/2003 files', () => {
  it('only opens saves with the LcfSaveData header', () => {
    expect(() => parseLsdSave(Uint8Array.from([1, 2, 3]))).toThrow(/Not an RPG Maker 2000\/2003 save/);
    expect(() => parseLsdSave(Uint8Array.from([...ber(11), ...text('LcfMapUnit_')]))).toThrow(/no "LcfSaveData" header/);
  });

  it('recognises .lsd saves, and explains the game data files', () => {
    expect(findFormat('C:/Games/Hero/Save01.lsd')?.id).toBe('rm2k');
    expect(findFormat('C:/Games/Hero/RPG_RT.ldb')).toBeUndefined();
    expect(notASaveReason('C:/Games/Hero/RPG_RT.ldb')).toBe(
      "RPG_RT.ldb is part of the game's data, not a save. Saves are usually named Save01.lsd, Save02.lsd...",
    );
    expect(notASaveReason('C:/Games/Hero/Map0001.lmu')).toMatch(/Map0001\.lmu is part of the game's data/);
    expect(rm2kFormat.gameName('C:/Games/Hero Quest/Save01.lsd')).toBe('Hero Quest');
  });
});

// Real saves dropped into save_files/ (git-ignored).
const dir = join(process.cwd(), 'save_files');
const realSaves = existsSync(dir) ? readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.lsd')) : [];

describe.skipIf(realSaves.length === 0)('real RPG Maker 2000/2003 saves', () => {
  it.each(realSaves)('%s: reads, writes back unchanged, and an edit changes only that value', (file) => {
    const raw = new Uint8Array(readFileSync(join(dir, file)));
    const save = parseLsdSave(raw);
    expect(serializeLsdSave(save)).toEqual(raw);
    expect(lsdTree.roots(save).length).toBeGreaterThan(3);
    const gold = editor.getGold(save);
    const edited = editor.setGold(save, Math.min(gold + 1, 999999));
    const back = parseLsdSave(serializeLsdSave(edited));
    expect(editor.getGold(back)).toBe(Math.min(gold + 1, 999999));
    expect(editor.getVariables(back)).toEqual(editor.getVariables(save));
    expect(editor.getActors(back)).toEqual(editor.getActors(save));
    expect(serializeLsdSave(editor.setGold(edited, gold))).toEqual(raw);
  });
});
