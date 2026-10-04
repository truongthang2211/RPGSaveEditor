import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rgssTree as tree } from './tree';
import { fromDumps, materialize, RgssSave } from './patches';
import { readMarshalStream } from '../marshal/reader';
import { writeMarshalStream } from '../marshal/writer';
import { getField, getSymbolKey, makeString, symbol } from '../marshal/helpers';
import { MArray, MHash, MObject, MValue } from '../marshal/types';
import { TreeNode } from '../types';

const obj = (className: string, fields: Record<string, MValue>): MObject => ({
  kind: 'object',
  className: symbol(className),
  fields: Object.entries(fields).map(([name, value]) => [symbol(name), value]),
});
const array = (...items: MValue[]): MArray => ({ kind: 'array', items });
const symHash = (entries: Record<string, MValue>): MHash => ({
  kind: 'hash',
  entries: Object.entries(entries).map(([k, v]) => [symbol(k), v]),
  hasDefault: false,
});

/** Header + contents with a cycle (actor.@result.@battler -> actor) and a symbol-keyed hash. */
function makeSave(): RgssSave {
  const result = obj('Game_ActionResult', { '@battler': null });
  const actor = obj('Game_Actor', {
    '@name': makeString('Éric'),
    '@tp': { kind: 'float', text: '12.5' },
    '@level': 3,
    '@result': result,
  });
  (result.fields[0] as [unknown, MValue])[1] = actor;
  const contents = symHash({
    actors: obj('Game_Actors', { '@data': array(null, actor) }),
    party: obj('Game_Party', { '@gold': 50, '@items': { kind: 'hash', entries: [[1, 3]], hasDefault: false } }),
    story: symHash({ chapter: 2, title: makeString('Prologue') }),
  });
  return fromDumps([symHash({ playtime_s: makeString('0:01') }), 1234, contents]);
}

/** Follows keys from the roots, e.g. path(save, 'dump 2', ':party', '@gold'). */
function path(save: RgssSave, ...keys: string[]): TreeNode {
  let nodes = tree.roots(save);
  let found: TreeNode | undefined;
  for (const key of keys) {
    found = nodes.find((n) => n.key === key);
    if (!found) throw new Error(`No "${key}" among ${nodes.map((n) => n.key).join(', ')}`);
    nodes = found.hasChildren ? tree.children(save, found) : [];
  }
  return found!;
}

const reread = (save: RgssSave) => fromDumps(readMarshalStream(writeMarshalStream(materialize(save))));

