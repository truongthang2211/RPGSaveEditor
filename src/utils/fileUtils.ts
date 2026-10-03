import { open } from '@tauri-apps/plugin-dialog';
import { exists, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';

export interface FileFilter {
  name: string;
  extensions: string[];
}

/** Opens the native "open file" dialog; resolves to the chosen path or null if cancelled. */
export async function selectFile(filters: FileFilter[]): Promise<string | null> {
  const filePath = await open({ multiple: false, filters });
  return filePath as string | null;
}

export const readText = (filePath: string): Promise<string> => readTextFile(filePath);

/** Writes text to a file. Throws on failure so callers can report it. */
export const writeText = (filePath: string, content: string): Promise<void> => writeTextFile(filePath, content);

export const fileExists = (filePath: string): Promise<boolean> => exists(filePath);
