import { SaveTree, TreeNode, TreeValue } from '../types';
import { PContainer, PLeaf, PNode, ParsedPickle } from './model';
import { LeafEdit } from './writer';

/** A parsed pickle plus the edits made to it (op index -> new value). */
export interface PickleDoc {
  pickle: ParsedPickle;
  edits: ReadonlyMap<number, LeafEdit>;
}

/** A top-level row of the tree. */
export interface TopLevel {
  key: string;
  node: PNode;
  /** Shown but not editable (with everything under it). */
  readOnly?: boolean;
}

export interface Ref {
  node: PNode;
  readOnly: boolean;
  /** Containers on the path to this node, to stop at cycles. */
  ancestors: readonly PNode[];
}

interface Child {
  key: string;
  node: PNode;
  readOnly?: boolean;
}

const isContainer = (node: PNode): node is PContainer =>
  node.kind !== 'leaf' && node.kind !== 'global' && node.kind !== 'opaque';

const className = (node: PNode): string => (node.kind === 'global' ? node.name : node.kind === 'object' ? className(node.cls) : '?');
const fullClassName = (node: PNode): string =>
  node.kind === 'global' ? `${node.module}.${node.name}` : node.kind === 'object' ? fullClassName(node.cls) : '?';

/** Python-like text for a dict key (str keys as is). */
export function keyLabel(node: PNode): string {
  if (node.kind === 'leaf') {
    if (node.type === 'str') return node.value as string;
    if (node.type === 'none') return 'None';
    if (node.type === 'bool') return node.value ? 'True' : 'False';
    if (node.type === 'bytes') return `b'…'`;
    return String(node.value);
  }
  if (node.kind === 'tuple') return `(${node.items.map(keyLabel).join(', ')})`;
  if (node.kind === 'global') return `${node.module}.${node.name}`;
  return `<${node.kind === 'object' ? className(node) : node.kind}>`;
}

const dictChildren = (entries: [PNode, PNode][]): Child[] => entries.map(([k, v]) => ({ key: keyLabel(k), node: v }));
const itemChildren = (items: PNode[], readOnly = false): Child[] =>
  items.map((node, i) => ({ key: `[${i}]`, node, readOnly }));

/** An object's contents: its attributes (BUILD state), then dict/list items, then constructor arguments. */
function objectChildren(node: Extract<PNode, { kind: 'object' }>): Child[] {
  const children: Child[] = [];
  const state = node.state;
  if (state?.kind === 'dict') {
    children.push(...dictChildren(state.entries));
  } else if (state?.kind === 'tuple' && state.items.length === 2) {
    // (__dict__ or None, __slots__ values)
    for (const part of state.items) if (part.kind === 'dict') children.push(...dictChildren(part.entries));
  } else if (state) {
    children.push({ key: 'state', node: state });
  }
  children.push(...dictChildren(node.entries), ...itemChildren(node.items));
  const args = node.args;
  if (args && !(args.kind === 'tuple' && args.items.length === 0)) children.push({ key: 'args', node: args, readOnly: true });
  if (node.kwargs) children.push({ key: 'kwargs', node: node.kwargs, readOnly: true });
  return children;
}

function childrenOf(node: PNode): Child[] {
  switch (node.kind) {
    case 'list':
    case 'tuple':
      return itemChildren(node.items);
    case 'set':
    case 'frozenset':
      return itemChildren(node.items, true); // changing a member could clash with another one
    case 'dict':
      return dictChildren(node.entries);
    case 'object':
      return objectChildren(node);
    default:
      return [];
  }
}

function sizeOf(node: PContainer): number {
  switch (node.kind) {
    case 'dict':
      return node.entries.length;
    case 'object':
      return node.entries.length + node.items.length;
    default:
      return node.items.length;
  }
}

/** Current value of a leaf, with edits applied. */
function currentLeaf(leaf: PLeaf, edits: ReadonlyMap<number, LeafEdit>): PLeaf['value'] {
  const edit = edits.get(leaf.site);
  return edit ? edit.value : leaf.value;
}

