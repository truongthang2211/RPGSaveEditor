import { describe, expect, it } from 'vitest';
import { vxEditor } from '../vx/editor';
import { xpEditor } from '../xp/editor';
import { readMarshalStream } from '../marshal/reader';
import { writeMarshalStream } from '../marshal/writer';
import { getField, makeString, symbol } from '../marshal/helpers';
import { MArray, MHash, MObject, MUserDef, MValue } from '../marshal/types';
import { locateByClass, RgssSave } from './editor';

const obj = (className: string, fields: Record<string, MValue>): MObject => ({
  kind: 'object',
  className: symbol(className),
  fields: Object.entries(fields).map(([name, value]) => [symbol(name), value]),
});
const array = (...items: MValue[]): MArray => ({ kind: 'array', items });
const intHash = (entries: [number, MValue][]): MHash => ({ kind: 'hash', entries, hasDefault: false });
const table = (): MUserDef => ({ kind: 'userdef', className: symbol('Table'), data: Uint8Array.from([1, 0, 0, 0, 2, 0, 0, 0]) });
const string = (text: string) => ({ kind: 'string' as const, bytes: new TextEncoder().encode(text) }); // Ruby 1.8: no encoding ivar

const roundTrip = (save: RgssSave): RgssSave => readMarshalStream(writeMarshalStream(save));

/** RPG Maker VX Scene_File#write_save_data order. */
function makeVxSave(): RgssSave {
  const actor = obj('Game_Actor', {
    '@actor_id': 1,
    '@name': makeString('Ralph'),
    '@class_id': 1,
    '@level': 5,
    '@exp': 1200,
    '@hp': 300,
    '@mp': 40,
    '@maxhp_plus': 0, '@maxmp_plus': 0, '@atk_plus': 1, '@def_plus': 2, '@spi_plus': 3, '@agi_plus': 4,
  });
  return [
    array(array(makeString('Actor1'), 0)), // characters
    1234, // frame count
    obj('RPG::BGM', { '@name': makeString('Field1') }),
    obj('RPG::BGS', { '@name': makeString('') }),
    obj('Game_System', { '@save_count': 3 }),
    obj('Game_Message', {}),
    obj('Game_Switches', { '@data': array(null, true, false) }),
    obj('Game_Variables', { '@data': array(null, 0, 25) }),
    obj('Game_SelfSwitches', { '@data': { kind: 'hash', entries: [], hasDefault: false } }),
    obj('Game_Actors', { '@data': array(null, actor) }),
    obj('Game_Party', {
      '@gold': 500, '@steps': 10, '@actors': array(1),
      '@items': intHash([[1, 5]]), '@weapons': intHash([]), '@armors': intHash([[2, 1]]),
    }),
    obj('Game_Troop', {}),
    obj('Game_Map', { '@map_id': 1, '@passages': table() }),
    obj('Game_Player', { '@x': 3, '@y': 4 }),
  ];
}

/** RPG Maker XP Scene_Save#write_save_data order; Game_Party holds actor copies. */
function makeXpSave(): RgssSave {
  const actor = () => obj('Game_Actor', {
    '@actor_id': 1,
    '@name': string('Aluxes'),
    '@class_id': 1,
    '@level': 8,
    '@exp': 2500,
    '@hp': 450,
    '@sp': 60,
    '@maxhp_plus': 0, '@maxsp_plus': 0, '@str_plus': 5, '@dex_plus': 0, '@agi_plus': 0, '@int_plus': 2,
  });
  return [
    array(array(string('001-Fighter01'), 0)), // characters
    5678, // frame count
    obj('Game_System', { '@save_count': 1 }),
    obj('Game_Switches', { '@data': array(null, false, true) }),
    obj('Game_Variables', { '@data': array(null, 99) }),
    obj('Game_SelfSwitches', { '@data': { kind: 'hash', entries: [], hasDefault: false } }),
    obj('Game_Screen', {}),
    obj('Game_Actors', { '@data': array(null, actor()) }),
    obj('Game_Party', {
      '@actors': array(actor()), // separate copy, replaced on load by $game_party.refresh
      '@gold': 1000, '@steps': 0,
      '@items': intHash([[1, 3]]), '@weapons': intHash([[1, 1]]), '@armors': intHash([]),
    }),
    obj('Game_Troop', {}),
    obj('Game_Map', { '@map_id': 1, '@passages': table() }),
    obj('Game_Player', { '@x': 9, '@y': 7 }),
  ];
}

