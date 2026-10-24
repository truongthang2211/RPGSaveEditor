import { useCallback } from 'react';
import { toast, ToastOptions } from 'react-toastify';
import { confirm } from '@tauri-apps/plugin-dialog';
import { useContent } from '../context/ContentContext';
import { detectFormat, notASaveReason, saveFileFilters, SaveFormat, supportedExtensionsText } from '../formats';
import { PasswordRequiredError } from '../formats/json/es3crypto';
import { detectGameFolder, findGamePassword, findGamePasswordQuick, findGamePasswordThorough } from '../formats/json/gameScan';
import { askPassword, showProgress } from '../utils/dialogs';
import { selectFile, selectFolder } from '../utils/fileUtils';
import { fileNameFromPath } from '../utils/path';
import { rememberRecentFile } from '../utils/recentFiles';
import { maybeAskForSupport } from '../components/SupportPrompt';

const toastOptions: ToastOptions = {
  position: 'bottom-right',
  hideProgressBar: true,
  closeOnClick: true,
  pauseOnHover: true,
  draggable: true,
};
const successNotify = (text: string) => toast.success(text, { ...toastOptions, autoClose: 1000 });
const errorNotify = (text: string) => toast.error(text, { ...toastOptions, autoClose: 4000 });
const warningNotify = (text: string) => toast.warn(text, { ...toastOptions, autoClose: 4000 });

async function formatFor(filePath: string): Promise<SaveFormat> {
  const format = await detectFormat(filePath);
  if (!format) {
    const reason = notASaveReason(filePath);
    if (reason) throw new Error(reason);
    throw new Error(`Invalid file type! Please upload a ${supportedExtensionsText()} file.`);
  }
  return format;
}

/** Runs a password search under a progress dialog with a Stop button; returns the password found, if any. */
async function runScan(
  message: string,
  scan: (progress: { signal: AbortSignal; onProgress: (progress: { tried: number; file: string; total?: number }) => void }) => Promise<string | null>,
  { silent = false } = {},
): Promise<string | undefined> {
  const progress = showProgress('Looking for the password', 'Stop', message);
  try {
    const found = await scan({
      signal: progress.signal,
      onProgress: ({ tried, file, total }) =>
        progress.update(`Looking for the password… ${total ? `${Math.floor((tried / total) * 100)}%` : `${tried.toLocaleString('en-US')} words tried`} (${file}).`),
    });
    if (found !== null) successNotify('Password found!');
    else if (!silent && !progress.signal.aborted) errorNotify('The password is not in those files. Enter it by hand if you know it.');
    return found ?? undefined;
  } finally {
    progress.close();
  }
}

/**
 * The fast pass alone (single constants): reads `folder`'s game files once,
 * keeping what it read so a later, slower `thoroughScan` doesn't read them
 * again. Quiet when it finds nothing, since the password dialog explains that.
 */
async function quickScan(savePath: string, folder: string) {
  const progress = showProgress('Looking for the password', 'Stop', 'Looking for the password in the game files…');
  try {
    const result = await findGamePasswordQuick(savePath, folder, {
      signal: progress.signal,
      onProgress: ({ tried, file }) => progress.update(`Looking for the password… ${tried.toLocaleString('en-US')} words tried (${file}).`),
    });
    if (result.password !== null) successNotify('Password found!');
    return result;
  } finally {
    progress.close();
  }
}

/** The slow pass (combinations of two constants) with what a prior `quickScan` read; no file access, so it's not redone. */
const thoroughScan = (save: Uint8Array, pieces: string[]) => runScan('Looking for the password among the game’s constants…', (progress) => findGamePasswordThorough(save, pieces, progress));

/** Both passes in one folder the user picked (nothing read yet to reuse). */
const folderScan = (savePath: string, folder: string) => runScan('Looking for the password in the game files…', (progress) => findGamePassword(savePath, folder, progress));

