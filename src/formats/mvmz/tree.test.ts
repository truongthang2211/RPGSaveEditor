import { describe, expect, it } from 'vitest';
import { mvmzTree as tree } from './tree';
import { TreeNode } from '../types';

const makeSave = () => ({
  system: { '@': 'Game_System', _saveCount: 3, _versionId: 0 },
  party: { '@': 'Game_Party', _gold: 100, _items: { 1: 2 } },
  switches: { _data: { '@a': [null, true, false], '@c': 5 } },
  map: { _name: 'Town', _flag: null },
});

function path(save: any, ...keys: string[]): TreeNode {
  let nodes = tree.roots(save);
  let found: TreeNode | undefined;
  for (const key of keys) {
    found = nodes.find((n) => n.key === key);
    if (!found) throw new Error(`No "${key}" among ${nodes.map((n) => n.key).join(', ')}`);
    nodes = found.hasChildren ? tree.children(save, found) : [];
  }
  return found!;
}

describe('MV/MZ tree', () => {
  it('shows JsonEx class names, arrays and typed leaves', () => {
    const save = makeSave();
    expect(tree.roots(save).map((n) => [n.key, n.type])).toEqual([
      ['system', 'Game_System'], ['party', 'Game_Party'], ['switches', 'Object'], ['map', 'Object'],
    ]);
    expect(path(save, 'switches', '_data', '@a')).toMatchObject({ type: 'Array', summary: 'Array(3)' });
    expect(path(save, 'switches', '_data', '@a', '[1]')).toMatchObject({ type: 'Boolean', value: true, editable: 'boolean' });
    expect(path(save, 'map', '_name')).toMatchObject({ type: 'String', editable: 'string' });
    expect(path(save, 'map', '_flag')).toMatchObject({ type: 'null' });
    expect(path(save, 'map', '_flag').editable).toBeUndefined();
  });

  it('edits without mutating the save and reads values from another save', () => {
    const save = makeSave();
    let edited = tree.setValue(save, path(save, 'party', '_gold'), 999);
    edited = tree.setValue(edited, path(edited, 'switches', '_data', '@a', '[2]'), true);
    edited = tree.setValue(edited, path(edited, 'map', '_name'), 'Castle');
    expect(save.party._gold).toBe(100);
    expect(edited.party._gold).toBe(999);
    expect(edited.switches._data['@a']).toEqual([null, true, true]);
    expect(Array.isArray(edited.switches._data['@a'])).toBe(true);
    expect(tree.valueOf(save, path(edited, 'map', '_name'))).toBe('Town');
    expect(tree.valueOf(edited, path(edited, 'map', '_name'))).toBe('Castle');
  });

  it('refuses to change the type of a value', () => {
    const save = makeSave();
    expect(() => tree.setValue(save, path(save, 'party'), 1)).toThrow();
    expect(() => tree.setValue(save, path(save, 'party', '_gold'), 'many')).toThrow();
    expect(() => tree.setValue(save, path(save, 'map', '_flag'), true)).toThrow();
  });
});
