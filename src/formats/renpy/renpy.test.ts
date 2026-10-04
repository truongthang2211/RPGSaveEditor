import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renpyFormat } from '.';
import { parseRenpySave, RenpySave, serializeRenpySave } from './save';
import { renpyGameName, isRenpySavePath } from './paths';
import { entryData, readZip } from './zip';
import { writePickle } from '../pickle/writer';
import { TreeNode } from '../types';

const fixtureBytes = () => new Uint8Array(readFileSync(join(__dirname, '__fixtures__', '1-1-LT1.save')));
const { tree } = renpyFormat;

const variables = (save: RenpySave) => Object.fromEntries(renpyFormat.namedVariables!(save).map((v) => [v.name, v.node]));
const values = (save: RenpySave) =>
  Object.fromEntries(Object.entries(variables(save)).map(([name, node]) => [name, tree.valueOf(save, node)]));

function path(save: RenpySave, ...keys: string[]): TreeNode {
  let nodes = tree.roots(save);
  let found: TreeNode | undefined;
  for (const key of keys) {
    found = nodes.find((n) => n.key === key);
    if (!found) throw new Error(`No "${key}" among ${nodes.map((n) => n.key).join(', ')}`);
    nodes = found.hasChildren ? tree.children(save, found) : [];
  }
  return found!;
}

