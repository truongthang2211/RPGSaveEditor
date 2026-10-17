import { readBinary, writeBinary } from '../../utils/fileUtils';
import { fileNameFromPath, hasExtension, pathSegments } from '../../utils/path';
import { NamedVariable, SaveEditor, SaveFormat, TreeNode } from '../types';
import { naninovelVariables } from './naninovel';
import { JsonSave, parseJsonBytes, sameJsonData, serializeJsonBytes } from './save';
import { jsonTree } from './tree';

export const JSON_EXTENSIONS = ['json', 'es3', 'nson'] as const;

/** Folders that only hold the saves: the game is the one above. */
const SAVE_DIRS = ['save', 'saves', 'savedata', 'data', 'userdata'];

/** Game folder from <Game>/saves/slot1.json, or the folder the file is in. */
export function jsonGameName(filePath: string): string | null {
  const parts = pathSegments(filePath);
  parts.pop(); // slot1.json
  let folder = parts.pop();
  if (folder && SAVE_DIRS.includes(folder.toLowerCase())) folder = parts.pop() ?? folder;
  return folder || fileNameFromPath(filePath).replace(/\.(json|es3|nson)$/i, '') || null;
}

const isLeaf = (node: TreeNode) => !node.hasChildren && node.editable !== undefined;

/**
 * The values of the save by name: the top-level numbers, text and true/false
 * values (`day`), and those of the objects directly under it (`kitchen.beer`).
 * Everything deeper is in Advanced.
 *
 * Unity's Easy Save stores each key as `{ "__type": "int", "value": 5 }` (a
 * value) or `{ "__type": "Player,Assembly-CSharp", "hp": 50 }` (an object):
 * a value is shown under its key, and the type marker is not a variable.
 */
function namedVariables(save: JsonSave): NamedVariable[] {
  const naninovel = naninovelVariables(save);
  if (naninovel) return naninovel;
  const result: NamedVariable[] = [];
  for (const node of jsonTree.roots(save)) {
    if (isLeaf(node)) {
      result.push({ name: node.key, node });
    } else if (node.type === 'Object') {
      const fields = jsonTree.children(save, node);
      const wrapped = fields.some((field) => field.key === '__type') ? fields.find((field) => field.key === 'value') : undefined;
      if (wrapped && isLeaf(wrapped)) {
        result.push({ name: node.key, node: wrapped });
        continue;
      }
      if (wrapped?.type === 'Object') {
        // `{ "__type": "...", "value": { "hp": 50 } }`: the fields of the value.
        for (const field of jsonTree.children(save, wrapped)) {
          if (isLeaf(field)) result.push({ name: `${node.key}.${field.key}`, node: field });
        }
        continue;
      }
      for (const field of fields) {
        if (isLeaf(field) && field.key !== '__type') result.push({ name: `${node.key}.${field.key}`, node: field });
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
  label: 'JSON saves (Unity Easy Save, Naninovel)',
  hint: 'Plain .json saves from games written in JavaScript, Unity .es3 saves that are not encrypted, and Naninovel .json/.nson saves.',
  extensions: JSON_EXTENSIONS,
  matches: (filePath) => hasExtension(filePath, JSON_EXTENSIONS),
  pages: ['Variables', 'Advanced'],

  async read(filePath) {
    return { data: await parseJsonBytes(await readBinary(filePath)) };
  },

  async write(filePath, { data }) {
    await writeBinary(filePath, await serializeJsonBytes(data));
  },

  // Names come from the save itself.
  loadDatabase: async () => ({ database: { items: null, weapons: null, armors: null, system: null }, warnings: [] }),
  gameName: jsonGameName,
  editor: jsonEditor,
  tree: jsonTree,
  sameData: sameJsonData,
  namedVariables,
};
