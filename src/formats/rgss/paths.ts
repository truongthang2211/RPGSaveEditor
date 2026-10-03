import { hasExtension, pathSegments } from '../../utils/path';

/** Save folders some games use instead of the game root. */
const SAVE_DIRS = ['save', 'saves', 'savedata', 'userdata'];

/** Database files share the save extension; only SaveNN-style files are saves. */
const DATABASE_FILES = [
  'actors', 'classes', 'skills', 'items', 'weapons', 'armors', 'enemies', 'troops', 'states',
  'animations', 'tilesets', 'commonevents', 'system', 'mapinfos', 'scripts', 'areas',
];

/** True for an RGSS save with the given extension (rxdata, rvdata or rvdata2). */
export function isRgssSavePath(filePath: string, extension: string): boolean {
  if (!hasExtension(filePath, [extension])) return false;
  const baseName = (pathSegments(filePath).pop() ?? '').toLowerCase().slice(0, -(extension.length + 1));
  return !DATABASE_FILES.includes(baseName) && !/^map\d+$/.test(baseName);
}

export function isSaveSubfolder(folderName: string): boolean {
  return SAVE_DIRS.includes(folderName.toLowerCase());
}

/**
 * Game folder name: RGSS games write <Game>/SaveN.<ext>; some use
 * <Game>/Save/SaveN.<ext>.
 */
export function rgssGameName(filePath: string): string | null {
  const parts = pathSegments(filePath);
  parts.pop(); // SaveN.<ext>
  let folder = parts.pop();
  if (folder && isSaveSubfolder(folder)) folder = parts.pop();
  return folder || null;
}
