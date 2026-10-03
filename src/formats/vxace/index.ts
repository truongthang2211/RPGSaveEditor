import { dirname, join } from '@tauri-apps/api/path';
import { fileExists, readBinary, writeBinary } from '../../utils/fileUtils';
import { fileNameFromPath } from '../../utils/path';
import { readMarshal, readMarshalStream } from '../marshal/reader';
import { writeMarshalStream } from '../marshal/writer';
import { GameDatabase, SaveFormat } from '../types';
import { toDatabaseEntries, toSystemData } from './database';
import { VxAceSave, vxaceEditor } from './editor';
import { isSaveSubfolder, isVxAceSavePath, VXACE_EXTENSIONS, vxaceGameName } from './paths';

/** <Game>/ (save in the game root) or <Game>/ above a Save/ subfolder. */
async function gameDir(savePath: string): Promise<string> {
  const saveDir = await dirname(savePath);
  return isSaveSubfolder(fileNameFromPath(saveDir)) ? dirname(saveDir) : saveDir;
}

async function loadData<T>(dataDir: string, name: string, convert: (value: any) => T, warnings: string[]): Promise<T | null> {
  const path = await join(dataDir, `${name}.rvdata2`);
  try {
    if (!(await fileExists(path))) return null;
    return convert(readMarshal(await readBinary(path)));
  } catch (error) {
    warnings.push(`Failed to load ${name}.rvdata2: ${error}`);
    return null;
  }
}

export const vxaceFormat: SaveFormat<VxAceSave> = {
  id: 'vxace',
  label: 'RPG Maker VX Ace',
  extensions: VXACE_EXTENSIONS,
  matches: isVxAceSavePath,

  async read(filePath) {
    const dumps = readMarshalStream(await readBinary(filePath));
    if (dumps.length < 2) {
      throw new Error(`Not a VX Ace save: expected header and contents, found ${dumps.length} Marshal dump(s)`);
    }
    return { data: dumps };
  },

  async write(filePath, { data }) {
    await writeBinary(filePath, writeMarshalStream(data));
  },

  async loadDatabase(savePath) {
    const warnings: string[] = [];
    const root = await gameDir(savePath);
    const dataDir = await join(root, 'Data');

    const database: GameDatabase = {
      items: await loadData(dataDir, 'Items', toDatabaseEntries, warnings),
      weapons: await loadData(dataDir, 'Weapons', toDatabaseEntries, warnings),
      armors: await loadData(dataDir, 'Armors', toDatabaseEntries, warnings),
      system: await loadData(dataDir, 'System', toSystemData, warnings),
    };

    if (!database.items && !database.system) {
      const packed = await fileExists(await join(root, 'Game.rgss3a')).catch(() => false);
      warnings.push(
        packed
          ? 'Game data is packed in Game.rgss3a: names are not available, showing IDs only.'
          : `Game data not found in ${dataDir}: showing IDs only.`,
      );
    }
    return { database, warnings };
  },

  gameName: vxaceGameName,
  editor: vxaceEditor,
};
