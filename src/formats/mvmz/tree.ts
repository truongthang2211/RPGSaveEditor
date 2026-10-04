import { SaveTree, TreeNode, TreeValue } from '../types';
import { Path, setIn } from '../immutable';
import { MvMzSave } from './codec';

const getIn = (obj: any, path: Path): any => path.reduce((value, key) => value?.[key], obj);

const segment = (key: string | number) => (typeof key === 'number' ? `[${key}]` : key);

function node(save: MvMzSave, path: Path): TreeNode {
  const key = path[path.length - 1];
  const value = getIn(save, path);
  const base = { id: path.map(String).join('/'), key: segment(key), ref: path };

  if (value === null || value === undefined) return { ...base, type: 'null', value: null, hasChildren: false };
  if (typeof value === 'number') return { ...base, type: 'Number', value, editable: 'number', hasChildren: false };
  if (typeof value === 'string') return { ...base, type: 'String', value, editable: 'string', hasChildren: false };
  if (typeof value === 'boolean') return { ...base, type: 'Boolean', value, editable: 'boolean', hasChildren: false };
  if (Array.isArray(value)) return { ...base, type: 'Array', summary: `Array(${value.length})`, hasChildren: value.length > 0 };
  const keys = Object.keys(value);
  // JsonEx stores the class name in "@" (e.g. "Game_Party").
  return { ...base, type: typeof value['@'] === 'string' ? value['@'] : 'Object', summary: `${keys.length} keys`, hasChildren: keys.length > 0 };
}

function childKeys(value: any): (string | number)[] {
  if (Array.isArray(value)) return value.map((_, index) => index);
  if (value && typeof value === 'object') return Object.keys(value);
  return [];
}

/** Raw JSON tree of an MV/MZ save. */
export const mvmzTree: SaveTree<MvMzSave> = {
  roots: (save) => childKeys(save).map((key) => node(save, [key])),
  children: (save, parent) => {
    const path = parent.ref as Path;
    return childKeys(getIn(save, path)).map((key) => node(save, [...path, key]));
  },
  valueOf: (save, treeNode) => {
    const value = getIn(save, treeNode.ref as Path);
    return value === undefined || (value !== null && typeof value === 'object') ? undefined : (value as TreeValue);
  },
  setValue: (save, treeNode, value) => {
    const path = treeNode.ref as Path;
    const old = getIn(save, path);
    // Same JSON type only: never replace an object/array or null with a primitive.
    if (old === null || typeof old === 'object' || typeof old !== typeof value) {
      throw new Error(`Cannot set ${path.join('.')} (${old === null ? 'null' : typeof old}) to ${JSON.stringify(value)}`);
    }
    return setIn(save, path, value);
  },
};
