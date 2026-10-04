import { MArray, MHash, MObject, MStruct, MValue } from '../marshal/types';
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

/**
 * Per node -> value, by slot:
 * "f:@ivar" object field, "i:3" array index, "k:20" Integer hash key,
 * "e:2" value of the 3rd hash entry (non-Integer keys, e.g. symbols),
 * "m:1" Struct member, "d:4" a whole dump (keyed on the dumps array).
 */
export type Patches = ReadonlyMap<object, ReadonlyMap<string, MValue>>;

export const fromDumps = (dumps: MValue[]): RgssSave => ({ dumps, patches: new Map() });

const fieldKey = (name: string) => `f:${name}`;
const indexKey = (index: number) => `i:${index}`;
const hashKey = (key: number) => `k:${key}`;
const entryKey = (index: number) => `e:${index}`;
const memberKey = (index: number) => `m:${index}`;
const dumpKey = (index: number) => `d:${index}`;

/** Overrides of one kind ("i", "k", ...) for a node, as [number, value]. */
function overridesOf(patches: Patches, node: object, kind: string): [number, MValue][] {
  const overrides = patches.get(node);
  if (!overrides) return [];
  const result: [number, MValue][] = [];
  for (const [key, value] of overrides) {
    if (key[0] === kind) result.push([Number(key.slice(2)), value]);
  }
  return result;
}

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
export const patchEntry = (save: RgssSave, hash: MHash, index: number, value: MValue) =>
  withPatch(save, hash, entryKey(index), value);
export const patchMember = (save: RgssSave, struct: MStruct, index: number, value: MValue) =>
  withPatch(save, struct, memberKey(index), value);
export const patchDump = (save: RgssSave, index: number, value: MValue) =>
  withPatch(save, save.dumps, dumpKey(index), value);

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

  /** Field names, including fields added by patches. */
  fieldNames(obj: MValue | undefined): string[] {
    if (!isNode(obj, 'object')) return [];
    const names = obj.fields.map(([key]) => key.name);
    for (const key of this.patches.get(obj)?.keys() ?? []) {
      if (key.startsWith('f:') && !names.includes(key.slice(2))) names.push(key.slice(2));
    }
    return names;
  }

  /** Array items with patched indices applied (including ones past the end, padded with nil). */
  items(array: MValue | undefined): MValue[] {
    const base = arrayItems(array);
    if (!isNode(array, 'array')) return base;
    const overrides = overridesOf(this.patches, array, 'i');
    if (!overrides.length) return base;
    const items = [...base];
    for (const [index, value] of overrides) {
      while (items.length < index) items.push(null);
      items[index] = value;
    }
    return items;
  }

  /** Value of the hash entry at `index` (for non-Integer keys). */
  entryValue(hash: MHash, index: number): MValue {
    const patched = this.patched(hash, entryKey(index));
    return patched ? patched.value : hash.entries[index][1];
  }

  member(struct: MStruct, index: number): MValue {
    const patched = this.patched(struct, memberKey(index));
    return patched ? patched.value : struct.members[index][1];
  }

  dump(dumps: MValue[], index: number): MValue {
    const patched = this.patched(dumps, dumpKey(index));
    return patched ? patched.value : dumps[index];
  }

  /** Integer-keyed entries with patched keys applied (new keys appended). */
  intEntries(hash: MValue | undefined): [number, MValue][] {
    if (!isNode(hash, 'hash')) return [];
    const overrides = new Map(overridesOf(this.patches, hash, 'k'));
    const entries: [number, MValue][] = [];
    for (const [key, value] of hash.entries) {
      if (typeof key !== 'number') continue;
      entries.push([key, overrides.has(key) ? overrides.get(key)! : value]);
    }
    for (const [id, value] of overrides) {
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
      if (kind === 'd' && Array.isArray(node)) node[Number(rest)] = value;
      else if (kind === 'f' && isNode(node as MValue, 'object')) setField(node as MObject, rest, value);
      else if (kind === 'i' && isNode(node as MValue, 'array')) setArrayItem(node as MArray, Number(rest), value);
      else if (kind === 'k' && isNode(node as MValue, 'hash')) setIntKey(node as MHash, Number(rest), value);
      else if (kind === 'e' && isNode(node as MValue, 'hash')) (node as MHash).entries[Number(rest)][1] = value;
      else if (kind === 'm' && isNode(node as MValue, 'struct')) (node as MStruct).members[Number(rest)][1] = value;
    }
  }
  return dumps;
}
