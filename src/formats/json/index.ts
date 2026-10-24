import { readBinary, writeBinary } from '../../utils/fileUtils';
import { readSetting, writeSetting } from '../../utils/storage';
import { fileNameFromPath, hasExtension, pathSegments } from '../../utils/path';
import { NamedVariable, SaveEditor, SaveFormat, TreeNode } from '../types';
import { naninovelVariables } from './naninovel';
import { JsonSave, looksLikeJsonBytes, parseJsonBytes, sameJsonData, serializeJsonBytes } from './save';
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
  // Strips whatever extension the file has (not just .json/.es3/.nson): detection isn't limited to those.
  return folder || fileNameFromPath(filePath).replace(/\.[^./\\]+$/, '') || null;
}

const PASSWORDS_KEY = 'es3Passwords';
const MAX_PASSWORDS = 10;

/** Passwords that opened saves before, the latest first (games reuse one password for all their saves). */
function rememberedPasswords(): string[] {
  try {
    const list = JSON.parse(readSetting(PASSWORDS_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((word): word is string => typeof word === 'string') : [];
  } catch {
    return [];
  }
}

function rememberPassword(password: string) {
  const list = [password, ...rememberedPasswords().filter((word) => word !== password)].slice(0, MAX_PASSWORDS);
  writeSetting(PASSWORDS_KEY, JSON.stringify(list));
}

const isLeaf = (node: TreeNode) => !node.hasChildren && node.editable !== undefined;

/**
 * How many nested objects deep to follow from each top-level key, so a
 * `Dictionary<id, SomeData>` (an object of objects, by ID: `costData.1.HaveAmount`)
 * is reached but whatever is nested under that isn't. Keeps Variables a short
 * list even for a save with many, deeply nested sections; the rest is in Advanced.
 */
const MAX_DEPTH = 2;

/**
 * A top-level key that would add more than this many variables is left out
 * of the list entirely (not cut off partway through): a `Dictionary` this
 * big is usually a catalogue of game content (every item, every event...),
 * not save state worth listing one by one. It stays browsable in Advanced.
 */
const MAX_PER_SECTION = 100;

function collectVariables(save: JsonSave, node: TreeNode, name: string, depth: number, result: NamedVariable[]): void {
  if (isLeaf(node)) {
    result.push({ name, node });
    return;
  }
  if (depth <= 0 || (node.type !== 'Object' && node.type !== 'JSON text')) return;

  const fields = jsonTree.children(save, node);
  const wrapped = fields.some((field) => field.key === '__type') ? fields.find((field) => field.key === 'value') : undefined;
  if (wrapped) {
    // `{ "__type": "...", "value": 5 }` or `{ "__type": "...", "value": { "hp": 50 } }`:
    // the type marker is not a variable, and the value keeps the outer key as its name
    // (not Easy Save's wrapper's own "value" key), without using up a level of depth.
    collectVariables(save, wrapped, name, depth, result);
    return;
  }
  for (const field of fields) {
    if (field.key !== '__type') collectVariables(save, field, `${name}.${field.key}`, depth - 1, result);
  }
}

/**
 * The values of the save by name: the top-level numbers, text and true/false
 * values (`day`), those of the objects directly under it (`kitchen.beer`),
 * and the Dictionary-by-ID pattern games often use one level under that
 * (`costData.1.HaveAmount`) — but not a key whose Dictionary turns out to
 * have too many entries to be worth listing one by one (see MAX_PER_SECTION).
 * Everything deeper, and every such oversized key, is in Advanced instead.
 *
 * Some games (Utage's save system, for one) keep a part of the save as JSON
 * inside a string instead of a nested object (`"playerData": "{\"hp\":50}"`).
 * The document reader already parses that embedded JSON, so it's treated the
 * same as a real object here: its fields are listed the same way.
 */
function namedVariables(save: JsonSave): NamedVariable[] {
  const naninovel = naninovelVariables(save);
  if (naninovel) return naninovel;
  const result: NamedVariable[] = [];
  for (const node of jsonTree.roots(save)) {
    const section: NamedVariable[] = [];
    collectVariables(save, node, node.key, MAX_DEPTH, section);
    if (section.length <= MAX_PER_SECTION) result.push(...section);
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
  hint: 'Plain .json saves from games written in JavaScript, Unity .es3 saves (a password is asked for when they are encrypted), Unity saves with a game-specific hand-rolled encryption, Naninovel .json/.nson saves, and other plain-JSON saves under a game-specific extension (recognised by their content).',
  extensions: JSON_EXTENSIONS,
  matches: (filePath) => hasExtension(filePath, JSON_EXTENSIONS),
  // A save kept as plain JSON text under some other extension (no compression, no encryption): this is the
  // fallback format for that, tried only once no extension matches any format (see detectFormat).
  sniff: looksLikeJsonBytes,
  pages: ['Variables', 'Advanced'],

  async read(filePath, options) {
    const data = await parseJsonBytes(await readBinary(filePath), { password: options?.password, filePath, remembered: rememberedPasswords() });
    if (data.password !== undefined) rememberPassword(data.password);
    return { data };
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
