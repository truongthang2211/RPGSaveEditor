import { dirname, join } from '@tauri-apps/api/path';
import { fileExists, openRandomAccess, readBinary } from '../../utils/fileUtils';
import { fileNameFromPath } from '../../utils/path';
import { readMarshal } from '../marshal/reader';
import { DatabaseResult, GameDatabase } from '../types';
import { findEntry, readArchiveFile, readArchiveIndex } from './archive';
import { toDatabaseEntries, toSystemData } from './database';
import { isSaveSubfolder } from './paths';

export interface RgssDataLayout {
  /** Extension of the database files: rxdata, rvdata or rvdata2. */
  extension: string;
  /** Encrypted archive name: Game.rgssad, Game.rgss2a or Game.rgss3a. */
  archive: string;
}

/** Reads Data/<name>.<ext> from wherever the game keeps it; null if absent. */
type DataSource = (name: string) => Promise<Uint8Array | null>;

const DATA_FILES = ['Items', 'Weapons', 'Armors', 'System'] as const;

/** <Game>/ (save in the game root) or <Game>/ above a Save/ subfolder. */
async function gameDir(savePath: string): Promise<string> {
  const saveDir = await dirname(savePath);
  return isSaveSubfolder(fileNameFromPath(saveDir)) ? dirname(saveDir) : saveDir;
}

async function loadFrom(source: DataSource, extension: string, warnings: string[]): Promise<GameDatabase> {
  const load = async <T>(name: (typeof DATA_FILES)[number], convert: (value: any) => T): Promise<T | null> => {
    try {
      const bytes = await source(name);
      return bytes ? convert(readMarshal(bytes)) : null;
    } catch (error) {
      warnings.push(`Failed to load ${name}.${extension}: ${error}`);
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

/**
 * Item/weapon/armor/switch/variable names for an RGSS save: from the game's
 * Data/ folder, or else from its encrypted archive (only the index and these
 * four entries are read, in memory).
 */
export async function loadRgssDatabase(savePath: string, { extension, archive }: RgssDataLayout): Promise<DatabaseResult> {
  const warnings: string[] = [];
  const root = await gameDir(savePath);

  const dataDir = await join(root, 'Data');
  const database = await loadFrom(async (name) => {
    const path = await join(dataDir, `${name}.${extension}`);
    return (await fileExists(path)) ? readBinary(path) : null;
  }, extension, warnings);
  if (!isEmpty(database)) return { database, warnings };

  const archivePath = await join(root, archive);
  if (!(await fileExists(archivePath))) {
    warnings.push(`Game data not found in ${dataDir}: showing IDs only.`);
    return { database, warnings };
  }

  const file = await openRandomAccess(archivePath);
  try {
    const wanted = DATA_FILES.map((name) => `data/${name}.${extension}`.toLowerCase());
    const entries = await readArchiveIndex(file.readAt, {
      stopWhen: (found) => wanted.every((w) => found.some((e) => e.name.toLowerCase() === w)),
    });
    const packed = await loadFrom(async (name) => {
      const entry = findEntry(entries, `Data/${name}.${extension}`);
      return entry ? readArchiveFile(file.readAt, entry) : null;
    }, extension, warnings);
    if (!isEmpty(packed)) return { database: packed, warnings };
    warnings.push(`${archive} has no database files: showing IDs only.`);
  } catch (error) {
    warnings.push(`Could not read ${archive} (${error}): showing IDs only.`);
  } finally {
    await file.close();
  }
  return { database, warnings };
}