describe('RPG Maker VX saves', () => {
  it('reads party, actors (total EXP, VX bonus params), switches and variables', () => {
    const save = makeVxSave();
    expect(vxEditor.getGold(save)).toBe(500);
    expect(vxEditor.getInventory(save, 'items')).toEqual({ 1: 5 });
    expect(vxEditor.getActors(save)).toEqual([{
      slot: 1, name: 'Ralph', hp: 300, mp: 40, tp: undefined, level: 5, exp: 1200,
      paramPlus: [0, 0, 1, 2, 3, 4],
      paramLabels: ['MaxHP', 'MaxMP', 'ATK', 'DEF', 'SPI', 'AGI'],
      statLabels: undefined,
    }]);
    expect(vxEditor.getSwitches(save)).toEqual([null, true, false]);
    expect(vxEditor.getVariables(save)).toEqual({ 0: null, 1: 0, 2: 25 });
  });

  it('edits survive a write/read cycle', () => {
    let save = vxEditor.setGold(makeVxSave(), 99999);
    save = vxEditor.setActorField(save, 1, 'exp', 5000);
    save = vxEditor.setActorField(save, 1, 'mp', 99);
    save = vxEditor.setActorParamPlus(save, 1, 4, 50); // SPI
    save = vxEditor.setInventoryCount(save, 'weapons', 3, 1);
    save = vxEditor.setSwitch(save, 2, true);
    const back = roundTrip(save);
    expect(vxEditor.getGold(back)).toBe(99999);
    expect(vxEditor.getActors(back)[0]).toMatchObject({ exp: 5000, mp: 99, paramPlus: [0, 0, 1, 2, 50, 4] });
    expect(getField(locateByClass(back, 'actors')!, '@data')).toBeDefined();
    expect(vxEditor.getInventory(back, 'weapons')).toEqual({ 3: 1 });
    expect(vxEditor.getSwitches(back)).toEqual([null, true, true]);
  });

  it('writes the 14 dumps back byte-for-byte when nothing changed', () => {
    const bytes = writeMarshalStream(makeVxSave());
    const dumps = readMarshalStream(bytes);
    expect(dumps).toHaveLength(14);
    expect(Buffer.from(writeMarshalStream(dumps)).equals(Buffer.from(bytes))).toBe(true);
  });

  it('has no TP', () => {
    expect(() => vxEditor.setActorField(makeVxSave(), 1, 'tp', 10)).toThrow(/no tp/);
  });
});

describe('RPG Maker XP saves', () => {
  it('reads SP and XP bonus params with their labels', () => {
    const [aluxes] = xpEditor.getActors(makeXpSave());
    expect(aluxes).toEqual({
      slot: 1, name: 'Aluxes', hp: 450, mp: 60, tp: undefined, level: 8, exp: 2500,
      paramPlus: [0, 0, 5, 0, 0, 2],
      paramLabels: ['MaxHP', 'MaxSP', 'STR', 'DEX', 'AGI', 'INT'],
      statLabels: { mp: 'SP' },
    });
  });

  it('decodes Ruby 1.8 strings without an encoding ivar', () => {
    expect(xpEditor.getActors(makeXpSave())[0].name).toBe('Aluxes');
  });

  it('edits Game_Actors (what Scene_Load keeps), not the party copies', () => {
    let save = xpEditor.setActorField(makeXpSave(), 1, 'mp', 999); // SP
    save = xpEditor.setActorParamPlus(save, 1, 2, 77); // STR
    const back = roundTrip(save);
    expect(xpEditor.getActors(back)[0]).toMatchObject({ mp: 999, paramPlus: [0, 0, 77, 0, 0, 2] });
    const actorFields = (getField(locateByClass(back, 'actors')!, '@data') as MArray).items[1];
    expect(getField(actorFields, '@sp')).toBe(999);
    const partyCopy = (getField(locateByClass(back, 'party')!, '@actors') as MArray).items[0];
    expect(getField(partyCopy, '@sp')).toBe(60);
  });

  it('edits gold, inventory, switches and variables', () => {
    let save = xpEditor.setGold(makeXpSave(), 1);
    save = xpEditor.setInventoryCount(save, 'items', 1, 0);
    save = xpEditor.setSwitch(save, 1, true);
    save = xpEditor.setVariable(save, 1, 100);
    const back = roundTrip(save);
    expect(xpEditor.getGold(back)).toBe(1);
    expect(xpEditor.getInventory(back, 'items')).toEqual({ 1: 0 });
    expect(xpEditor.getSwitches(back)).toEqual([null, true, true]);
    expect(xpEditor.getVariables(back)[1]).toBe(100);
  });

  it('writes the 12 dumps back byte-for-byte when nothing changed', () => {
    const bytes = writeMarshalStream(makeXpSave());
    const dumps = readMarshalStream(bytes);
    expect(dumps).toHaveLength(12);
    expect(Buffer.from(writeMarshalStream(dumps)).equals(Buffer.from(bytes))).toBe(true);
  });
});

describe('locateByClass', () => {
  it('finds objects even if a script adds extra dumps', () => {
    const save = makeVxSave();
    save.splice(5, 0, obj('Game_CustomScriptData', {}));
    expect(vxEditor.getGold(save)).toBe(500);
    expect(vxEditor.getActors(save)[0].name).toBe('Ralph');
  });
});