describe("Ren'Py saves", () => {
  it('lists the game variables by name, without Ren\'Py internals', async () => {
    const save = await parseRenpySave(fixtureBytes());
    expect(values(save)).toEqual({
      money: 120,
      love_points: 3,
      negative: -5,
      big_number: 70000,
      huge: '1180591620717411303424',
      ratio: 0.5,
      met_lily: true,
      angry: false,
      nothing: null,
      mc_name: 'Alex',
      nickname: 'Alex',
      unicode_name: 'Ånna ✓',
      'mystore.counter': 7,
    });
    const vars = variables(save);
    expect(vars.money).toMatchObject({ type: 'int', editable: 'number', integer: true });
    expect(vars.ratio).toMatchObject({ type: 'float', editable: 'number' });
    expect(vars.huge.editable).toBeUndefined(); // too big for a JS number
    expect(vars.nothing.editable).toBeUndefined();
  });

  it('shows containers and objects in the tree, and the rollback log read-only', async () => {
    const save = await parseRenpySave(fixtureBytes());
    expect(tree.roots(save).map((n) => n.key)).toEqual(['store', 'rollback log']);
    expect(path(save, 'store', 'inventory')).toMatchObject({ type: 'RevertableList', summary: 'renpy.revertable.RevertableList · 2 items' });
    expect(path(save, 'store', 'inventory', '[1]')).toMatchObject({ value: 'map', editable: 'string' });
    expect(path(save, 'store', 'flags', 'visits')).toMatchObject({ value: 2, editable: 'number' });
    expect(path(save, 'store', 'player', 'hp')).toMatchObject({ value: 10, editable: 'number' });
    expect(path(save, 'store', 'player', 'friends', '[0]').summary).toMatch(/cycle/);
    expect(path(save, 'store', 'tags', 'args', '[0]', '[0]')).toMatchObject({ value: 'brave', editable: undefined }); // set members, as constructor arguments
    expect(path(save, 'rollback log', 'log', '[0]', 'stores', 'store', 'money')).toMatchObject({ value: 100, editable: undefined });
  });

  it('writes edits back into the zip, keeping the other entries', async () => {
    const save = await parseRenpySave(fixtureBytes());
    expect(await serializeRenpySave(save)).toEqual(fixtureBytes()); // unchanged until edited

    let edited = save;
    const set = (node: TreeNode, value: number | string | boolean) => {
      edited = tree.setValue(edited, node, value);
    };
    set(variables(edited).money, 999999);
    set(variables(edited).ratio, 1.25);
    set(variables(edited).met_lily, false);
    set(variables(edited).nickname, 'Lex');
    set(variables(edited)['mystore.counter'], 8);
    set(path(edited, 'store', 'player', 'hp'), 250);
    set(path(edited, 'store', 'flags', 'visits'), 3);
    set(path(edited, 'store', 'inventory', '[0]'), 'golden key');

    const written = await serializeRenpySave(edited);
    const again = await parseRenpySave(written);
    expect(values(again)).toMatchObject({ money: 999999, ratio: 1.25, met_lily: false, nickname: 'Lex', mc_name: 'Alex', 'mystore.counter': 8 });
    expect(tree.valueOf(again, path(again, 'store', 'player', 'hp'))).toBe(250);
    expect(tree.valueOf(again, path(again, 'store', 'flags', 'visits'))).toBe(3);
    expect(tree.valueOf(again, path(again, 'store', 'inventory', '[0]'))).toBe('golden key');

    const names = (bytes: Uint8Array) => readZip(bytes).entries.map((e) => e.name);
    expect(names(written)).toEqual(['screenshot.png', 'extra_info', 'json', 'renpy_version', 'log', 'signatures']);
    const untouched = (bytes: Uint8Array) => readZip(bytes).entries.filter((e) => e.name !== 'log').map((e) => e.compressed);
    expect(untouched(written)).toEqual(untouched(fixtureBytes()));

  });

  it('also edits the values the rollback log restores on load', async () => {
    const save = await parseRenpySave(fixtureBytes());
    const recorded = (s: RenpySave, ...keys: string[]) => tree.valueOf(s, path(s, 'rollback log', 'log', ...keys));
    expect(recorded(save, '[1]', 'stores', 'store', 'money')).toBe(110);
    expect(recorded(save, '[1]', 'objects', '[0]', '[1]', 'hp')).toBe(7);
    expect(recorded(save, '[1]', 'objects', '[1]', '[1]', '[1]', '[1]')).toBe(1); // flags snapshot: ("visits", 1)

    let edited = tree.setValue(save, variables(save).money, 5000);
    edited = tree.setValue(edited, path(edited, 'store', 'player', 'hp'), 99);
    edited = tree.setValue(edited, path(edited, 'store', 'flags', 'visits'), 9);
    edited = tree.setValue(edited, variables(edited).met_lily, false);
    const again = await parseRenpySave(await serializeRenpySave(edited));
    expect(recorded(again, '[0]', 'stores', 'store', 'money')).toBe(5000); // every entry, not just the last
    expect(recorded(again, '[1]', 'stores', 'store', 'money')).toBe(5000);
    expect(recorded(again, '[1]', 'stores', 'store', 'met_lily')).toBe(false);
    expect(recorded(again, '[1]', 'objects', '[0]', '[1]', 'hp')).toBe(99);
    expect(recorded(again, '[1]', 'objects', '[0]', '[1]', 'name')).toBe('Alex'); // other attributes untouched
    expect(recorded(again, '[1]', 'objects', '[1]', '[1]', '[1]', '[1]')).toBe(9);
    expect(recorded(again, '[1]', 'objects', '[1]', '[1]', '[0]', '[1]')).toBe(false); // door_open untouched

    // Setting the value in the file back restores the recorded copies too.
    const back = tree.setValue(tree.setValue(save, variables(save).money, 5000), variables(save).money, 120);
    expect(back.edits.size).toBe(0);
  });

  it('refuses values of another type, and setting a value back drops the edit', async () => {
    const save = await parseRenpySave(fixtureBytes());
    const money = variables(save).money;
    expect(() => tree.setValue(save, money, 1.5)).toThrow();
    expect(() => tree.setValue(save, money, 'lots')).toThrow();
    const back = tree.setValue(tree.setValue(save, money, 5), money, 120);
    expect(back.edits.size).toBe(0);
  });

  it('rejects files that are not Ren\'Py saves', async () => {
    await expect(parseRenpySave(new TextEncoder().encode('{"not":"a zip"}'))).rejects.toThrow(/Not a Ren'Py save/);
  });

  it('finds the game name from the save path', () => {
    expect(renpyGameName('C:\\Games\\Summer Days\\game\\saves\\1-1-LT1.save')).toBe('Summer Days');
    expect(renpyGameName('C:\\Users\\me\\AppData\\Roaming\\RenPy\\SummerDays-1612345678\\auto-1-LT1.save')).toBe('SummerDays');
    expect(isRenpySavePath('/x/quick-1-LT1.save')).toBe(true);
    expect(isRenpySavePath('/x/persistent')).toBe(false);
  });
});

// Real saves dropped into save_files/ (git-ignored) are checked too.
const saveDir = join(process.cwd(), 'save_files');
const realSaves = existsSync(saveDir) ? readdirSync(saveDir).filter((f) => f.toLowerCase().endsWith('.save')) : [];

describe.skipIf(realSaves.length === 0)("real Ren'Py saves", () => {
  it.each(realSaves)('%s: reads, edits a number and writes back losslessly', async (file) => {
    const bytes = new Uint8Array(readFileSync(join(saveDir, file)));
    const save = await parseRenpySave(bytes);
    const log = await entryData(save.archive.entries[save.logEntry]);
    expect(Buffer.from(writePickle(save.pickle, new Map())).equals(Buffer.from(log))).toBe(true); // (toEqual is slow on MBs)

    const number = renpyFormat.namedVariables!(save).find((v) => v.node.editable === 'number' && v.node.integer);
    if (!number) return;
    const edited = tree.setValue(save, number.node, (number.node.value as number) + 1);
    const again = await parseRenpySave(await serializeRenpySave(edited));
    const after = renpyFormat.namedVariables!(again).find((v) => v.name === number.name)!;
    expect(tree.valueOf(again, after.node)).toBe((number.node.value as number) + 1);
    expect(renpyFormat.namedVariables!(again).length).toBe(renpyFormat.namedVariables!(save).length);
  }, 30_000);
});
