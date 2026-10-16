import { SaveTree, TreeNode, TreeValue } from '../types';
import { ArrayItem, Chunk, decodeText, Value } from './lcf';
import { LsdSave } from './save';

/**
 * Where a node is, step by step: a top-level chunk index, then, inside a
 * structure, a chunk index; inside an array, an element index and then a chunk
 * index in it; inside a vector, an element index.
 */
type Ref = readonly number[];

const RANGES: Record<string, [number, number]> = {
  ber: [-0x80000000, 0x7fffffff],
  u8: [0, 255],
  i8: [-128, 127],
  i16: [-32768, 32767],
  i32: [-0x80000000, 0x7fffffff],
  bool: [0, 1],
};

const rangeKey = (value: Value, element: boolean) => (element && value.t === 'vec' ? value.kind : value.t);

type At =
  | { kind: 'chunk'; chunk: Chunk }
  | { kind: 'item'; item: ArrayItem; array: string }
  | { kind: 'element'; chunk: Chunk; index: number };

function walk(save: LsdSave, ref: Ref): At | null {
  let chunks: Chunk[] | null = save.chunks;
  let at: At | null = null;
  for (const step of ref) {
    if (chunks) {
      const chunk: Chunk | undefined = chunks[step];
      if (!chunk) return null;
      at = { kind: 'chunk', chunk };
      chunks = chunk.value.t === 'struct' ? chunk.value.chunks : null;
    } else if (at?.kind === 'chunk' && at.chunk.value.t === 'array') {
      const item: ArrayItem | undefined = at.chunk.value.items[step];
      if (!item) return null;
      at = { kind: 'item', item, array: at.chunk.value.name };
      chunks = item.chunks;
    } else if (at?.kind === 'chunk' && at.chunk.value.t === 'vec') {
      if (step >= at.chunk.value.values.length) return null;
      at = { kind: 'element', chunk: at.chunk, index: step };
    } else {
      return null;
    }
  }
  return at;
}

const leaf = (key: string, ref: Ref, type: string, value: TreeValue, editable?: TreeNode['editable'], integer?: boolean): TreeNode => ({
  id: ref.join('/'),
  key,
  ref,
  type,
  value,
  hasChildren: false,
  ...(editable ? { editable, ...(integer ? { integer: true } : {}) } : {}),
});

function chunkNode(chunk: Chunk, ref: Ref): TreeNode {
  const { value } = chunk;
  const base = { id: ref.join('/'), key: chunk.name, ref };
  switch (value.t) {
    case 'ber':
      if (chunk.type === 'Count') return { ...leaf(chunk.name, ref, 'Count', value.n) };
      if (chunk.type === 'Boolean') return leaf(chunk.name, ref, 'Boolean', value.n > 0, 'boolean');
      return leaf(chunk.name, ref, chunk.type.startsWith('Enum') ? 'Enum' : 'Number', value.n, 'number', true);
    case 'u8':
    case 'i8':
    case 'i16':
      return leaf(chunk.name, ref, 'Number', value.n, 'number', true);
    case 'f64':
      return leaf(chunk.name, ref, 'Number', value.n, 'number');
    case 'str':
      return leaf(chunk.name, ref, 'String', decodeText(value.bytes));
    case 'vec':
      return { ...base, type: chunk.type, summary: `${value.values.length} values`, hasChildren: value.values.length > 0 };
    case 'struct':
      return { ...base, type: value.name, summary: `${value.chunks.length} fields`, hasChildren: value.chunks.length > 0 };
    case 'array':
      return { ...base, type: 'Array', summary: `Array(${value.items.length})`, hasChildren: value.items.length > 0 };
    default:
      return { ...base, type: 'Raw', summary: `${value.bytes.length} bytes`, hasChildren: false };
  }
}

