import { dirname, join } from '@tauri-apps/api/path';
import { fileExists, openRandomAccess, readBinary, writeBinary } from '../../utils/fileUtils';
import { fileNameFromPath } from '../../utils/path';
import { readMarshal, readMarshalStream } from '../marshal/reader';
import { writeMarshalStream } from '../marshal/writer';
import { findEntry, readRgss3aFile, readRgss3aIndex } from '../rgss/archive';
import { GameDatabase, SaveFormat } from '../types';
import { toDatabaseEntries, toSystemData } from './database';
import { VxAceSave, vxaceEditor } from './editor';
import { isSaveSubfolder, isVxAceSavePath, VXACE_EXTENSIONS, vxaceGameName } from './paths';

/** <Game>/ (save in the game root) or <Game>/ above a Save/ subfolder. */
async function gameDir(savePath: string): Promise<string> {
  const saveDir = await dirname(savePath);
  return isSaveSubfolder(fileNameFromPath(saveDir)) ? dirname(saveDir) : saveDir;
}

/** Reads Data/<name>.rvdata2 from wherever the game keeps it; null if absent. */
type DataSource = (name: string) => Promise<Uint8Array | null>;

const DATA_FILES = ['Items', 'Weapons', 'Armors', 'System'] as const;

async function loadDatabaseFrom(source: DataSource, warnings: string[]): Promise<GameDatabase> {
  const load = async <T>(name: (typeof DATA_FILES)[number], convert: (value: any) => T): Promise<T | null> => {
    try {
      const bytes = await source(name);
      return bytes ? convert(readMarshal(bytes)) : null;
    } catch (error) {
      warnings.push(`Failed to load ${name}.rvdata2: ${error}`);
      return null;
    }
  };
  return {
    items: await load('Items', toDatabaseEntries),
    weapons: await load('Weapons', toDatabaseEntries),
    armors: await load('Armors', toDatabaseEntries),
    system: await load('System', toSystemData),
  };
}

const isEmpty = (database: GameDatabase) => !database.items && !database.weapons && !database.armors && !database.system;

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

    // 1) Unpacked Data/ folder next to Game.exe.
    const dataDir = await join(root, 'Data');
    const database = await loadDatabaseFrom(async (name) => {
      const path = await join(dataDir, `${name}.rvdata2`);
      return (await fileExists(path)) ? readBinary(path) : null;
    }, warnings);
    if (!isEmpty(database)) return { database, warnings };

    // 2) Encrypted Game.rgss3a: read only the index and these four entries.
    const archivePath = await join(root, 'Game.rgss3a');
    if (await fileExists(archivePath)) {
      const archive = await openRandomAccess(archivePath);
      try {
        const entries = await readRgss3aIndex(archive.readAt);
        const packed = await loadDatabaseFrom(async (name) => {
          const entry = findEntry(entries, `Data/${name}.rvdata2`);
          return entry ? readRgss3aFile(archive.readAt, entry) : null;
        }, warnings);
        if (!isEmpty(packed)) return { database: packed, warnings };
        warnings.push('Game.rgss3a has no database files: showing IDs only.');
      } catch (error) {
        warnings.push(`Could not read Game.rgss3a (${error}): showing IDs only.`);
      } finally {
        await archive.close();
      }
      return { database, warnings };
    }

    warnings.push(`Game data not found in ${dataDir}: showing IDs only.`);
    return { database, warnings };
  },

  gameName: vxaceGameName,
  editor: vxaceEditor,
};
