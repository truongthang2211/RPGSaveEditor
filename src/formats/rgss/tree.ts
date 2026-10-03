import { SaveTree, TreeNode, TreeValue } from '../types';
import { MArray, MHash, MNode, MObject, MStruct, MString, MValue } from '../marshal/types';
import { decodeString, isNode, toDisplayValue, toNumber } from '../marshal/helpers';
import {
  PatchedView,
  patchDump,
  patchEntry,
  patchField,
  patchIndex,
  patchIntKey,
  patchMember,
  RgssSave,
} from './patches';

/** Where a value lives, so it can be read through patches and patched. */
type Slot =
  | { kind: 'dump'; index: number }
  | { kind: 'field'; obj: MObject; name: string }
  | { kind: 'index'; array: MArray; index: number }
  | { kind: 'intKey'; hash: MHash; key: number }
  | { kind: 'entry'; hash: MHash; index: number }
  | { kind: 'member'; struct: MStruct; index: number }
  | { kind: 'default'; hash: MHash }
  | { kind: 'data'; node: Extract<MNode, { kind: 'usermarshal' | 'data' }> };

interface Ref {
  slot: Slot;
  /** Containers above this node (cycle detection). */
  ancestors: object[];
}

const EDITABLE_SLOTS = new Set<Slot['kind']>(['dump', 'field', 'index', 'intKey', 'entry', 'member']);

function valueAt(view: PatchedView, save: RgssSave, slot: Slot): MValue {
  switch (slot.kind) {
    case 'dump': return view.dump(save.dumps, slot.index);
    case 'field': return view.field(slot.obj, slot.name) ?? null;
    case 'index': return view.items(slot.array)[slot.index] ?? null;
    case 'intKey': return view.intKey(slot.hash, slot.key) ?? null;
    case 'entry': return view.entryValue(slot.hash, slot.index);
    case 'member': return view.member(slot.struct, slot.index);
    case 'default': return slot.hash.defaultValue ?? null;
    case 'data': return slot.node.data;
  }
}

/** Strings are editable only when UTF-8 (E: true) or US-ASCII (E: false); others are kept as-is. */
function encodingOf(str: MString): 'utf-8' | 'us-ascii' | 'other' {
  const e = str.ivars?.find(([key]) => key.name === 'E');
  if (!e) return 'other';
  return e[1] === true ? 'utf-8' : 'us-ascii';
}

const symbolText = (name: string) => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(name, (c) => c.charCodeAt(0)));
  } catch {
    return name;
  }
};

const isContainer = (value: MValue): value is MObject | MArray | MHash | MStruct | Extract<MNode, { kind: 'usermarshal' | 'data' }> =>
  isNode(value, 'object') || isNode(value, 'array') || isNode(value, 'hash') || isNode(value, 'struct') ||
  isNode(value, 'usermarshal') || isNode(value, 'data');

function describe(value: MValue): Pick<TreeNode, 'type' | 'summary' | 'value' | 'editable'> {
  if (value === null) return { type: 'nil', value: null };
  if (typeof value === 'boolean') return { type: 'Boolean', value, editable: 'boolean' };
  if (typeof value === 'number') return { type: 'Integer', value, editable: 'number' };
  switch (value.kind) {
    case 'float': {
      const n = toNumber(value)!;
      return Number.isFinite(n) ? { type: 'Float', value: n, editable: 'number' } : { type: 'Float', value: value.text };
    }
    case 'bignum': return { type: 'Integer', value: toNumber(value)!, editable: 'number' };
    case 'string': {
      const text = decodeString(value) ?? '';
      return encodingOf(value) === 'other'
        ? { type: 'String', value: text, summary: 'binary/other encoding (read-only)' }
        : { type: 'String', value: text, editable: 'string' };
    }
    case 'symbol': return { type: 'Symbol', value: `:${symbolText(value.name)}` };
    case 'object': return { type: symbolText(value.className.name), summary: `${value.fields.length} fields` };
    case 'struct': return { type: symbolText(value.className.name), summary: `${value.members.length} members` };
    case 'array': return { type: 'Array', summary: `Array(${value.items.length})` };
    case 'hash': return { type: 'Hash', summary: `Hash(${value.entries.length})` };
    case 'userdef':
      return { type: symbolText(value.className.name), summary: `${value.data.length.toLocaleString()} bytes (read-only)` };
    case 'usermarshal':
    case 'data': return { type: symbolText(value.className.name), summary: 'custom data' };
    default: return { type: value.kind, value: String(toDisplayValue(value)), summary: 'read-only' };
  }
}