function leafView(leaf: PLeaf, value: PLeaf['value'], readOnly: boolean) {
  const locked = readOnly || !!leaf.readOnly;
  switch (leaf.type) {
    case 'none':
      return { type: 'None', value: null };
    case 'bool':
      return { type: 'bool', value: value as boolean, editable: locked ? undefined : ('boolean' as const) };
    case 'int':
      if (typeof value === 'bigint') return { type: 'int', value: value.toString() };
      return { type: 'int', value: value as number, editable: locked ? undefined : ('number' as const), integer: true };
    case 'float': {
      const n = value as number;
      if (!Number.isFinite(n)) return { type: 'float', value: String(n) };
      return { type: 'float', value: n, editable: locked ? undefined : ('number' as const) };
    }
    case 'str':
      return { type: 'str', value: value as string, editable: locked ? undefined : ('string' as const) };
    case 'bytes': {
      const bytes = value as Uint8Array;
      return { type: 'bytes', value: `${bytes.length} bytes` };
    }
  }
}

function toTreeNode(doc: PickleDoc, parent: TreeNode | null, child: Child, parentRef: Ref | null): TreeNode {
  const readOnly = !!child.readOnly || !!parentRef?.readOnly;
  const ancestors = parentRef ? parentRef.ancestors : [];
  const id = parent ? `${parent.id}/${child.key}` : child.key;
  const { node } = child;
  const ref: Ref = { node, readOnly, ancestors: isContainer(node) ? [...ancestors, node] : ancestors };

  if (node.kind === 'leaf') {
    const view = leafView(node, currentLeaf(node, doc.edits), readOnly);
    return { id, key: child.key, hasChildren: false, ref, ...view };
  }
  if (node.kind === 'global') {
    return { id, key: child.key, type: 'class', value: `${node.module}.${node.name}`, hasChildren: false, ref };
  }
  if (node.kind === 'opaque') {
    return { id, key: child.key, type: 'opaque', summary: node.label, hasChildren: false, ref };
  }

  const type = node.kind === 'object' ? className(node) : node.kind;
  if (ancestors.includes(node)) {
    return { id, key: child.key, type, summary: 'cycle (contains itself, shown above)', hasChildren: false, ref };
  }
  const size = sizeOf(node);
  const summary = node.kind === 'object' ? `${fullClassName(node)}${size ? ` · ${size} items` : ''}` : `${node.kind}(${size})`;
  return { id, key: child.key, type, summary, hasChildren: childrenOf(node).length > 0, identity: node, ref };
}

/** The edit setting `leaf` to `value`; throws when the value isn't of the leaf's Python type. */
export function leafEdit(leaf: PLeaf, value: TreeValue): LeafEdit {
  if (leaf.type === 'int' && typeof value === 'number' && Number.isSafeInteger(value)) return { type: 'int', value };
  if (leaf.type === 'float' && typeof value === 'number' && Number.isFinite(value)) return { type: 'float', value };
  if (leaf.type === 'bool' && typeof value === 'boolean') return { type: 'bool', value };
  if (leaf.type === 'str' && typeof value === 'string') return { type: 'str', value, byteString: leaf.byteString };
  throw new Error(`Cannot set a Python ${leaf.type} to ${JSON.stringify(value)}`);
}

/** `edits` with `leaf` set to `value` (no edit kept when it's the value in the file). */
export function withLeafValue(edits: ReadonlyMap<number, LeafEdit>, leaf: PLeaf, value: TreeValue): Map<number, LeafEdit> {
  const edit = leafEdit(leaf, value);
  const next = new Map(edits);
  if (edit.value === leaf.value) next.delete(leaf.site);
  else next.set(leaf.site, edit);
  return next;
}

/** Advanced-tab access to a pickle; `topLevel` names the rows under the root. */
export function createPickleTree<S extends PickleDoc>(topLevel: (root: PNode) => TopLevel[]): SaveTree<S> {
  return {
    roots(save) {
      return topLevel(save.pickle.root).map((top) =>
        toTreeNode(save, null, { key: top.key, node: top.node, readOnly: top.readOnly }, null),
      );
    },

    children(save, parent) {
      const ref = parent.ref as Ref;
      if (!parent.hasChildren) return [];
      return childrenOf(ref.node).map((child) => toTreeNode(save, parent, child, ref));
    },

    valueOf(save, node) {
      const { node: target } = node.ref as Ref;
      if (target.kind !== 'leaf') return undefined;
      const view = leafView(target, currentLeaf(target, save.edits), true);
      return view.value as TreeValue;
    },

    setValue(save, node, value) {
      const ref = node.ref as Ref;
      const leaf = ref.node;
      if (leaf.kind !== 'leaf' || !node.editable) throw new Error(`${node.key} can't be edited`);
      return { ...save, edits: withLeafValue(save.edits, leaf, value) };
    },
  };
}
