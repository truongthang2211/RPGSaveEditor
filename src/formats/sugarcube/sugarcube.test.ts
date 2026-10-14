import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import LZString from 'lz-string';
import { deltaDecode, diff, patch } from './diff';
import { isSugarCubeSave, parseSugarCubeSave, serializeSugarCubeSave, SugarCubeSave } from './save';
import { sugarcubeFormat, sugarcubeGameName } from './index';
import { sugarcubeTree } from './tree';
import { TreeNode } from '../types';

const dir = join(__dirname, '__fixtures__');
// Written by SugarCube's own Diff/Serial code (scripts/sugarcube_fixtures.mjs).
const fixture = readFileSync(join(dir, 'Demo Story-20261014-120000.save'), 'utf8');
// What SugarCube decodes from it (same script, "check").
const expected = JSON.parse(readFileSync(join(dir, 'expected.json'), 'utf8'));

const named = (save: SugarCubeSave) => new Map(sugarcubeFormat.namedVariables!(save).map((v) => [v.name, v.node]));
const set = (save: SugarCubeSave, name: string, value: any) => sugarcubeTree.setValue(save, named(save).get(name)!, value);
const valueOf = (save: SugarCubeSave, name: string) => named(save).get(name)?.value;
const rawState = (text: string) => JSON.parse(LZString.decompressFromBase64(text)!).state;

/** Follows keys from the roots, e.g. path(save, 'variables', 'flags', 'beach'). */
function path(save: SugarCubeSave, ...keys: string[]): TreeNode {
  let nodes = sugarcubeTree.roots(save);
  let found: TreeNode | undefined;
  for (const key of keys) {
    found = nodes.find((n) => n.key === key);
    if (!found) throw new Error(`No "${key}" among ${nodes.map((n) => n.key).join(', ')}`);
    nodes = found.hasChildren ? sugarcubeTree.children(save, found) : [];
  }
  return found!;
}

describe('SugarCube saves', () => {
  it('decodes the delta encoded history exactly like SugarCube', () => {
    const save = parseSugarCubeSave(fixture);
    expect(save.delta).toBe(true);
    expect(save.index).toBe(expected.index);
    // SugarCube revives `undefined` values, which drops them from the objects it reads.
    const revivedUndefined = (_: string, value: unknown) =>
      JSON.stringify(value) === '["(revive:)",["undefined"]]' ? undefined : value;
    const asLoaded = (value: unknown) => JSON.parse(JSON.stringify(value), revivedUndefined);
    expect(asLoaded(save.history.map((m) => ({ title: m.title, variables: m.variables })))).toEqual(expected.moments);
  });

  it('lists story variables and the fields of objects stored in them', () => {
    const save = parseSugarCubeSave(fixture);
    expect([...named(save).keys()]).toEqual([
      '$gold', '$name', '$metLily', '$flags.beach', '$flags.library', '$player.money', '$player.hp',
      '$stats.charm', '$stats.fitness', '$route',
    ]);
    expect(valueOf(save, '$gold')).toBe(35);
    expect(valueOf(save, '$player.money')).toBe(50);
    expect(named(save).get('$gold')).toMatchObject({ type: 'Number', editable: 'number' });
  });

  it('shows Maps, Sets, Dates and class instances by their type', () => {
    const save = parseSugarCubeSave(fixture);
    expect(path(save, 'variables', 'flags')).toMatchObject({ type: 'Map', summary: 'Map(2)' });
    expect(path(save, 'variables', 'seen')).toMatchObject({ type: 'Set', summary: 'Set(1)' });
    expect(path(save, 'variables', 'started')).toMatchObject({ type: 'Date', summary: '2026-01-02T03:04:05.000Z', hasChildren: false });
    expect(path(save, 'variables', 'player')).toMatchObject({ type: 'Player', summary: '2 keys' });
    expect(path(save, 'variables', 'nothing')).toMatchObject({ type: 'Code', summary: 'undefined' });
    expect(path(save, 'passage')).toMatchObject({ value: 'Cafe', editable: undefined });
  });

  it('writes the file back unchanged when nothing was edited', () => {
    const save = parseSugarCubeSave(fixture);
    expect(serializeSugarCubeSave(save)).toBe(fixture);
    // Putting a value back counts as unchanged too.
    expect(serializeSugarCubeSave(set(set(save, '$gold', 99), '$gold', 35))).toBe(fixture);
  });

  it('re-encodes only the edited moment and keeps the other entries', () => {
    const save = parseSugarCubeSave(fixture);
    const edited = set(set(set(save, '$gold', 99999), '$player.money', 1000), '$flags.beach', false);
    const text = serializeSugarCubeSave(edited);

    const back = parseSugarCubeSave(text);
    expect(valueOf(back, '$gold')).toBe(99999);
    expect(valueOf(back, '$player.money')).toBe(1000);
    expect(valueOf(back, '$player.hp')).toBe(7);
    expect(valueOf(back, '$flags.beach')).toBe(false);
    expect(back.history.slice(0, 2)).toEqual(save.history.slice(0, 2));

    const before = rawState(fixture);
    const after = rawState(text);
    expect(after.delta.slice(0, 2)).toEqual(before.delta.slice(0, 2));
    expect(after.index).toBe(before.index);
    // A revived value is copied whole, which SugarCube accepts for any value.
    expect(after.delta[2].variables.player).toEqual([2, ['(revive:)', ['new Player($ReviveData$)', { money: 1000, hp: 7 }]]]);
  });

  it('keeps saves without deltas without deltas', () => {
    const history = [{ title: 'Start', variables: { gold: 1 } }];
    const text = LZString.compressToBase64(JSON.stringify({ id: 'x', state: { history, index: 0 } }));
    const save = parseSugarCubeSave(text);
    expect(save.delta).toBe(false);
    const after = rawState(serializeSugarCubeSave(set(save, '$gold', 5)));
    expect(after.history[0].variables.gold).toBe(5);
    expect(after.delta).toBeUndefined();
  });

  it('only edits the variables the save loads', () => {
    const save = parseSugarCubeSave(fixture);
    expect(path(save, 'history', '[0]', 'variables', 'gold').editable).toBeUndefined();
    expect(() => sugarcubeTree.setValue(save, path(save, 'history', '[0]', 'variables', 'gold'), 1)).toThrow(/read-only/);
    expect(() => sugarcubeTree.setValue(save, path(save, 'id'), 'other')).toThrow(/read-only/);
    expect(() => sugarcubeTree.setValue(save, path(save, 'variables', 'gold'), 'text')).toThrow();
  });

  it('tells SugarCube saves from Ren\'Py saves and other files', () => {
    expect(isSugarCubeSave(new TextEncoder().encode(fixture))).toBe(true);
    const renpy = new Uint8Array(readFileSync(join(__dirname, '..', 'renpy', '__fixtures__', '1-1-LT1.save')));
    expect(isSugarCubeSave(renpy)).toBe(false);
    expect(isSugarCubeSave(new TextEncoder().encode('hello'))).toBe(false);
    expect(() => parseSugarCubeSave('hello')).toThrow(/Not a SugarCube save/);
  });

  it('gets the game name from the file name', () => {
    expect(sugarcubeGameName('C:\\Users\\me\\Downloads\\Demo Story-20261014-120000.save')).toBe('Demo Story');
    expect(sugarcubeGameName('/home/me/Demo Story-20261014-120000 (1).save')).toBe('Demo Story');
    expect(sugarcubeGameName('my-save.save')).toBe('my-save');
  });
});

