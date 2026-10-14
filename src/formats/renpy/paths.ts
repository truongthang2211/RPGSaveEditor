import { fileNameFromPath, hasExtension, pathSegments } from '../../utils/path';

export const RENPY_EXTENSIONS = ['save'] as const;

/** Ren'Py saves: 1-1-LT1.save, auto-1-LT1.save, quick-1-LT1.save... (any .save; reading checks the content). */
export const isRenpySavePath = (filePath: string) => hasExtension(filePath, RENPY_EXTENSIONS);

/** Ren'Py's "persistent" file (no extension) next to the saves. */
export function renpyNotASave(filePath: string): string | null {
  if (fileNameFromPath(filePath).toLowerCase() !== 'persistent') return null;
  return "persistent holds data Ren'Py shares between saves, not a save. Open a .save file such as 1-1-LT1.save.";
}

/**
 * Game name from the save path:
 * <Game>/game/saves/1-1-LT1.save, or the per-user copy
 * %APPDATA%/RenPy/<save_directory>/1-1-LT1.save, where save_directory is
 * usually "<GameName>-<number>".
 */
export function renpyGameName(filePath: string): string | null {
  const parts = pathSegments(filePath);
  if (!fileNameFromPath(filePath)) return null;
  parts.pop(); // the save file
  const folder = parts.pop();
  if (!folder) return null;
  if (folder.toLowerCase() === 'saves' && parts[parts.length - 1]?.toLowerCase() === 'game') {
    parts.pop(); // game
    return parts.pop() || null;
  }
  return folder.replace(/-\d+$/, '') || null;
}
