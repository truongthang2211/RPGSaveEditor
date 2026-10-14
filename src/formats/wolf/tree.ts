import { SaveTree, TreeNode } from '../types';
import { WolfGroup, WolfNode } from './parse';
import { setWolfValue, WolfSave, wolfValue } from './save';

/** Positions of the node among its parents' children, from the root. */
type Ref = readonly number[];

const TYPE_NAMES = { 1: 'Byte', 2: 'UInt16', 4: 'Int32', 8: 'Int64' } as const;

function nodeAt(save: WolfSave, ref: Ref): WolfNode {
  let node: WolfNode = save.structure.root;
  for (const index of ref) node = (node as WolfGroup).children[index];
  return node;
}

function treeNode(save: WolfSave, node: WolfNode, ref: Ref): TreeNode {
  const base = { id: ref.join('/'), key: node.key, ref };
  if (node.kind === 'group') {
    return { ...base, type: 'Group', summary: `${node.children.length} items`, hasChildren: node.children.length > 0, identity: node };
  }
  if (node.kind === 'text') return { ...base, type: 'Text', summary: JSON.stringify(node.value), hasChildren: false };
  const editable = !node.readOnly;
  return {
    ...base,
    type: TYPE_NAMES[node.size],
    value: wolfValue(save, node),
    ...(editable ? { editable: 'number' as const, integer: true } : {}),
    hasChildren: false,
  };
}

const children = (save: WolfSave, group: WolfGroup, ref: Ref) =>
  group.children.map((child, i) => treeNode(save, child, [...ref, i]));

/**
 * Every value of the save in file order. Most are only known by position
 * (WolfSave's numbering); comparing two saves in the Advanced tab finds the
 * ones that matter. Counts, sizes and text are read-only.
 */
export const wolfTree: SaveTree<WolfSave> = {
  roots: (save) => children(save, save.structure.root, []),
  children: (save, parent) => {
    const node = nodeAt(save, parent.ref as Ref);
    return node.kind === 'group' ? children(save, node, parent.ref as Ref) : [];
  },
  valueOf: (save, node) => {
    const found = nodeAt(save, node.ref as Ref);
    return found?.kind === 'int' ? wolfValue(save, found) : found?.kind === 'text' ? found.value : undefined;
  },
  setValue: (save, node, value) => {
    const found = nodeAt(save, node.ref as Ref);
    if (found?.kind !== 'int' || typeof value !== 'number') throw new Error(`${node.key} can't be edited`);
    return setWolfValue(save, found, value);
  },
};
