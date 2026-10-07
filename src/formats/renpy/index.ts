import { readBinary, writeBinary } from '../../utils/fileUtils';
import { sameValue } from '../sameValue';
import { PDict, PLeaf, PNode } from '../pickle/model';
import { createPickleTree, keyLabel, Ref, withLeafValue } from '../pickle/tree';
import { LeafEdit } from '../pickle/writer';
import { SaveEditor, SaveFormat, SaveTree, TreeNode } from '../types';
import { isRenpySavePath, RENPY_EXTENSIONS, renpyGameName } from './paths';
import { recordedMember, recordedVariable, rollbackEntries, sameKindLeaves } from './rollback';
import { parseRenpySave, RenpySave, renpyParts, serializeRenpySave } from './save';

/**
 * The roots dict keys are "store.money", "store.mystore.counter"...; they are
 * shown as a tree of stores (store > money, store > mystore > counter) so
 * paths read like Python and path search works. These dicts are views only.
 */
const storeViews = new WeakMap<PNode, PDict>();
const namespaces = new WeakSet<PNode>();
/** The roots dict key of each variable's value ("store.money"). */
const rootKeys = new WeakMap<PNode, string>();

function storeView(roots: PDict): PDict {
  let view = storeViews.get(roots);
  if (view) return view;
  view = { kind: 'dict', entries: [] };
  namespaces.add(view);
  const keyNode = (name: string): PLeaf => ({ kind: 'leaf', type: 'str', value: name, site: -1, readOnly: true });

  for (const [key, value] of roots.entries) {
    if (key.kind !== 'leaf' || typeof key.value !== 'string') continue;
    const path = key.value.split('.');
    if (path[0] === 'store') path.shift();
    let target = view;
    for (const name of path.slice(0, -1)) {
      let next = target.entries.find(([k, v]) => (k as PLeaf).value === name && namespaces.has(v))?.[1] as PDict | undefined;
      if (!next) {
        next = { kind: 'dict', entries: [] };
        namespaces.add(next);
        target.entries.push([keyNode(name), next]);
      }
      target = next;
    }
    target.entries.push([keyNode(path[path.length - 1]), value]);
    rootKeys.set(value, key.value);
  }
  storeViews.set(roots, view);
  return view;
}

const pickleTree = createPickleTree<RenpySave>((root) => {
  const parts = renpyParts(root);
  if (!parts) return [{ key: 'data', node: root, readOnly: true }];
  return [
    { key: 'store', node: storeView(parts.roots as PDict) },
    // The rollback history: Ren'Py restores the variables from "store" and only
    // rolls back to the start of the current statement, so it isn't edited.
    { key: 'rollback log', node: parts.log, readOnly: true },
  ];
});

/** Values recorded in the rollback log for the leaf `node` (see rollback.ts). */
function recordedCopies(save: RenpySave, node: TreeNode): PLeaf[] {
  const { node: leaf, ancestors } = node.ref as Ref;
  const parts = renpyParts(save.pickle.root);
  if (leaf.kind !== 'leaf' || !parts) return [];
  const entries = rollbackEntries(parts.log);
  const parent = ancestors[ancestors.length - 1];
  const rootKey = parent && namespaces.has(parent) ? rootKeys.get(leaf) : undefined;
  const recorded = rootKey
    ? recordedVariable(entries, rootKey)
    : parent?.kind === 'object'
      ? recordedMember(entries, parent, leaf)
      : [];
  return sameKindLeaves(recorded, leaf);
}

/** Edits also update the values the rollback log restores on load, so they aren't undone. */
const renpyTree: SaveTree<RenpySave> = {
  ...pickleTree,
  setValue(save, node, value) {
    const leaf = (node.ref as Ref).node as PLeaf;
    let edits: ReadonlyMap<number, LeafEdit> = pickleTree.setValue(save, node, value).edits;
    // Back to the value in the file: the recorded copies go back to theirs too.
    const backToFile = !edits.has(leaf.site);
    for (const copy of recordedCopies(save, node)) {
      if (!backToFile) edits = withLeafValue(edits, copy, value);
      else if (edits.has(copy.site)) {
        const next = new Map(edits);
        next.delete(copy.site);
        edits = next;
      }
    }
    return { ...save, edits };
  },
};

