import { readText, writeText } from '../../utils/fileUtils';
import { fileNameFromPath, hasExtension, pathSegments } from '../../utils/path';
import { sameValue } from '../sameValue';
import { NamedVariable, SaveEditor, SaveFormat, TreeNode } from '../types';
import { JsonSave, parseJsonSave, serializeJsonSave } from './save';
import { jsonTree } from './tree';

export const JSON_EXTENSIONS = ['json'] as const;

/** Folders that only hold the saves: the game is the one above. */
const SAVE_DIRS = ['save', 'saves', 'savedata', 'data', 'userdata'];

/** Game folder from <Game>/saves/slot1.json, or the folder the file is in. */
export function jsonGameName(filePath: string): string | null {
  const parts = pathSegments(filePath);
  parts.pop(); // slot1.json
  let folder = parts.pop();
  if (folder && SAVE_DIRS.includes(folder.toLowerCase())) folder = parts.pop() ?? folder;
  return folder || fileNameFromPath(filePath).replace(/\.json$/i, '') || null;
}

const isLeaf = (node: TreeNode) => !node.hasChildren && node.editable !== undefined;

/**
 * The values of the save by name: the top-level numbers, text and true/false
 * values (`day`), and those of the objects directly under it (`kitchen.beer`).
 * Everything deeper is in Advanced.
 */
function namedVariables(save: JsonSave): NamedVariable[] {
  const result: NamedVariable[] = [];
  for (const node of jsonTree.roots(save)) {
    if (isLeaf(node)) {
      result.push({ name: node.key, node });
    } else if (node.type === 'Object') {
      for (const field of jsonTree.children(save, node)) {
        if (isLeaf(field)) result.push({ name: `${node.key}.${field.key}`, node: field });
      }
    }
  }
  return result;
}

const unsupported = (): never => {
  throw new Error('Not available for JSON saves');
};

/** A JSON save has no standard layout: only Variables (top-level values) and Advanced apply. */
const jsonEditor: SaveEditor<JsonSave> = {
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

export const jsonFormat: SaveFormat<JsonSave> = {
  id: 'json',
  label: 'JSON saves',
  hint: 'Plain .json saves from games written in JavaScript (browser, NW.js, Electron...).',
  extensions: JSON_EXTENSIONS,
  matches: (filePath) => hasExtension(filePath, JSON_EXTENSIONS),
  pages: ['Variables', 'Advanced'],

  async read(filePath) {
    return { data: parseJsonSave(await readText(filePath)) };
  },

  async write(filePath, { data }) {
    await writeText(filePath, serializeJsonSave(data));
  },

  // Names come from the save itself.
  loadDatabase: async () => ({ database: { items: null, weapons: null, armors: null, system: null }, warnings: [] }),
  gameName: jsonGameName,
  editor: jsonEditor,
  tree: jsonTree,
  sameData: (a, b) => a.text === b.text && sameValue(a.data, b.data),
  namedVariables,
};
