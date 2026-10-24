import { FileFilter, readBinary } from '../utils/fileUtils';
import { mvmzFormat } from './mvmz';
import { vxaceFormat } from './vxace';
import { vxFormat } from './vx';
import { xpFormat } from './xp';
import { renpyFormat } from './renpy';
import { sugarcubeFormat } from './sugarcube';
import { jsonFormat } from './json';
import { rm2kFormat } from './rm2k';
import { wolfFormat } from './wolf';
import { SaveFormat } from './types';

export * from './types';

/** Every supported save format. Add new formats here. */
export const SAVE_FORMATS: readonly SaveFormat[] = [mvmzFormat, vxaceFormat, vxFormat, xpFormat, renpyFormat, sugarcubeFormat, wolfFormat, jsonFormat, rm2kFormat];

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
 * Ren'Py and SugarCube), the file's content decides. When no format's
 * extension matches at all (a game's own extension for an otherwise plain
 * save), every format's `sniff` gets a chance at the content too, instead
 * of listing every such extension here.
 */
export async function detectFormat(filePath: string): Promise<SaveFormat | undefined> {
  const candidates = SAVE_FORMATS.filter((format) => format.matches(filePath));
  if (candidates.length === 1) return candidates[0];
  const bytes = await readBinary(filePath);
  if (candidates.length > 1) return candidates.find((format) => format.sniff?.(bytes)) ?? candidates[0];
  return SAVE_FORMATS.find((format) => format.sniff?.(bytes));
}

const allExtensions = () => [...new Set(SAVE_FORMATS.flatMap((format) => format.extensions))];

export function supportedExtensionsText(): string {
  return allExtensions().map((ext) => `.${ext}`).join(', ');
}

/**
 * "All supported" first, then one entry per format, then "All Files":
 * detectFormat() can recognise a plain-JSON save under a game's own
 * extension by its content, but the open dialog still filters by
 * extension, so that file needs "All Files" picked to even show up.
 */
export function saveFileFilters(): FileFilter[] {
  return [
    { name: 'Supported Save Files', extensions: allExtensions() },
    ...SAVE_FORMATS.map((format) => ({ name: format.label, extensions: [...format.extensions] })),
    { name: 'All Files', extensions: ['*'] },
  ];
}
