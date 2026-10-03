import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mvmzTree } from '../../formats/mvmz/tree';
import { rgssTree } from '../../formats/rgss/tree';
import { fromDumps } from '../../formats/rgss/patches';
import { readMarshalStream } from '../../formats/marshal/reader';
import { symbol } from '../../formats/marshal/helpers';
import { MArray, MObject, MValue } from '../../formats/marshal/types';
import { refine, searchAll, SearchSpec, TreeSearch } from './searchEngine';
import { parseQuery } from './query';
import { TreeNode } from '../../formats';

const mvSave = () => ({
  party: { '@': 'Game_Party', _gold: 1500, _items: { 1: 3, 2: 99 } },
  actors: { _data: { '@a': [null, { _name: 'Reid', _hp: 400, _level: 5 }, { _name: 'Lona', _hp: 90, _level: 2 }] } },
  variables: { _data: { '@a': [null, 7, 120, 'text'] } },
});

const spec = (over: Partial<SearchSpec> & { query?: string }): SearchSpec => ({
  tree: mvmzTree,
  save: mvSave(),
  terms: parseQuery(over.query ?? ''),
  compare: 'none',
  editableOnly: false,
  ...over,
});
const keysOf = (results: { chain: TreeNode[] }[]) => results.map((r) => r.chain.map((n) => n.key).join('.'));

describe('tree search', () => {
  it('finds matches anywhere, with their full path', () => {
    expect(keysOf(searchAll(spec({ query: '_hp' })))).toEqual(['actors._data.@a.[1]._hp', 'actors._data.@a.[2]._hp']);
    expect(keysOf(searchAll(spec({ query: 'key:_hp >100' })))).toEqual(['actors._data.@a.[1]._hp']);
    expect(keysOf(searchAll(spec({ query: '"Lona"' })))).toEqual(['actors._data.@a.[2]._name']);
    expect(keysOf(searchAll(spec({ query: 'party.*' })))).toEqual(['party.@', 'party._gold', 'party._items']); // "@" holds the JsonEx class name
  });

  it('searches inside a scope only', () => {
    const save = mvSave();
    const [actors] = searchAll(spec({ save, query: '"actors"' }));
    const results = searchAll(spec({ save, query: '_level', scope: actors }));
    expect(keysOf(results)).toEqual(['actors._data.@a.[1]._level', 'actors._data.@a.[2]._level']);
  });

  it('filters editable values only', () => {
    const results = searchAll(spec({ query: 'actors.**', editableOnly: true }));
    expect(results.every((r) => r.chain[r.chain.length - 1].editable)).toBe(true);
    expect(results.length).toBe(6); // name, hp, level x2
  });

  it('runs in steps and stops at the result limit', () => {
    const search = new TreeSearch(spec({ query: '_', maxResults: 3 }));
    let steps = 0;
    while (!search.step(2)) steps++;
    expect(steps).toBeGreaterThan(1);
    expect(search.results).toHaveLength(3);
    expect(search.hitResultLimit).toBe(true);
  });

  it('compares with the previous save: changed / increased / decreased / unchanged', () => {
    const old = mvSave();
    const save = mvSave();
    save.party._gold = 1600;
    save.actors._data['@a'][2]!._hp = 80;
    save.variables._data['@a'][2] = 125;
    const run = (compare: SearchSpec['compare'], query = '') => keysOf(searchAll(spec({ save, old, compare, query })));
    expect(run('changed')).toEqual(['party._gold', 'variables._data.@a.[2]', 'actors._data.@a.[2]._hp']);
    expect(run('increased')).toEqual(['party._gold', 'variables._data.@a.[2]']);
    expect(run('decreased')).toEqual(['actors._data.@a.[2]._hp']);
    expect(run('changed', 'old:120 =125')).toEqual(['variables._data.@a.[2]']);
    expect(run('unchanged', '_level')).toEqual(['actors._data.@a.[1]._level', 'actors._data.@a.[2]._level']);
    expect(searchAll(spec({ save, old, compare: 'changed', query: 'gold' }))[0].oldValue).toBe(1500);
  });

  it('refines previous results against a newer save (Cheat Engine style)', () => {
    const first = mvSave();
    const second = mvSave();
    second.variables._data['@a'][2] = 125; // the value we are looking for went 120 -> 125
    second.party._gold = 1500;
    const third = mvSave();
    third.variables._data['@a'][2] = 130;

    // Values equal to 120 in the first save...
    const candidates = searchAll(spec({ save: first, query: '=120' }));
    expect(candidates.length).toBe(1);
    // ...that changed in the next save, then increased again.
    const afterSecond = refine(spec({ save: second, old: first, compare: 'changed' }), candidates);
    expect(keysOf(afterSecond)).toEqual(['variables._data.@a.[2]']);
    const afterThird = refine(spec({ save: third, old: second, compare: 'increased' }), afterSecond);
    expect(afterThird[0].oldValue).toBe(125);
    expect(afterThird[0].chain[afterThird[0].chain.length - 1].value).toBe(130);
  });
});

describe('tree search on RGSS data', () => {
  const obj = (fields: Record<string, MValue>): MObject => ({
    kind: 'object',
    className: symbol('Thing'),
    fields: Object.entries(fields).map(([name, value]) => [symbol(name), value]),
  });

  it('walks a shared object once (no duplicate work or results)', () => {
    const shared = obj({ '@secret': 42 });
    const holders: MArray = { kind: 'array', items: Array.from({ length: 50 }, () => obj({ '@ref': shared })) };
    const results = searchAll({ tree: rgssTree, save: fromDumps([holders]), terms: parseQuery('@secret'), compare: 'none', editableOnly: false });
    expect(results).toHaveLength(1);
  });

  const file = join(process.cwd(), 'save_files', 'Save02.rvdata2');
  it.skipIf(!existsSync(file))('searches a whole real save (beyond the old 60k-value cap) and finds a changed value', () => {
    const old = fromDumps(readMarshalStream(new Uint8Array(readFileSync(file))));
    const all = new TreeSearch({ tree: rgssTree, save: old, terms: parseQuery('zzz_no_such_key'), compare: 'none', editableOnly: false });
    while (!all.step(20_000));
    expect(all.visited).toBeGreaterThan(60_000);

    const [gold] = searchAll({ tree: rgssTree, save: old, terms: parseQuery('party.@gold'), compare: 'none', editableOnly: false });
    const save = rgssTree.setValue(old, gold.chain[gold.chain.length - 1], 4242);
    const changed = searchAll({ tree: rgssTree, save, old, terms: [], compare: 'changed', editableOnly: false });
    expect(keysOf(changed)).toEqual(['dump 1.:party.@gold']);
    expect(changed[0].oldValue).toBe(0);
  });
});

describe('refining large saves', () => {
  it('lists each container once per save, however many results it holds', () => {
    const big = { list: Array.from({ length: 20_000 }, (_, i) => ({ id: i, v: i % 7 })) };
    let calls = 0;
    const counting = { ...mvmzTree, children: (save: any, node: TreeNode) => { calls++; return mvmzTree.children(save, node); } };
    const base = { tree: counting, save: big, compare: 'none' as const, editableOnly: false };
    const results = searchAll({ ...base, terms: parseQuery('key:v =3'), maxResults: 300 });
    expect(results).toHaveLength(300);

    calls = 0;
    const kept = refine({ ...base, terms: parseQuery('=3') }, results);
    expect(kept).toHaveLength(300);
    // list (1) + each of the 300 items (1 each); not 300 x 20,000-entry list rebuilds.
    expect(calls).toBeLessThanOrEqual(301);
  });
});
