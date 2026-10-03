import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { vxaceEditor as editor, VxAceSave } from './editor';
import { readMarshalStream } from '../marshal/reader';
import { writeMarshalStream } from '../marshal/writer';
import { fromDumps, materialize } from '../rgss/patches';
import { getField, getSymbolKey, makeString, symbol } from '../marshal/helpers';
import { MArray, MHash, MObject, MValue } from '../marshal/types';

const obj = (className: string, fields: Record<string, MValue>): MObject => ({
  kind: 'object',
  className: symbol(className),
  fields: Object.entries(fields).map(([name, value]) => [symbol(name), value]),
});
const array = (...items: MValue[]): MArray => ({ kind: 'array', items });
const intHash = (entries: [number, MValue][]): MHash => ({ kind: 'hash', entries, hasDefault: false });
const symHash = (entries: Record<string, MValue>): MHash => ({
  kind: 'hash',
  entries: Object.entries(entries).map(([k, v]) => [symbol(k), v]),
  hasDefault: false,
});

/** Minimal VX Ace save, including the actor <-> Game_ActionResult cycle real saves have. */
function makeSave(): VxAceSave {
  const result = obj('Game_ActionResult', { '@battler': null });
  const actor = obj('Game_Actor', {
    '@name': makeString('Éric'),
    '@hp': 100,
    '@mp': 20,
    '@tp': { kind: 'float', text: '12.5' },
    '@level': 3,
    '@class_id': 2,
    '@exp': intHash([[2, 300]]),
    '@param_plus': array(0, 0, 0, 0, 0, 0, 0, 0),
    '@result': result,
  });
  (result.fields[0] as [unknown, MValue])[1] = actor;

  const contents = symHash({
    switches: obj('Game_Switches', { '@data': array(null, true, false) }),
    variables: obj('Game_Variables', { '@data': array(null, 5, makeString('hello')) }),
    actors: obj('Game_Actors', { '@data': array(null, actor) }),
    party: obj('Game_Party', {
      '@gold': 50,
      '@actors': array(1),
      '@items': intHash([[1, 3]]),
      '@weapons': intHash([]),
      '@armors': intHash([[4, 1]]),
    }),
  });
  return fromDumps([symHash({ playtime_s: makeString('0:01') }), contents]);
}

const bytesOf = (save: VxAceSave) => Buffer.from(writeMarshalStream(materialize(save)));
const reread = (save: VxAceSave): VxAceSave => fromDumps(readMarshalStream(writeMarshalStream(materialize(save))));

