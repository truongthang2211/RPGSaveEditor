import { FileFilter, readBinary } from '../utils/fileUtils';
import { mvmzFormat } from './mvmz';
import { vxaceFormat } from './vxace';
import { vxFormat } from './vx';
import { xpFormat } from './xp';
import { renpyFormat } from './renpy';
import { sugarcubeFormat } from './sugarcube';
import { jsonFormat } from './json';
import { SaveFormat } from './types';

export * from './types';

/** Every supported save format. Add new formats here. */
export const SAVE_FORMATS: readonly SaveFormat[] = [mvmzFormat, vxaceFormat, vxFormat, xpFormat, renpyFormat, sugarcubeFormat, jsonFormat];

export function findFormat(filePath: string): SaveFormat | undefined {
  return SAVE_FORMATS.find((format) => format.matches(filePath));
}

/** Why `filePath` can't be opened when it belongs to a game but isn't a save (see SaveFormat.notASave). */
export function notASaveReason(filePath: string): string | null {
  for (const format of SAVE_FORMATS) {
    const reason = format.notASave?.(filePath);
    if (reason) return reason;
  }
  return null;
}

/**
 * The format of a save file. When several formats use its extension (.save:
 * Ren'Py and SugarCube), the file's content decides.
 */
export async function detectFormat(filePath: string): Promise<SaveFormat | undefined> {
  const candidates = SAVE_FORMATS.filter((format) => format.matches(filePath));
  if (candidates.length <= 1) return candidates[0];
  const bytes = await readBinary(filePath);
  return candidates.find((format) => format.sniff?.(bytes)) ?? candidates[0];
}

const allExtensions = () => [...new Set(SAVE_FORMATS.flatMap((format) => format.extensions))];

export function supportedExtensionsText(): string {
  return allExtensions().map((ext) => `.${ext}`).join(', ');
}

/** "All supported" first, then one entry per format. */
export function saveFileFilters(): FileFilter[] {
  return [
    { name: 'Supported Save Files', extensions: allExtensions() },
    ...SAVE_FORMATS.map((format) => ({ name: format.label, extensions: [...format.extensions] })),
  ];
}
