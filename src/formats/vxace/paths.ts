import { hasExtension, pathSegments } from '../../utils/path';

export const VXACE_EXTENSIONS = ['rvdata2'] as const;

/** Save folders some games use instead of the game root. */
const SAVE_DIRS = ['save', 'saves', 'savedata', 'userdata'];

/** Database files are .rvdata2 too; only SaveNN-style files are saves. */
const DATABASE_FILES = [
  'actors', 'classes', 'skills', 'items', 'weapons', 'armors', 'enemies', 'troops', 'states',
  'animations', 'tilesets', 'commonevents', 'system', 'mapinfos', 'scripts',
];

export function isVxAceSavePath(filePath: string): boolean {
  if (!hasExtension(filePath, VXACE_EXTENSIONS)) return false;
  const baseName = (pathSegments(filePath).pop() ?? '').toLowerCase().replace(/\.rvdata2$/, '');
  return !DATABASE_FILES.includes(baseName) && !/^map\d+$/.test(baseName);
}

/** Folder that holds the save: the game root, or a Save/ subfolder inside it. */
export function isSaveSubfolder(folderName: string): boolean {
  return SAVE_DIRS.includes(folderName.toLowerCase());
}

/**
 * Game folder name: VX Ace writes <Game>/SaveNN.rvdata2; some games use
 * <Game>/Save/SaveNN.rvdata2.
 */
export function vxaceGameName(filePath: string): string | null {
  const parts = pathSegments(filePath);
  parts.pop(); // SaveNN.rvdata2
  let folder = parts.pop();
  if (folder && isSaveSubfolder(folder)) folder = parts.pop();
  return folder || null;
}