describe('VX Ace editor (synthetic save)', () => {
  it('reads gold, inventory, actors, switches and variables', () => {
    const save = makeSave();
    expect(editor.getGold(save)).toBe(50);
    expect(editor.getInventory(save, 'items')).toEqual({ 1: 3 });
    expect(editor.getInventory(save, 'armors')).toEqual({ 4: 1 });
    expect(editor.getActors(save)).toEqual([
      {
        slot: 1,
        name: 'Éric',
        paramPlus: [0, 0, 0, 0, 0, 0, 0, 0],
        paramLabels: ['HP', 'MP', 'ATK', 'DEF', 'MAT', 'MDF', 'AGI', 'LUK'],
        limits: { level: { min: 1, max: 99 } },
        hp: 100,
        mp: 20,
        tp: 12.5,
        level: 3,
        exp: 300,
      },
    ]);
    expect(editor.getSwitches(save)).toEqual([null, true, false]);
    expect(editor.getVariables(save)).toEqual({ 0: null, 1: 5, 2: 'hello' });
  });

  it('edits survive a write/read cycle and never mutate the input', () => {
    const save = makeSave();
    const before = bytesOf(save);
    let edited = editor.setGold(save, 9999);
    edited = editor.setInventoryCount(edited, 'items', 7, 2);
    edited = editor.setInventoryCount(edited, 'items', 1, 10);
    edited = editor.setActorField(edited, 1, 'level', 50);
    edited = editor.setActorField(edited, 1, 'exp', 123456);
    edited = editor.setActorParamPlus(edited, 1, 2, 30);
    edited = editor.setSwitch(edited, 4, true);
    edited = editor.setVariable(edited, 1, 77);
    edited = editor.setVariable(edited, 3, 'world');

    expect(bytesOf(save).equals(before)).toBe(true);
    expect(edited.dumps).toBe(save.dumps); // edits are patches: the dumps are shared, not copied

    const back = reread(edited);
    expect(editor.getGold(back)).toBe(9999);
    expect(editor.getInventory(back, 'items')).toEqual({ 1: 10, 7: 2 });
    expect(editor.getActors(back)[0]).toMatchObject({ level: 50, exp: 123456, paramPlus: [0, 0, 30, 0, 0, 0, 0, 0] });
    expect(editor.getSwitches(back)).toEqual([null, true, false, null, true]);
    expect(editor.getVariables(back)).toMatchObject({ 1: 77, 2: 'hello', 3: 'world' });
  });

  it('keeps Float fields Float (e.g. @tp)', () => {
    const edited = editor.setActorField(makeSave(), 1, 'tp', 40);
    const actor = (getField(getSymbolKey(materialize(edited)[1], 'actors'), '@data') as MArray).items[1];
    expect(getField(actor, '@tp')).toEqual({ kind: 'float', text: '40' });
  });

  it('keeps shared/cyclic references shared after editing', () => {
    const edited = reread(editor.setGold(makeSave(), 1));
    const actor = (getField(getSymbolKey(edited.dumps[1], 'actors'), '@data') as MArray).items[1];
    const battler = getField(getField(actor, '@result'), '@battler');
    expect(battler).toBe(actor);
  });

  it('finds contents when a script writes an extra dump before it', () => {
    const [header, contents] = makeSave().dumps;
    const save = fromDumps([header, array(1, 2, 3), contents]); // e.g. a save thumbnail
    expect(editor.getGold(save)).toBe(50);
    expect(editor.getGold(reread(editor.setGold(save, 7)))).toBe(7);
  });

  it('reports a clear error for saves missing expected data', () => {
    const save = fromDumps([symHash({}), symHash({})]);
    expect(editor.getGold(save)).toBe(0);
    expect(editor.getActors(save)).toEqual([]);
    expect(() => editor.setGold(save, 1)).toThrow(/no party/);
  });
});

const saveDir = join(process.cwd(), 'save_files');
const realSaves = ['Save01.rvdata2', 'Save02.rvdata2'].filter((f) => existsSync(join(saveDir, f)));

describe.skipIf(realSaves.length === 0)('VX Ace editor (real saves)', () => {
  const load = (file: string) => new Uint8Array(readFileSync(join(saveDir, file)));

  it.each(realSaves)('%s: reads the party and actors', (file) => {
    const save = fromDumps(readMarshalStream(load(file)));
    expect(editor.getInventory(save, 'items')).toMatchObject({ 20: 3, 104: 1 });
    const [lona] = editor.getActors(save);
    expect(lona).toMatchObject({ slot: 1, name: 'Lona', paramPlus: [0, 0, 0, 0, 0, 0, 0, 0] });
  });

  it.each(realSaves)('%s: an edit round-trips and reverting it restores the original bytes', (file) => {
    const original = load(file);
    const save = fromDumps(readMarshalStream(original));
    const gold = editor.getGold(save);

    const edited = reread(editor.setInventoryCount(editor.setGold(save, 123456), 'items', 20, 99));
    expect(editor.getGold(edited)).toBe(123456);
    expect(editor.getInventory(edited, 'items')[20]).toBe(99);

    const reverted = editor.setInventoryCount(editor.setGold(edited, gold), 'items', 20, 3);
    expect(Buffer.from(writeMarshalStream(materialize(reverted))).equals(Buffer.from(original))).toBe(true);
  });
});
