import { describe, expect, it } from 'vitest';
import { mvmzEditor as editor } from './editor';

/** MV 1.x JsonEx: arrays wrapped in { "@a": [...], "@c": n }. */
const mvSave = () => ({
  party: { _gold: 100, _items: { 1: 2 }, _weapons: { 3: 1 }, _armors: {}, '@c': 1 },
  actors: {
    _data: {
      '@a': [
        null,
        { _name: 'Reid', _classId: 1, _hp: 50, _mp: 10, _tp: 0, _level: 3, _exp: { 1: 120 }, _paramPlus: { '@a': [0, 0, 0, 0, 0, 0, 0, 0], '@c': 4 } },
        null,
        { _name: 'Priscilla', _classId: 2, _hp: 40, _mp: 30, _level: 5, _exp: { 1: 5, 2: 300 }, _paramPlus: { '@a': [1, 2, 3, 4, 5, 6, 7, 8] } },
      ],
      '@c': 3,
    },
  },
  switches: { _data: { '@a': [null, false, true], '@c': 6 } },
  variables: { _data: { '@a': [null, 7, 'text'], '@c': 7 } },
});

/** MZ JsonEx: plain arrays. */
const mzSave = () => ({
  party: { _gold: 100, _items: { 1: 2 }, _weapons: { 3: 1 }, _armors: {} },
  actors: {
    _data: [
      null,
      { _name: 'Reid', _classId: 1, _hp: 50, _mp: 10, _tp: 0, _level: 3, _exp: { 1: 120 }, _paramPlus: [0, 0, 0, 0, 0, 0, 0, 0] },
      null,
      { _name: 'Priscilla', _classId: 2, _hp: 40, _mp: 30, _level: 5, _exp: { 1: 5, 2: 300 }, _paramPlus: [1, 2, 3, 4, 5, 6, 7, 8] },
    ],
  },
  switches: { _data: [null, false, true] },
  variables: { _data: [null, 7, 'text'] },
});

describe.each([
  ['MV', mvSave],
  ['MZ', mzSave],
])('%s save', (_name, make) => {
  it('reads gold and inventories', () => {
    const save = make();
    expect(editor.getGold(save)).toBe(100);
    expect(editor.getInventory(save, 'items')).toEqual({ 1: 2 });
    expect(editor.getInventory(save, 'weapons')).toEqual({ 3: 1 });
    expect(editor.getInventory(save, 'armors')).toEqual({});
  });

  it('edits gold and inventory without mutating the input', () => {
    const save = make();
    const snapshot = JSON.stringify(save);
    const updated = editor.setInventoryCount(editor.setGold(save, 999), 'items', 5, 3);
    expect(editor.getGold(updated)).toBe(999);
    expect(editor.getInventory(updated, 'items')).toEqual({ 1: 2, 5: 3 });
    expect(JSON.stringify(save)).toBe(snapshot);
  });

  it('lists actors with their real slot, skipping empty slots', () => {
    const actors = editor.getActors(make());
    expect(actors.map((a) => [a.slot, a.name])).toEqual([[1, 'Reid'], [3, 'Priscilla']]);
    expect(actors[1]).toMatchObject({ hp: 40, mp: 30, level: 5, exp: 300, paramPlus: [1, 2, 3, 4, 5, 6, 7, 8] });
  });

  it('edits the right actor, EXP of its current class, and bonus params', () => {
    const save = make();
    let updated = editor.setActorField(save, 3, 'hp', 99);
    updated = editor.setActorField(updated, 3, 'exp', 1000);
    updated = editor.setActorParamPlus(updated, 3, 2, 50);
    const [reid, priscilla] = editor.getActors(updated);
    expect(reid).toMatchObject({ hp: 50, exp: 120 });
    expect(priscilla).toMatchObject({ hp: 99, exp: 1000, paramPlus: [1, 2, 50, 4, 5, 6, 7, 8] });
    expect(editor.getActors(save)[1].hp).toBe(40);
  });

  it('reads and toggles switches', () => {
    const save = make();
    expect(editor.getSwitches(save)).toEqual([null, false, true]);
    const updated = editor.setSwitch(save, 1, true);
    expect(editor.getSwitches(updated)).toEqual([null, true, true]);
    expect(editor.getSwitches(save)[1]).toBe(false);
  });

  it('reads and edits variables, keeping them an array', () => {
    const save = make();
    expect(editor.getVariables(save)).toEqual({ 0: null, 1: 7, 2: 'text' });
    const updated = editor.setVariable(save, 4, 42);
    expect(editor.getVariables(updated)[4]).toBe(42);
    expect(editor.getVariables(updated)[2]).toBe('text');
  });
});

describe('save shape is preserved', () => {
  it('keeps MV "@a"/"@c" wrappers', () => {
    let save: any = mvSave();
    save = editor.setSwitch(save, 1, true);
    save = editor.setVariable(save, 1, 8);
    save = editor.setActorParamPlus(save, 1, 0, 5);
    expect(save.switches._data).toEqual({ '@a': [null, true, true], '@c': 6 });
    expect(save.variables._data['@c']).toBe(7);
    expect(Array.isArray(save.variables._data['@a'])).toBe(true);
    expect(save.actors._data['@c']).toBe(3);
    expect(save.actors._data['@a'][1]._paramPlus).toEqual({ '@a': [5, 0, 0, 0, 0, 0, 0, 0], '@c': 4 });
  });

  it('keeps MZ plain arrays (no "@a" added)', () => {
    let save: any = mzSave();
    save = editor.setSwitch(save, 1, true);
    save = editor.setVariable(save, 1, 8);
    save = editor.setActorParamPlus(save, 1, 0, 5);
    expect(save.switches._data).toEqual([null, true, true]);
    expect(Array.isArray(save.variables._data)).toBe(true);
    expect(save.actors._data[1]._paramPlus).toEqual([5, 0, 0, 0, 0, 0, 0, 0]);
    expect(JSON.stringify(save)).not.toContain('@a');
  });

  it('writes object-style variables back as an object', () => {
    const save = { variables: { _data: { 1: 3 } } };
    expect(editor.setVariable(save, 2, 4).variables._data).toEqual({ 1: 3, 2: 4 });
  });
});
