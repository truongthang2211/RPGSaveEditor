import { readText, writeText } from '../../utils/fileUtils';
import { fileNameFromPath, hasExtension } from '../../utils/path';
import { sameValue } from '../sameValue';
import { NamedVariable, SaveEditor, SaveFormat, TreeNode } from '../types';
import { isSugarCubeSave, parseSugarCubeSave, serializeSugarCubeSave, SugarCubeSave } from './save';
import { sugarcubeTree } from './tree';

export const SUGARCUBE_EXTENSIONS = ['save'] as const;

/**
 * Game name from a SugarCube disk save name, "<story name>-<YYYYMMDD>-<hhmmss>.save"
 * (browsers may add " (1)" to repeated downloads).
 */
export function sugarcubeGameName(filePath: string): string | null {
  const name = fileNameFromPath(filePath).replace(/\.save$/i, '');
  return name.replace(/-\d{8}-\d{6}(\s*\(\d+\))?$/, '').trim() || null;
}

const isLeaf = (node: TreeNode) => !node.hasChildren && node.editable !== undefined;

/**
 * Story variables ($gold, $metLily...) and the fields of objects stored in
 * them ($player.money), as the game reads them when the save is loaded.
 */
function namedVariables(save: SugarCubeSave): NamedVariable[] {
  const [variables] = sugarcubeTree.roots(save);
  if (!variables || variables.key !== 'variables') return [];
  const result: NamedVariable[] = [];
  for (const node of sugarcubeTree.children(save, variables)) {
    if (isLeaf(node)) {
      result.push({ name: `$${node.key}`, node });
    } else if (node.hasChildren && !['Array', 'Set'].includes(node.type)) {
      for (const field of sugarcubeTree.children(save, node)) {
        if (isLeaf(field)) result.push({ name: `$${node.key}.${field.key}`, node: field });
      }
    }
  }
  return result;
}

const unsupported = (): never => {
  throw new Error('Not available for SugarCube saves');
};

/** SugarCube stories have no standard party/items/switches; only Variables and Advanced apply. */
const sugarcubeEditor: SaveEditor<SugarCubeSave> = {
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

export const sugarcubeFormat: SaveFormat<SugarCubeSave> = {
  id: 'sugarcube',
  label: 'HTML games (Twine/SugarCube)',
  hint: 'Games you play in the browser or from an .html file. Export a save with Saves → Save to Disk.',
  extensions: SUGARCUBE_EXTENSIONS,
  matches: (filePath) => hasExtension(filePath, SUGARCUBE_EXTENSIONS),
  sniff: isSugarCubeSave,
  pages: ['Variables', 'Advanced'],

  async read(filePath) {
    return { data: parseSugarCubeSave(await readText(filePath)) };
  },

  async write(filePath, { data }) {
    await writeText(filePath, serializeSugarCubeSave(data));
  },

  // Variable names come from the save itself.
  loadDatabase: async () => ({ database: { items: null, weapons: null, armors: null, system: null }, warnings: [] }),
  gameName: sugarcubeGameName,
  editor: sugarcubeEditor,
  tree: sugarcubeTree,
  sameData: (a, b) => a.text === b.text && sameValue(a.history, b.history),
  namedVariables,
};
