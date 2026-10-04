import { readBinary, writeBinary } from '../../utils/fileUtils';
import { PDict, PLeaf, PNode } from '../pickle/model';
import { createPickleTree } from '../pickle/tree';
import { SaveEditor, SaveFormat, TreeNode } from '../types';
import { isRenpySavePath, RENPY_EXTENSIONS, renpyGameName } from './paths';
import { parseRenpySave, RenpySave, renpyParts, serializeRenpySave } from './save';

/**
 * The roots dict keys are "store.money", "store.mystore.counter"...; they are
 * shown as a tree of stores (store > money, store > mystore > counter) so
 * paths read like Python and path search works. These dicts are views only.
 */
const storeViews = new WeakMap<PNode, PDict>();
const namespaces = new WeakSet<PNode>();

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
  }
  storeViews.set(roots, view);
  return view;
}

const renpyTree = createPickleTree<RenpySave>((root) => {
  const parts = renpyParts(root);
  if (!parts) return [{ key: 'data', node: root, readOnly: true }];
  return [
    { key: 'store', node: storeView(parts.roots as PDict) },
    // The rollback history: Ren'Py restores the variables from "store" and only
    // rolls back to the start of the current statement, so it isn't edited.
    { key: 'rollback log', node: parts.log, readOnly: true },
  ];
});

/** Ren'Py's own variables that show up among the game's. */
const INTERNAL = new Set(['save_name', 'main_menu', 'mouse_visible', 'suppress_overlay', 'default_mouse', 'nvl_list']);

/** Game variables with a simple value (number, text, true/false, None), for the Variables page. */
function namedVariables(save: RenpySave): { name: string; node: TreeNode }[] {
  const [store] = renpyTree.roots(save);
  if (!store || store.key !== 'store') return [];
  const result: { name: string; node: TreeNode }[] = [];
  const walk = (parent: TreeNode, prefix: string) => {
    for (const node of renpyTree.children(save, parent)) {
      if (node.key.startsWith('_') || (!prefix && INTERNAL.has(node.key))) continue;
      if (node.identity && namespaces.has(node.identity as PNode)) walk(node, `${prefix}${node.key}.`);
      else if (!node.hasChildren && ['int', 'float', 'bool', 'str', 'None'].includes(node.type)) {
        result.push({ name: prefix + node.key, node });
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
  namedVariables,
};
