import { describe, expect, it } from 'vitest';
import { mvmzTree } from '../../formats/mvmz/tree';
import { rgssTree } from '../../formats/rgss/tree';
import { fromDumps } from '../../formats/rgss/patches';
import { symbol } from '../../formats/marshal/helpers';
import { MObject, MValue } from '../../formats/marshal/types';
import { GameDatabase, SaveTree } from '../../formats';
import { withNames } from './names';
import { searchAll } from './searchEngine';
import { parseQuery } from './query';

const database: GameDatabase = {
  items: [null, { id: 1, name: 'Potion' }, { id: 2, name: 'Hi Potion' }],
  weapons: [null, { id: 1, name: 'Short Sword' }],
  armors: null,
  system: { switches: [null, 'Met the king', ''], variables: [null, 'Gold earned'] } as GameDatabase['system'],
};

const found = (tree: SaveTree, save: unknown, query: string) =>
  searchAll({ tree, save, terms: parseQuery(query), compare: 'none', editableOnly: false }).map((r) =>
    r.chain.map((n) => (n.label ? `${n.key}(${n.label})` : n.key)).join(' > '),
  );

describe('database names in the Advanced tree', () => {
  it('MV: names items, weapons, switches and variables (also inside JsonEx "@a" arrays)', () => {
    const save = {
      party: { '@': 'Game_Party', _items: { 1: 3, 2: 1 }, _weapons: { 1: 1 } },
      switches: { '@': 'Game_Switches', _data: { '@a': [null, true, false] } },
      variables: { '@': 'Game_Variables', _data: { '@a': [null, 500] } },
      other: { _items: { 1: 9 } }, // not a Game_Party: not named
    };
    const tree = withNames(mvmzTree, database);
    expect(found(tree, save, 'potion')).toEqual(['party > _items > 1(Potion)', 'party > _items > 2(Hi Potion)']);
    expect(found(tree, save, 'name:"Hi Potion"')).toEqual(['party > _items > 2(Hi Potion)']);
    expect(found(tree, save, 'name:sword')).toEqual(['party > _weapons > 1(Short Sword)']);
    expect(found(tree, save, 'name:king')).toEqual(['switches > _data > @a > [1](Met the king)']);
    expect(found(tree, save, 'name:gold >100')).toEqual(['variables > _data > @a > [1](Gold earned)']);
  });

  it('MZ: plain arrays', () => {
    const save = { switches: { '@': 'Game_Switches', _data: [null, true] } };
    expect(found(withNames(mvmzTree, database), save, 'king')).toEqual(['switches > _data > [1](Met the king)']);
  });

  it('XP/VX/VX Ace: class names and Integer hash keys', () => {
    const obj = (className: string, fields: Record<string, MValue>): MObject => ({
      kind: 'object',
      className: symbol(className),
      fields: Object.entries(fields).map(([name, value]) => [symbol(name), value]),
    });
    const party = obj('Game_Party', { '@items': { kind: 'hash', entries: [[2, 5]], hasDefault: false } });
    const save = fromDumps([party]);
    expect(found(withNames(rgssTree, database), save, 'name:hi')).toEqual(['dump 0 > @items > 2(Hi Potion)']);
  });

  it('leaves the tree as is without a database', () => {
    expect(withNames(mvmzTree, null)).toBe(mvmzTree);
  });
});
