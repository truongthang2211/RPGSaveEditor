import { fileNameFromPath, hasExtension, pathSegments } from '../../utils/path';

export const MVMZ_EXTENSIONS = ['rpgsave', 'rmmzsave'] as const;

/** Non-game files that share the save extension (save-slot index and options). */
const NON_GAME_SAVES = ['global', 'config'];

export function isMvMzSavePath(filePath: string): boolean {
  if (!hasExtension(filePath, MVMZ_EXTENSIONS)) return false;
  const baseName = fileNameFromPath(filePath).toLowerCase().replace(/\.[^.]+$/, '');
  return !NON_GAME_SAVES.includes(baseName);
}

/**
 * Game folder name from the save path:
 * MV: <Game>/www/save/file1.rpgsave, MZ: <Game>/save/file1.rmmzsave.
 */
export function mvmzGameName(filePath: string): string | null {
  const parts = pathSegments(filePath);
  parts.pop(); // file1.rpgsave / file1.rmmzsave
  parts.pop(); // save
  let gameName = parts.pop(); // www (MV) or game folder (MZ)
  if (gameName?.toLowerCase() === 'www') {
    gameName = parts.pop();
  }
  return gameName || null;
}