/** Reads a save; for one protected by a password the app can't find itself, asks for it until it fits or the user cancels. */
async function readAskingPassword(format: SaveFormat, filePath: string) {
  let password: string | undefined;
  // The game's folder, when the save sits inside it: found once, then reused
  // so the user isn't asked to pick it again (nor asked at all, the first time).
  let detectedFolder: string | undefined | null;
  let autoScanned = false;
  // What the quick pass already read, for "Search more thoroughly…" to reuse instead of reading the files again.
  let quickSave: Uint8Array | undefined;
  let quickPieces: string[] | undefined;

  for (;;) {
    try {
      return await format.read(filePath, { password });
    } catch (error) {
      if (!(error instanceof PasswordRequiredError)) throw error;

      if (detectedFolder === undefined) detectedFolder = await detectGameFolder(filePath);
      if (detectedFolder && !autoScanned) {
        autoScanned = true;
        // Runs right away, with its own progress dialog (Stop to type the password instead); no folder to pick.
        const quick = await quickScan(filePath, detectedFolder);
        quickSave = quick.save;
        quickPieces = quick.pieces;
        if (quick.password !== null) {
          password = quick.password;
          continue;
        }
      }

      const answer = await askPassword({
        title: 'Password needed',
        message: detectedFolder
          ? `${error.message} The app looked in the game's own files but didn't find it. Enter the password, or have it search more thoroughly there.`
          : `${error.message} Enter the password to open ${fileNameFromPath(filePath)}, or let the app look for it in the game's files.`,
        okLabel: 'Open',
        cancelLabel: 'Cancel',
        extraLabel: detectedFolder ? 'Search more thoroughly…' : 'Find in game files…',
      });
      if (answer === null) throw new Error('The save was not opened: it needs its password.');
      if (!('extra' in answer)) {
        password = answer.password;
      } else if (detectedFolder && quickSave && quickPieces) {
        password = await thoroughScan(quickSave, quickPieces);
      } else {
        const folder = detectedFolder ?? (await selectFolder());
        password = folder ? await folderScan(filePath, folder) : undefined;
      }
    }
  }
}

/**
 * Reads and decodes a save. Editors never mutate a save (setters return a new
 * one), so the loaded data can serve as both the editable save and the origin.
 */
async function readSave(format: SaveFormat, filePath: string) {
  const { data, meta } = await readAskingPassword(format, filePath);
  return { saveData: data, originSaveData: data, saveMeta: meta, dirty: false };
}

/** Asks before throwing away unsaved edits; true when it's fine to continue. */
export async function confirmDiscard(dirty: boolean | undefined, action: string): Promise<boolean> {
  if (!dirty) return true;
  return confirm(`You have unsaved changes. ${action} anyway and discard them?`, {
    title: 'Unsaved changes',
    kind: 'warning',
    okLabel: 'Discard changes',
    cancelLabel: 'Cancel',
  });
}

/** Opens a save by path (file dialog, drag & drop, ...), asking first if there are unsaved edits. */
export const useOpenPath = () => {
  const { content, setContent } = useContent();

  return useCallback(async (filePath: string, { alreadyConfirmed = false } = {}) => {
    if (!alreadyConfirmed && !(await confirmDiscard(content.dirty, 'Open another file'))) return;
    try {
      const format = await formatFor(filePath);
      const loaded = await readSave(format, filePath);
      const { database, warnings } = await format.loadDatabase(filePath);
      warnings.forEach(warningNotify);

      let gameName = format.gameName(filePath);
      if (!gameName) {
        warningNotify('Could not determine game name from file path.');
        gameName = 'Unknown Game';
      }

      rememberRecentFile(filePath);

      setContent((prev) => ({
        ...prev,
        ...loaded,
        // Keep the previous save for comparison only when it's the same game.
        oldSaveData: gameName === prev.gameName ? prev.originSaveData : undefined,
        format,
        database,
        filePath,
        fileName: fileNameFromPath(filePath),
        gameName,
      }));
    } catch (error) {
      errorNotify(`Error processing file! \n${error}`);
    }
  }, [content.dirty, setContent]);
};

export const useFileUpload = () => {
  const { content } = useContent();
  const openPath = useOpenPath();

  return useCallback(async () => {
    // Ask before the dialog so cancelling doesn't need a second prompt.
    if (!(await confirmDiscard(content.dirty, 'Open another file'))) return;
    const filePath = await selectFile(saveFileFilters());
    if (filePath) {
      await openPath(filePath, { alreadyConfirmed: true });
    }
  }, [content.dirty, openPath]);
};

export const useReload = () => {
  const { content, setContent } = useContent();

  return useCallback(async () => {
    if (!content.filePath) return;
    if (!(await confirmDiscard(content.dirty, 'Reload'))) return;
    try {
      const loaded = await readSave(content.format ?? (await formatFor(content.filePath)), content.filePath);
      setContent((prev) => ({
        ...prev,
        ...loaded,
        oldSaveData: prev.originSaveData,
      }));
      successNotify('File Reloaded!');
    } catch (error) {
      errorNotify(`Error Reloading File Save! \n${error}`);
    }
  }, [content.filePath, content.format, content.dirty, setContent]);
};

export const useSave = () => {
  const { content, setContent } = useContent();

  return useCallback(async () => {
    const { filePath, format, saveData, saveMeta } = content;
    if (!filePath || !format || !saveData) return;
    try {
      await format.write(filePath, { data: saveData, meta: saveMeta });
      // The written data is the new baseline; edits made while writing stay unsaved.
      setContent((prev) => ({
        ...prev,
        originSaveData: saveData,
        dirty: prev.saveData !== saveData,
      }));
      successNotify('File Saved!');
      maybeAskForSupport();
    } catch (error) {
      errorNotify(`Error Saving File! \n${error}`);
    }
  }, [content, setContent]);
};
