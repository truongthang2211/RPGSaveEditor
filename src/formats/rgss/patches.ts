import { MArray, MHash, MObject, MValue } from '../marshal/types';
import { arrayItems, getField, isNode, setArrayItem, setField, setIntKey } from '../marshal/helpers';

/**
 * An RGSS save being edited: the Marshal dumps as read (never mutated) plus
 * the edits as patches keyed by node identity.
 *
 * Patching a node instead of copying the path to it keeps shared and cyclic
 * references intact (e.g. VX Ace Game_ActionResult#@battler -> its actor) and
 * makes an edit O(1) instead of a deep copy of the whole save per keystroke.
 */
export interface RgssSave {
  dumps: MValue[];
  patches: Patches;
}

/** Per node: "f:@ivar" (object field), "i:3" (array index) or "k:20" (Integer hash key) -> value. */
export type Patches = ReadonlyMap<object, ReadonlyMap<string, MValue>>;

export const fromDumps = (dumps: MValue[]): RgssSave => ({ dumps, patches: new Map() });

const fieldKey = (name: string) => `f:${name}`;
const indexKey = (index: number) => `i:${index}`;
const hashKey = (key: number) => `k:${key}`;

function withPatch(save: RgssSave, node: object, key: string, value: MValue): RgssSave {
  const patches = new Map(save.patches);
  patches.set(node, new Map(save.patches.get(node)).set(key, value));
  return { dumps: save.dumps, patches };
}

export const patchField = (save: RgssSave, obj: MObject, name: string, value: MValue) =>
  withPatch(save, obj, fieldKey(name), value);
export const patchIndex = (save: RgssSave, array: MArray, index: number, value: MValue) =>
  withPatch(save, array, indexKey(index), value);
export const patchIntKey = (save: RgssSave, hash: MHash, key: number, value: MValue) =>
  withPatch(save, hash, hashKey(key), value);

/** Reads the save as if the patches were applied. */
export class PatchedView {
  constructor(private readonly patches: Patches) {}

  private patched(node: unknown, key: string): { value: MValue } | undefined {
    const overrides = node && typeof node === 'object' ? this.patches.get(node) : undefined;
    return overrides?.has(key) ? { value: overrides.get(key)! } : undefined;
  }

  field(obj: MValue | undefined, name: string): MValue | undefined {
    if (!isNode(obj, 'object')) return undefined;
    const patched = this.patched(obj, fieldKey(name));
    return patched ? patched.value : getField(obj, name);
  }

  /** Array items with patched indices applied (including ones past the end, padded with nil). */
  items(array: MValue | undefined): MValue[] {
    const base = arrayItems(array);
    const overrides = isNode(array, 'array') ? this.patches.get(array) : undefined;
    if (!overrides) return base;
    const items = [...base];
    for (const [key, value] of overrides) {
      const index = Number(key.slice(2));
      while (items.length < index) items.push(null);
      items[index] = value;
    }
    return items;
  }

  /** Integer-keyed entries with patched keys applied (new keys appended). */
  intEntries(hash: MValue | undefined): [number, MValue][] {
    if (!isNode(hash, 'hash')) return [];
    const overrides = this.patches.get(hash);
    const entries: [number, MValue][] = [];
    for (const [key, value] of hash.entries) {
      if (typeof key !== 'number') continue;
      const patched = overrides?.has(hashKey(key));
      entries.push([key, patched ? overrides!.get(hashKey(key))! : value]);
    }
    for (const [key, value] of overrides ?? []) {
      const id = Number(key.slice(2));
      if (!hash.entries.some(([k]) => k === id)) entries.push([id, value]);
    }
    return entries;
  }

  intKey(hash: MValue | undefined, key: number): MValue | undefined {
    return this.intEntries(hash).find(([k]) => k === key)?.[1];
  }
}

/**
 * The dumps with all patches applied, for writing. Works on one
 * structuredClone of dumps + patches (which keeps node identities consistent
 * between them), so the save being edited is never mutated.
 */
export function materialize(save: RgssSave): MValue[] {
  if (save.patches.size === 0) return save.dumps;
  const { dumps, patches } = structuredClone({ dumps: save.dumps, patches: save.patches as Map<object, Map<string, MValue>> });
  for (const [node, overrides] of patches) {
    for (const [key, value] of overrides) {
      const kind = key[0];
      const rest = key.slice(2);
      if (kind === 'f' && isNode(node as MValue, 'object')) setField(node as MObject, rest, value);
      else if (kind === 'i' && isNode(node as MValue, 'array')) setArrayItem(node as MArray, Number(rest), value);
      else if (kind === 'k' && isNode(node as MValue, 'hash')) setIntKey(node as MHash, Number(rest), value);
    }
  }
  return dumps;
}