/** Ren'Py's own variables that show up among the game's. */
const INTERNAL = new Set(['save_name', 'main_menu', 'mouse_visible', 'suppress_overlay', 'default_mouse', 'nvl_list']);

/** Game variables with a simple value (number, text, true/false, None), for the Variables page. */
const SIMPLE_TYPES = ['int', 'float', 'bool', 'str', 'None'];
const isSimple = (node: TreeNode) => !node.hasChildren && SIMPLE_TYPES.includes(node.type);

/**
 * Attribute names of an object of one of the game's own classes (e.g. an
 * Inventory with `money`), or null for anything else: Ren'Py's own classes
 * (characters, revertable lists and dicts...) and plain containers.
 */
function gameObjectAttributes(node: TreeNode): Set<string> | null {
  const target = (node.ref as Ref).node;
  if (target.kind !== 'object' || target.state?.kind !== 'dict') return null;
  const cls = target.cls;
  if (cls.kind === 'global' && (cls.module === 'renpy' || cls.module.startsWith('renpy.'))) return null;
  return new Set(target.state.entries.map(([key]) => keyLabel(key)));
}

/**
 * Game variables with a simple value (number, text, true/false, None), for
 * the Variables page, plus the simple attributes of the game's own objects one
 * level down (e.g. "mc_inventory.money").
 */
function namedVariables(save: RenpySave): { name: string; node: TreeNode }[] {
  const [store] = renpyTree.roots(save);
  if (!store || store.key !== 'store') return [];
  const result: { name: string; node: TreeNode }[] = [];
  const walk = (parent: TreeNode, prefix: string) => {
    for (const node of renpyTree.children(save, parent)) {
      if (node.key.startsWith('_') || (!prefix && INTERNAL.has(node.key))) continue;
      if (node.identity && namespaces.has(node.identity as PNode)) {
        walk(node, `${prefix}${node.key}.`);
      } else if (isSimple(node)) {
        result.push({ name: prefix + node.key, node });
      } else if (node.hasChildren) {
        const attributes = gameObjectAttributes(node);
        if (!attributes) continue;
        for (const attribute of renpyTree.children(save, node)) {
          if (attributes.has(attribute.key) && !attribute.key.startsWith('_') && isSimple(attribute)) {
            result.push({ name: `${prefix}${node.key}.${attribute.key}`, node: attribute });
          }
        }
      }
    }
  };
  walk(store, '');
  return result;
}

const unsupported = (): never => {
  throw new Error("Not available for Ren'Py saves");
};

/** Ren'Py games have no standard party/items/switches; only Variables and Advanced apply. */
const renpyEditor: SaveEditor<RenpySave> = {
  getGold: () => 0,
  setGold: unsupported,
  getInventory: () => ({}),
  setInventoryCount: unsupported,
  getActors: () => [],
  setActorField: unsupported,
  setActorParamPlus: unsupported,
  getSwitches: () => [],
  setSwitch: unsupported,
  getVariables: () => ({}),
  setVariable: unsupported,
};

export const renpyFormat: SaveFormat<RenpySave> = {
  id: 'renpy',
  label: "Ren'Py",
  extensions: RENPY_EXTENSIONS,
  matches: isRenpySavePath,
  pages: ['Variables', 'Advanced'],

  async read(filePath) {
    return { data: await parseRenpySave(await readBinary(filePath)) };
  },

  async write(filePath, { data }) {
    await writeBinary(filePath, await serializeRenpySave(data));
  },

  // Names come from the save itself.
  loadDatabase: async () => ({ database: { items: null, weapons: null, armors: null, system: null }, warnings: [] }),
  gameName: renpyGameName,
  editor: renpyEditor,
  tree: renpyTree,
  // Edits set back to the value in the file are dropped, so equal edits = same file.
  sameData: (a, b) => a.pickle === b.pickle && sameValue(a.edits, b.edits),
  namedVariables,
};
