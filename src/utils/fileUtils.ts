import { open } from '@tauri-apps/plugin-dialog';
import { exists, open as openFile, readFile, readTextFile, SeekMode, writeFile, writeTextFile } from '@tauri-apps/plugin-fs';

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

export const readBinary = (filePath: string): Promise<Uint8Array> => readFile(filePath);

/** Writes bytes to a file. Throws on failure so callers can report it. */
export const writeBinary = (filePath: string, content: Uint8Array): Promise<void> => writeFile(filePath, content);

export const fileExists = (filePath: string): Promise<boolean> => exists(filePath);

/**
 * Opens a file for random-access reads (e.g. pulling a few entries out of a
 * large archive without loading it). Call `close` when done.
 */
export async function openRandomAccess(filePath: string) {
  const file = await openFile(filePath, { read: true });
  const readAt = async (offset: number, length: number): Promise<Uint8Array> => {
    await file.seek(offset, SeekMode.Start);
    const buffer = new Uint8Array(length);
    let filled = 0;
    while (filled < length) {
      const read = await file.read(buffer.subarray(filled));
      if (read === null || read === 0) break;
      filled += read;
    }
    return buffer.subarray(0, filled);
  };
  return { readAt, close: () => file.close() };
}