function hashKeyLabel(key: MValue): string {
  if (isNode(key, 'symbol')) return `:${symbolText(key.name)}`;
  if (isNode(key, 'string')) return JSON.stringify(decodeString(key) ?? '');
  return String(toDisplayValue(key));
}

function node(view: PatchedView, save: RgssSave, id: string, key: string, slot: Slot, ancestors: object[]): TreeNode {
  const value = valueAt(view, save, slot);
  const info = describe(value);
  const container = isContainer(value);
  const cycle = container && ancestors.includes(value);
  return {
    id,
    key,
    ...info,
    summary: cycle ? '↺ already open above (cycle)' : info.summary,
    editable: EDITABLE_SLOTS.has(slot.kind) ? info.editable : undefined,
    hasChildren: container && !cycle,
    ref: { slot, ancestors } satisfies Ref,
  };
}

/** A new value of the same Ruby type as `old`; anything else (e.g. a number over an object) is refused. */
function toMarshal(old: MValue, value: TreeValue): MValue {
  const editable = describe(old).editable;
  if (typeof value === 'boolean' && editable === 'boolean') return value;
  if (typeof value === 'number' && editable === 'number') {
    if (isNode(old, 'float')) return { kind: 'float', text: String(value) };
    return value;
  }
  if (typeof value === 'string' && editable === 'string' && isNode(old, 'string')) {
    const ascii = /^[\x00-\x7f]*$/.test(value);
    const ivars = old.ivars?.map(([k, v]): [typeof k, MValue] =>
      // A non-ASCII value in a US-ASCII string becomes UTF-8 (E: true).
      k.name === 'E' && !ascii ? [k, true] : [k, v],
    );
    const bytes = new TextEncoder().encode(value);
    return { ...old, bytes, ...(ivars ? { ivars } : {}) };
  }
  throw new Error(`Cannot set a ${describe(old).type} to ${JSON.stringify(value)}`);
}

/** Raw Marshal tree of an XP/VX/VX Ace save, read and edited through patches. */
export const rgssTree: SaveTree<RgssSave> = {
  roots(save) {
    const view = new PatchedView(save.patches);
    return save.dumps.map((_, index) => node(view, save, `d${index}`, `dump ${index}`, { kind: 'dump', index }, []));
  },

  children(save, parent) {
    const view = new PatchedView(save.patches);
    const { slot, ancestors } = parent.ref as Ref;
    const value = valueAt(view, save, slot);
    const above = [...ancestors, value as object];
    const child = (segment: string, key: string, s: Slot) => node(view, save, `${parent.id}/${segment}`, key, s, above);

    if (isNode(value, 'object')) {
      return view.fieldNames(value).map((name) => child(name, name, { kind: 'field', obj: value, name }));
    }
    if (isNode(value, 'array')) {
      return view.items(value).map((_, index) => child(`[${index}]`, `[${index}]`, { kind: 'index', array: value, index }));
    }
    if (isNode(value, 'hash')) {
      const rows: TreeNode[] = [];
      const intKeys = new Set<number>();
      for (const [key] of view.intEntries(value)) {
        intKeys.add(key);
        rows.push(child(`k${key}`, String(key), { kind: 'intKey', hash: value, key }));
      }
      value.entries.forEach(([key], index) => {
        if (typeof key === 'number' && intKeys.has(key)) return;
        rows.push(child(`e${index}`, hashKeyLabel(key), { kind: 'entry', hash: value, index }));
      });
      if (value.hasDefault) rows.push(child('default', '(default)', { kind: 'default', hash: value }));
      return rows;
    }
    if (isNode(value, 'struct')) {
      return value.members.map(([name], index) =>
        child(`m${index}`, symbolText(name.name), { kind: 'member', struct: value, index }),
      );
    }
    if (isNode(value, 'usermarshal') || isNode(value, 'data')) {
      return [child('data', 'data', { kind: 'data', node: value })];
    }
    return [];
  },

  valueOf(save, treeNode) {
    const value = valueAt(new PatchedView(save.patches), save, (treeNode.ref as Ref).slot);
    return describe(value).value;
  },

  setValue(save, treeNode, value) {
    const view = new PatchedView(save.patches);
    const { slot } = treeNode.ref as Ref;
    const next = toMarshal(valueAt(view, save, slot), value);
    switch (slot.kind) {
      case 'dump': return patchDump(save, slot.index, next);
      case 'field': return patchField(save, slot.obj, slot.name, next);
      case 'index': return patchIndex(save, slot.array, slot.index, next);
      case 'intKey': return patchIntKey(save, slot.hash, slot.key, next);
      case 'entry': return patchEntry(save, slot.hash, slot.index, next);
      case 'member': return patchMember(save, slot.struct, slot.index, next);
      default: throw new Error('This value cannot be edited');
    }
  },
};
