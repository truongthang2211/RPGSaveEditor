import { SaveTree, TreeNode, TreeValue } from '../types';
import { containerOf, JNode, literalAt, nodeAt, parseDoc, patchText, Step } from './doc';
import { JsonSave } from './save';

type Ref = readonly Step[];

/** Text longer than this is shown by its length and not edited (a base64 picture in a text box would freeze it). */
const LONG_TEXT = 2000;

const countOf = (node: JNode) => {
  const container = containerOf(node);
  return container.k === 'object' ? container.members.length : container.k === 'array' ? container.items.length : 0;
};

function toTreeNode(node: JNode, ref: Ref, key: string): TreeNode {
  const base = { id: ref.join('/'), key, ref };
  switch (node.k) {
    case 'number':
      return { ...base, type: 'Number', value: node.value, editable: 'number', hasChildren: false };
    case 'boolean':
      return { ...base, type: 'Boolean', value: node.value, editable: 'boolean', hasChildren: false };
    case 'null':
      return { ...base, type: 'null', value: null, hasChildren: false };
    case 'string': {
      if (node.embedded) {
        const count = countOf(node);
        return { ...base, type: 'JSON text', summary: node.embedded.root.k === 'array' ? `Array(${count})` : `${count} keys`, hasChildren: count > 0 };
      }
      if (node.value.length > LONG_TEXT) return { ...base, type: 'String', summary: `${node.value.length.toLocaleString('en-US')} characters`, hasChildren: false };
      return { ...base, type: 'String', value: node.value, editable: 'string', hasChildren: false };
    }
    case 'array':
      return { ...base, type: 'Array', summary: `Array(${node.items.length})`, hasChildren: node.items.length > 0 };
    default:
      return { ...base, type: 'Object', summary: `${node.members.length} keys`, hasChildren: node.members.length > 0 };
  }
}

/** The tree node at `ref` (used by the Variables page to point at a value). */
export function treeNodeAt(save: JsonSave, ref: Ref): TreeNode | undefined {
  const node = nodeAt(save.doc, ref);
  const last = ref[ref.length - 1];
  return node && last !== undefined ? toTreeNode(node, ref, typeof last === 'number' ? `[${last}]` : last) : undefined;
}

function childrenOf(node: JNode, ref: Ref): TreeNode[] {
  const container = containerOf(node);
  if (container.k === 'array') return container.items.map((item, i) => toTreeNode(item, [...ref, i], `[${i}]`));
  if (container.k === 'object') {
    // With a repeated key, only the last one is the value (like JSON.parse).
    const last = new Map(container.members.map((member, i) => [member.key, i]));
    return container.members.flatMap((member, i) => (last.get(member.key) === i ? [toTreeNode(member.value, [...ref, member.key], member.key)] : []));
  }
  return [];
}

/** Whether `value` can replace `old`: the same kind of value, and finite for numbers. */
const checked = (old: JNode, value: TreeValue, key: string): string => {
  if (old.k === 'number' && typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (old.k === 'boolean' && typeof value === 'boolean') return String(value);
  if (old.k === 'string' && !old.embedded && typeof value === 'string') return JSON.stringify(value);
  throw new Error(`Cannot set ${key} (${old.k}) to ${JSON.stringify(value)}`);
};

/** The contents of a JSON save as a tree: objects, arrays, and numbers, text and true/false values. */
export const jsonTree: SaveTree<JsonSave> = {
  roots: (save) => childrenOf(save.doc.root, []),
  children: (save, parent) => {
    const node = nodeAt(save.doc, parent.ref as Ref);
    return node ? childrenOf(node, parent.ref as Ref) : [];
  },
  valueOf: (save, treeNode) => {
    const node = nodeAt(save.doc, treeNode.ref as Ref);
    if (!node) return undefined;
    if (node.k === 'null') return null;
    if (node.k === 'string') return node.embedded ? undefined : node.value;
    return node.k === 'number' || node.k === 'boolean' ? node.value : undefined;
  },
  setValue: (save, treeNode, value) => {
    const ref = treeNode.ref as Ref;
    const old = nodeAt(save.doc, ref);
    if (!old) throw new Error(`No such value: ${ref.join('.')}`);
    let literal = checked(old, value, ref.join('.'));
    // Setting a value to what it is keeps the text as it is (`1.0` stays `1.0`).
    if ((old.k === 'number' || old.k === 'boolean' || old.k === 'string') && old.value === value) return save;
    // Setting it back to what it was when the file was opened restores the file's own text for it.
    const original = nodeAt(save.loaded, ref);
    if (original && original.k === old.k && 'value' in original && original.value === value) literal = literalAt(save.loaded, ref) ?? literal;
    return { ...save, doc: parseDoc(patchText(save.doc, ref, literal)) };
  },
};
