import { Path, setIn } from '../immutable';
import { SaveTree, TreeNode, TreeValue } from '../types';
import { isRevived, revivedCode } from './diff';
import { SugarCubeSave } from './save';

interface Ref {
  path: Path;
  readOnly: boolean;
}

const getIn = (obj: any, path: Path): any => path.reduce((value, key) => value?.[key], obj);

/** Path of the variables the save loads: those of the current moment. */
export const variablesPath = (save: SugarCubeSave): Path => ['history', save.index, 'variables'];

/** "new Player($ReviveData$)" -> "Player". */
function className(code: string): string {
  return /^\s*\(?\s*new\s+([A-Za-z_$][\w$.]*)/.exec(code)?.[1] ?? 'Object';
}

/** A container's children as [shown key, path]; revived values show their data. */
function childEntries(value: any, path: Path): [string, Path][] {
  if (isRevived(value)) {
    const [tag, data] = value as [string, any];
    if (tag === '(revive:map)' && Array.isArray(data)) {
      return data.map((entry, i) => [String(Array.isArray(entry) ? entry[0] : i), [...path, 1, i, 1]]);
    }
    if (tag === '(revive:set)' && Array.isArray(data)) return data.map((_, i) => [`[${i}]`, [...path, 1, i]]);
    const revived = revivedCode(value);
    if (revived?.hasData) return childEntries(revived.data, [...path, 1, 1]);
    return [];
  }
  if (Array.isArray(value)) return value.map((_, i) => [`[${i}]`, [...path, i]]);
  if (value && typeof value === 'object') return Object.keys(value).map((key) => [key, [...path, key]]);
  return [];
}

function node(save: SugarCubeSave, key: string, path: Path, readOnly: boolean): TreeNode {
  const value = getIn(save, path);
  const base = { id: path.map(String).join('/'), key, ref: { path, readOnly } satisfies Ref };
  const edit = <E extends TreeNode['editable']>(kind: E) => (readOnly ? undefined : kind);

  if (value === null || value === undefined) return { ...base, type: 'null', value: null, hasChildren: false };
  if (typeof value === 'number') return { ...base, type: 'Number', value, editable: edit('number'), hasChildren: false };
  if (typeof value === 'string') return { ...base, type: 'String', value, editable: edit('string'), hasChildren: false };
  if (typeof value === 'boolean') return { ...base, type: 'Boolean', value, editable: edit('boolean'), hasChildren: false };

  if (isRevived(value)) {
    const [tag, data] = value as [string, any];
    const count = childEntries(value, path).length;
    if (tag === '(revive:map)') return { ...base, type: 'Map', summary: `Map(${count})`, hasChildren: count > 0 };
    if (tag === '(revive:set)') return { ...base, type: 'Set', summary: `Set(${count})`, hasChildren: count > 0 };
    if (tag === '(revive:date)') return { ...base, type: 'Date', summary: String(data), hasChildren: false };
    const revived = revivedCode(value);
    if (revived?.hasData && revived.data !== null && typeof revived.data === 'object') {
      return { ...base, type: className(revived.code), summary: `${count} keys`, hasChildren: count > 0 };
    }
    // undefined, Infinity, functions, regular expressions...
    return { ...base, type: 'Code', summary: revived?.code ?? tag, hasChildren: false };
  }

  const count = childEntries(value, path).length;
  if (Array.isArray(value)) return { ...base, type: 'Array', summary: `Array(${count})`, hasChildren: count > 0 };
  return { ...base, type: 'Object', summary: `${count} keys`, hasChildren: count > 0 };
}

/**
 * The variables the save loads (editable), the current passage, the earlier
 * passages and the save's details (read-only: the game only uses the current
 * moment's variables when it loads the save).
 */
export const sugarcubeTree: SaveTree<SugarCubeSave> = {
  roots: (save) => {
    const moment = save.history[save.index];
    const roots = [node(save, 'variables', variablesPath(save), false)];
    if (typeof moment?.title === 'string') roots.push(node(save, 'passage', ['history', save.index, 'title'], true));
    roots.push(node(save, 'history', ['history'], true));
    for (const key of Object.keys(save.raw)) {
      if (key !== 'state') roots.push(node(save, key, ['raw', key], true));
    }
    return roots;
  },
  children: (save, parent) => {
    const { path, readOnly } = parent.ref as Ref;
    return childEntries(getIn(save, path), path).map(([key, childPath]) => node(save, key, childPath, readOnly));
  },
  valueOf: (save, treeNode) => {
    const value = getIn(save, (treeNode.ref as Ref).path);
    return value === undefined || (value !== null && typeof value === 'object') ? undefined : (value as TreeValue);
  },
  setValue: (save, treeNode, value) => {
    const { path, readOnly } = treeNode.ref as Ref;
    const old = getIn(save, path);
    if (readOnly) throw new Error(`${path.join('.')} is read-only`);
    // Same JSON type only: never replace an object/array or null with a primitive.
    if (old === null || typeof old === 'object' || typeof old !== typeof value) {
      throw new Error(`Cannot set ${path.join('.')} (${old === null ? 'null' : typeof old}) to ${JSON.stringify(value)}`);
    }
    return setIn(save, path, value);
  },
};
