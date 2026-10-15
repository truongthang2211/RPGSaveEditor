import { readBinary, writeBinary } from '../../utils/fileUtils';
import { hasExtension, pathSegments } from '../../utils/path';
import { SaveEditor, SaveFormat } from '../types';
import { normalVariables, parseWolfSave, sameWolfData, serializeWolfSave, setWolfValue, WolfSave, wolfValue } from './save';
import { wolfTree } from './tree';

export const WOLF_EXTENSIONS = ['sav'] as const;

/** Game folder from <Game>/Save/SaveData01.sav. */
export function wolfGameName(filePath: string): string | null {
  const parts = pathSegments(filePath);
  parts.pop(); // SaveData01.sav
  let folder = parts.pop();
  if (folder?.toLowerCase() === 'save') folder = parts.pop();
  return folder || null;
}

const unsupported = (): never => {
  throw new Error('Not available for Wolf RPG Editor saves');
};

/** Wolf RPG games have no standard party/items layout in the save: Variables and Advanced apply. */
const wolfEditor: SaveEditor<WolfSave> = {
  getGold: () => 0,
  setGold: unsupported,
  getInventory: () => ({}),
  setInventoryCount: unsupported,
  getActors: () => [],
  setActorField: unsupported,
  setActorParamPlus: unsupported,
  getSwitches: () => [],
  setSwitch: unsupported,
  getVariables: (save) => Object.fromEntries(normalVariables(save).map((node, id) => [id, wolfValue(save, node)])),
  setVariable: (save, id, value) => {
    const node = normalVariables(save)[id];
    if (!node) throw new Error(`No variable ${id} in this save`);
    return setWolfValue(save, node, Number(value));
  },
  firstVariableId: 0,
  integerVariables: true,
};

export const wolfFormat: SaveFormat<WolfSave> = {
  id: 'wolf',
  label: 'Wolf RPG Editor',
  hint: "SaveData01.sav... in the game's Save folder. Variables have no names: compare two saves to find one.",
  extensions: WOLF_EXTENSIONS,
  matches: (filePath) => hasExtension(filePath, WOLF_EXTENSIONS),
  pages: ['Variables', 'Advanced'],

  async read(filePath) {
    return { data: parseWolfSave(await readBinary(filePath)) };
  },

  async write(filePath, { data }) {
    await writeBinary(filePath, serializeWolfSave(data));
  },

  loadDatabase: async () => ({ database: { items: null, weapons: null, armors: null, system: null }, warnings: [] }),
  gameName: wolfGameName,
  editor: wolfEditor,
  tree: wolfTree,
  sameData: sameWolfData,
};