describe('SugarCube delta encoding', () => {
  const cases: [string, any, any][] = [
    ['changed and added values', { a: 1, b: 'x' }, { a: 2, b: 'x', c: true }],
    ['deleted keys', { a: 1, b: 2 }, { a: 1 }],
    ['shrunk arrays', { list: [1, 2, 3, 4] }, { list: [1, 4] }],
    ['grown arrays', { list: [1] }, { list: [1, 2, 3] }],
    ['nested objects', { o: { p: { q: 1 } } }, { o: { p: { q: 2, r: [1] } } }],
    ['type changes', { a: [1], b: { c: 1 }, d: null }, { a: { 0: 1 }, b: 'text', d: { e: 1 } }],
    ['revived values', { m: ['(revive:map)', [['k', 1]]] }, { m: ['(revive:map)', [['k', 2]]] }],
  ];

  it.each(cases)('patch(a, diff(a, b)) gives b: %s', (_, a, b) => {
    expect(patch(a, diff(a, b))).toEqual(b);
    expect(diff(a, a)).toBeNull();
  });

  it('copies revived values whole instead of diffing their arrays', () => {
    expect(diff({ m: ['(revive:map)', [['k', 1]]] }, { m: ['(revive:map)', [['k', 2]]] })).toEqual({
      m: [2, ['(revive:map)', [['k', 2]]]],
    });
  });

  it('applies a nested delta to the data of a revived class instance', () => {
    const player = ['(revive:)', ['new Player($ReviveData$)', { money: 5, hp: 10 }]];
    expect(patch({ player } as any, { player: { money: [2, 50] } })).toEqual({
      player: ['(revive:)', ['new Player($ReviveData$)', { money: 50, hp: 10 }]],
    });
  });

  it('decodes a history', () => {
    const history: any[] = [{ v: { a: 1 } }, { v: { a: 2 } }, { v: { a: 2, b: 3 } }];
    const delta = history.map((m, i) => (i === 0 ? m : diff(history[i - 1], m)));
    expect(deltaDecode(delta)).toEqual(history);
  });
});