function children(save: LsdSave, parent: TreeNode): TreeNode[] {
  const ref = parent.ref as Ref;
  const at = ref.length ? walk(save, ref) : null;
  if (at?.kind === 'item') return at.item.chunks.map((chunk, i) => chunkNode(chunk, [...ref, i]));
  if (at?.kind !== 'chunk') return [];
  const { value } = at.chunk;
  if (value.t === 'struct') return value.chunks.map((chunk, i) => chunkNode(chunk, [...ref, i]));
  if (value.t === 'array') {
    return value.items.map((item, i) => ({
      id: [...ref, i].join('/'),
      key: item.id === null ? `[${i}]` : `[${item.id}]`,
      ref: [...ref, i],
      type: value.name,
      summary: `${item.chunks.length} fields`,
      hasChildren: item.chunks.length > 0,
    }));
  }
  if (value.t === 'vec') {
    const editable = value.kind === 'bool' ? 'boolean' : 'number';
    return value.values.map((n, i) => leaf(`[${i + 1}]`, [...ref, i], value.kind, value.kind === 'bool' ? n > 0 : n, editable, value.kind !== 'bool'));
  }
  return [];
}

function leafValue(save: LsdSave, ref: Ref): TreeValue | undefined {
  const at = walk(save, ref);
  if (at?.kind === 'element' && at.chunk.value.t === 'vec') {
    const n = at.chunk.value.values[at.index];
    return at.chunk.value.kind === 'bool' ? n > 0 : n;
  }
  if (at?.kind !== 'chunk') return undefined;
  const node = chunkNode(at.chunk, ref);
  return node.hasChildren || node.type === 'Raw' ? undefined : node.value;
}

/** Replaces the value at `ref`, copying the chunks on the way (nothing is mutated). */
function update(chunks: Chunk[], ref: Ref, change: (chunk: Chunk, element: number | null) => Chunk): Chunk[] {
  const [index, ...rest] = ref;
  const chunk = chunks[index];
  if (!chunk) throw new Error('No such value');
  const next = [...chunks];
  const { value } = chunk;
  if (rest.length === 0) {
    next[index] = change(chunk, null);
  } else if (value.t === 'struct') {
    next[index] = { ...chunk, value: { ...value, chunks: update(value.chunks, rest, change) } };
  } else if (value.t === 'array') {
    const [element, ...inner] = rest;
    const items = [...value.items];
    if (!items[element] || inner.length === 0) throw new Error('No such value');
    items[element] = { ...items[element], chunks: update(items[element].chunks, inner, change) };
    next[index] = { ...chunk, value: { ...value, items } };
  } else if (value.t === 'vec' && rest.length === 1) {
    next[index] = change(chunk, rest[0]);
  } else {
    throw new Error('No such value');
  }
  return next;
}

function checkRange(key: string, n: number, label: string) {
  const [min, max] = RANGES[key] ?? [-Infinity, Infinity];
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${label} must be a whole number from ${min} to ${max}`);
}

function withValue(chunk: Chunk, element: number | null, value: TreeValue): Chunk {
  const old = chunk.value;
  if (old.t === 'vec' && element !== null) {
    const n = typeof value === 'boolean' ? Number(value) : value;
    if (typeof n !== 'number') throw new Error(`${chunk.name} takes numbers`);
    checkRange(rangeKey(old, true), n, `${chunk.name}[${element + 1}]`);
    const values = [...old.values];
    values[element] = n;
    return { ...chunk, value: { ...old, values } };
  }
  if (chunk.type === 'Count') throw new Error(`${chunk.name} is a size and can't be edited`);
  if (old.t === 'ber' || old.t === 'u8' || old.t === 'i8' || old.t === 'i16' || old.t === 'f64') {
    const n = typeof value === 'boolean' ? Number(value) : value;
    if (typeof n !== 'number') throw new Error(`${chunk.name} takes numbers`);
    if (old.t !== 'f64') checkRange(old.t, n, chunk.name);
    else if (!Number.isFinite(n)) throw new Error(`${chunk.name} must be a number`);
    return { ...chunk, value: { ...old, n } };
  }
  throw new Error(`${chunk.name} can't be edited`);
}

/** Every field of the save, by name where liblcf knows it (the rest by chunk id). */
export const lsdTree: SaveTree<LsdSave> = {
  roots: (save) => save.chunks.map((chunk, i) => chunkNode(chunk, [i])),
  children,
  valueOf: (save, node) => leafValue(save, node.ref as Ref),
  setValue: (save, node, value) => ({ ...save, chunks: update(save.chunks, node.ref as Ref, (chunk, element) => withValue(chunk, element, value)) }),
};
