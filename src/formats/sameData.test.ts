import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sameValue } from './sameValue';
import { mvmzFormat } from './mvmz';
import { vxaceFormat } from './vxace';
import { renpyFormat } from './renpy';
import { fromDumps } from './rgss/patches';
import { parseRenpySave } from './renpy/save';
import { symbol } from './marshal/helpers';
import { MObject, MValue } from './marshal/types';

describe('sameValue', () => {
  it('compares deeply, with typed arrays, Maps and cycles', () => {
    expect(sameValue({ a: [1, { b: 'x' }] }, { a: [1, { b: 'x' }] })).toBe(true);
    expect(sameValue({ a: [1, 2] }, { a: [1, 3] })).toBe(false);
    expect(sameValue({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(sameValue(Uint8Array.of(1, 2), Uint8Array.of(1, 2))).toBe(true);
    expect(sameValue(new Map([[1, { v: 2 }]]), new Map([[1, { v: 2 }]]))).toBe(true);
    const a: any = { name: 'a' };
    a.self = a;
    const b: any = { name: 'a' };
    b.self = b;
    expect(sameValue(a, b)).toBe(true);
  });
});

describe('an edit set back to the value in the file is no change', () => {
  it('MV/MZ', () => {
    const save = { party: { _gold: 100, _items: { 1: 3 } }, variables: { _data: [null, 5] } };
    const { editor, sameData } = mvmzFormat;
    const changed = editor.setGold(save, 999);
    expect(sameData!(changed, save)).toBe(false);
    expect(sameData!(editor.setGold(changed, 100), save)).toBe(true);
  });

  it('XP/VX/VX Ace (patches)', () => {
    const obj = (fields: Record<string, MValue>): MObject => ({
      kind: 'object',
      className: symbol('Game_Party'),
      fields: Object.entries(fields).map(([name, value]) => [symbol(name), value]),
    });
    const hash = (entries: [MValue, MValue][]): MValue => ({ kind: 'hash', entries, hasDefault: false });
    const party = obj({ '@gold': 100, '@items': hash([[1, 3]]) });
    const switches = { ...obj({ '@data': { kind: 'array', items: [null, true, null] } }), className: symbol('Game_Switches') };
    const contents = hash([[symbol('party'), party], [symbol('switches'), switches]]);
    const save = fromDumps([hash([]), contents]);
    const { editor, sameData } = vxaceFormat;
    const changed = editor.setGold(save, 999);
    expect(sameData!(changed, save)).toBe(false);
    const back = editor.setGold(changed, 100);
    expect(back.patches.size).toBe(0); // setting the file's value drops the patch
    expect(sameData!(back, save)).toBe(true);
    expect(sameData!(editor.setInventoryCount(back, 'items', 1, 4), save)).toBe(false);
    expect(sameData!(editor.setInventoryCount(editor.setInventoryCount(back, 'items', 1, 4), 'items', 1, 3), save)).toBe(true);

    // Values the file doesn't hold: 0 of an unlisted item, a nil or missing switch set off.
    const item = editor.setInventoryCount(save, 'items', 7, 5);
    expect(editor.setInventoryCount(item, 'items', 7, 0).patches.size).toBe(0);
    for (const id of [2, 9]) {
      const on = editor.setSwitch(save, id, true);
      expect(sameData!(on, save)).toBe(false);
      expect(editor.setSwitch(on, id, false).patches.size).toBe(0);
    }
    expect(sameData!(editor.setSwitch(save, 1, false), save)).toBe(false); // true in the file
  });

  it("Ren'Py", async () => {
    const save = await parseRenpySave(new Uint8Array(readFileSync(join(__dirname, 'renpy/__fixtures__/1-1-LT1.save'))));
    const { tree, sameData, namedVariables } = renpyFormat;
    const money = namedVariables!(save).find((v) => v.name === 'money')!.node;
    const changed = tree.setValue(save, money, 5);
    expect(sameData!(changed, save)).toBe(false);
    expect(sameData!(tree.setValue(changed, money, 120), save)).toBe(true);
  });
});
