import { dirname, join } from '@tauri-apps/api/path';
import { fileExists, readText, writeText } from '../../utils/fileUtils';
import { GameDatabase, SaveFormat } from '../types';
import { decodeRpgsave, encodeRpgsave, MvMzSave, preferredCodecForPath, SaveCodec } from './codec';
import { mvmzEditor } from './editor';
import { isMvMzSavePath, MVMZ_EXTENSIONS, mvmzGameName } from './paths';

/** data/<name>.json next to save/: <Game>/www/data (MV) or <Game>/data (MZ). */
async function dataFilePath(savePath: string, name: string): Promise<string> {
  const gameOrWwwDir = await dirname(await dirname(savePath));
  return join(gameOrWwwDir, 'data', `${name}.json`);
}

async function loadJson(savePath: string, name: string, warnings: string[]): Promise<any | null> {
  let path: string;
  try {
    path = await dataFilePath(savePath, name);
    if (!(await fileExists(path))) {
      warnings.push(`Missing JSON file: ${path}`);
      return null;
    }
  } catch (error) {
    warnings.push(`Could not get JSON path: ${name}.json`);
    console.error('Failed to locate', name, error);
    return null;
  }

  try {
    const text = (await readText(path))
      .replace(/^﻿/, '') // BOM
      .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F]/g, ''); // control chars except \t \n \r
    return JSON.parse(text);
  } catch (error) {
    warnings.push(`Failed to load JSON data from ${name}: ${error}`);
    return null;
  }
}

export const mvmzFormat: SaveFormat<MvMzSave> = {
  id: 'mvmz',
  label: 'RPG Maker MV/MZ',
  extensions: MVMZ_EXTENSIONS,
  matches: isMvMzSavePath,

  async read(filePath) {
    const { data, codec } = await decodeRpgsave(await readText(filePath), preferredCodecForPath(filePath));
    return { data, meta: codec };
  },

  async write(filePath, { data, meta }) {
    const codec = (meta as SaveCodec | undefined) ?? preferredCodecForPath(filePath);
    await writeText(filePath, await encodeRpgsave(JSON.stringify(data), codec));
  },

  async loadDatabase(savePath) {
    const warnings: string[] = [];
    const database: GameDatabase = {
      items: await loadJson(savePath, 'Items', warnings),
      system: await loadJson(savePath, 'System', warnings),
      weapons: await loadJson(savePath, 'Weapons', warnings),
      armors: await loadJson(savePath, 'Armors', warnings),
    };
    return { database, warnings };
  },

  gameName: mvmzGameName,
  editor: mvmzEditor,
};
