import { FileFilter } from '../utils/fileUtils';
import { mvmzFormat } from './mvmz';
import { vxaceFormat } from './vxace';
import { vxFormat } from './vx';
import { xpFormat } from './xp';
import { renpyFormat } from './renpy';
import { SaveFormat } from './types';

export * from './types';

/** Every supported save format. Add new formats here. */
export const SAVE_FORMATS: readonly SaveFormat[] = [mvmzFormat, vxaceFormat, vxFormat, xpFormat, renpyFormat];

export function findFormat(filePath: string): SaveFormat | undefined {
  return SAVE_FORMATS.find((format) => format.matches(filePath));
}

export function supportedExtensionsText(): string {
  return SAVE_FORMATS.flatMap((format) => format.extensions.map((ext) => `.${ext}`)).join(', ');
}

/** "All supported" first, then one entry per format. */
export function saveFileFilters(): FileFilter[] {
  return [
    { name: 'RPG Maker Save Files', extensions: SAVE_FORMATS.flatMap((format) => [...format.extensions]) },
    ...SAVE_FORMATS.map((format) => ({ name: format.label, extensions: [...format.extensions] })),
  ];
}
