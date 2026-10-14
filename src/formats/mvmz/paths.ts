import { fileNameFromPath, hasExtension, pathSegments } from '../../utils/path';

export const MVMZ_EXTENSIONS = ['rpgsave', 'rmmzsave'] as const;

/** Non-game files that share the save extension (save-slot index and options). */
const NON_GAME_SAVES = ['global', 'config'];

const baseName = (filePath: string) => fileNameFromPath(filePath).toLowerCase().replace(/\.[^.]+$/, '');

export function isMvMzSavePath(filePath: string): boolean {
  return hasExtension(filePath, MVMZ_EXTENSIONS) && !NON_GAME_SAVES.includes(baseName(filePath));
}

/** global.rpgsave / config.rmmzsave...: the save-slot list and the options, not saves. */
export function isMvMzSettingsPath(filePath: string): boolean {
  return hasExtension(filePath, MVMZ_EXTENSIONS) && NON_GAME_SAVES.includes(baseName(filePath));
}

export function mvmzNotASave(filePath: string): string | null {
  if (!isMvMzSettingsPath(filePath)) return null;
  const ext = fileNameFromPath(filePath).split('.').pop();
  return `${fileNameFromPath(filePath)} holds the game's settings, not a save. Open a save slot instead (file1.${ext}, file2.${ext}...).`;
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