describe('RGSS tree', () => {
  it('lists dumps, fields, array items and hash keys with types', () => {
    const save = makeSave();
    expect(tree.roots(save).map((n) => [n.key, n.type])).toEqual([['dump 0', 'Hash'], ['dump 1', 'Integer'], ['dump 2', 'Hash']]);
    expect(tree.children(save, path(save, 'dump 2')).map((n) => n.key)).toEqual([':actors', ':party', ':story']);
    expect(path(save, 'dump 2', ':party')).toMatchObject({ type: 'Game_Party', summary: '2 fields', hasChildren: true });
    expect(path(save, 'dump 2', ':party', '@items', '1')).toMatchObject({ type: 'Integer', value: 3, editable: 'number' });
    expect(path(save, 'dump 2', ':actors', '@data', '[1]', '@name')).toMatchObject({ type: 'String', value: 'Éric', editable: 'string' });
  });

  it('stops at cycles instead of expanding forever', () => {
    const save = makeSave();
    const battler = path(save, 'dump 2', ':actors', '@data', '[1]', '@result', '@battler');
    expect(battler).toMatchObject({ type: 'Game_Actor', hasChildren: false });
    expect(battler.summary).toMatch(/cycle/);
  });

  it('edits every kind of slot and survives a write/read cycle', () => {
    let save = makeSave();
    const original = save;
    save = tree.setValue(save, path(save, 'dump 1'), 9999); // top-level dump value
    save = tree.setValue(save, path(save, 'dump 2', ':party', '@gold'), 777); // object field
    save = tree.setValue(save, path(save, 'dump 2', ':party', '@items', '1'), 42); // Integer hash key
    save = tree.setValue(save, path(save, 'dump 2', ':story', ':chapter'), 5); // symbol-keyed hash entry
    save = tree.setValue(save, path(save, 'dump 2', ':story', ':title'), 'Chapter 5'); // string
    save = tree.setValue(save, path(save, 'dump 2', ':actors', '@data', '[1]', '@level'), 50); // inside an array item

    const back = reread(save);
    expect(path(back, 'dump 1').value).toBe(9999);
    expect(path(back, 'dump 2', ':party', '@gold').value).toBe(777);
    expect(path(back, 'dump 2', ':party', '@items', '1').value).toBe(42);
    expect(path(back, 'dump 2', ':story', ':chapter').value).toBe(5);
    expect(path(back, 'dump 2', ':story', ':title').value).toBe('Chapter 5');
    expect(path(back, 'dump 2', ':actors', '@data', '[1]', '@level').value).toBe(50);

    // The loaded save is untouched and still reports the old values.
    expect(path(original, 'dump 2', ':party', '@gold').value).toBe(50);
    expect(tree.valueOf(original, path(save, 'dump 2', ':party', '@gold'))).toBe(50);
    expect(tree.valueOf(save, path(save, 'dump 2', ':party', '@gold'))).toBe(777);
  });

  it('keeps Floats Float, string encodings and shared references', () => {
    let save = makeSave();
    save = tree.setValue(save, path(save, 'dump 2', ':actors', '@data', '[1]', '@tp'), 40);
    save = tree.setValue(save, path(save, 'dump 2', ':actors', '@data', '[1]', '@name'), 'Zoé');
    const contents = materialize(save)[2];
    const actor = (getField(getSymbolKey(contents, 'actors'), '@data') as MArray).items[1] as MObject;
    expect(getField(actor, '@tp')).toEqual({ kind: 'float', text: '40' });
    expect(getField(actor, '@name')).toMatchObject({ kind: 'string', ivars: [[{ name: 'E' }, true]] });
    const back = reread(save);
    const backActor = path(back, 'dump 2', ':actors', '@data', '[1]');
    const battlerParent = path(back, 'dump 2', ':actors', '@data', '[1]', '@result');
    expect(backActor.hasChildren && battlerParent.hasChildren).toBe(true);
    expect(path(back, 'dump 2', ':actors', '@data', '[1]', '@result', '@battler').summary).toMatch(/cycle/);
  });

  it('reads and edits Floats in the old "%.16g\\0mantissa" form (RGSS1/2)', () => {
    const save = fromDumps([array({ kind: 'float', text: '4.0499999999999998\x003' })]);
    const node = path(save, 'dump 0', '[0]');
    expect(node).toMatchObject({ type: 'Float', value: 4.05, editable: 'number' });
    const edited = tree.setValue(save, node, 2.5);
    expect((materialize(edited)[0] as MArray).items[0]).toEqual({ kind: 'float', text: '2.5' });
  });

  it('refuses to edit read-only values', () => {
    const save = makeSave();
    const result = path(save, 'dump 2', ':actors', '@data', '[1]', '@result');
    expect(result.editable).toBeUndefined();
    expect(() => tree.setValue(save, result, 1)).toThrow();
  });
});

const dir = join(process.cwd(), 'save_files');
const realSaves = existsSync(dir) ? readdirSync(dir).filter((f) => /\.(rvdata2|rvdata|rxdata)$/i.test(f)) : [];

describe.skipIf(realSaves.length === 0)('RGSS tree on real saves', () => {
  /** First editable Integer leaf found breadth-first, a few levels deep. */
  function findIntegerLeaf(save: RgssSave): TreeNode | undefined {
    let level = tree.roots(save);
    for (let depth = 0; depth < 6 && level.length; depth++) {
      const leaf = level.find((n) => n.editable === 'number' && typeof n.value === 'number' && depth >= 2);
      if (leaf) return leaf;
      level = level.filter((n) => n.hasChildren).slice(0, 40).flatMap((n) => tree.children(save, n));
    }
    return undefined;
  }

  it.each(realSaves)('%s: a deep tree edit round-trips and reverting restores the bytes', (file) => {
    const original = new Uint8Array(readFileSync(join(dir, file)));
    const save = fromDumps(readMarshalStream(original));
    const leaf = findIntegerLeaf(save);
    expect(leaf).toBeDefined();
    const before = leaf!.value as number;

    const edited = tree.setValue(save, leaf!, before + 1);
    expect(tree.valueOf(edited, leaf!)).toBe(before + 1);
    expect(tree.valueOf(save, leaf!)).toBe(before);

    const reverted = tree.setValue(edited, leaf!, before);
    expect(Buffer.from(writeMarshalStream(materialize(reverted))).equals(Buffer.from(original))).toBe(true);
  });
});
