import { useCallback } from 'react';
import { toast, ToastOptions } from 'react-toastify';
import { confirm } from '@tauri-apps/plugin-dialog';
import { useContent } from '../context/ContentContext';
import { findFormat, saveFileFilters, SaveFormat, supportedExtensionsText } from '../formats';
import { selectFile } from '../utils/fileUtils';
import { fileNameFromPath } from '../utils/path';

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

function formatFor(filePath: string): SaveFormat {
  const format = findFormat(filePath);
  if (!format) {
    throw new Error(`Invalid file type! Please upload a ${supportedExtensionsText()} file.`);
  }
  return format;
}

/**
 * Reads and decodes a save. Editors never mutate a save (setters return a new
 * one), so the loaded data can serve as both the editable save and the origin.
 */
async function readSave(format: SaveFormat, filePath: string) {
  const { data, meta } = await format.read(filePath);
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
      const format = formatFor(filePath);
      const loaded = await readSave(format, filePath);
      const { database, warnings } = await format.loadDatabase(filePath);
      warnings.forEach(warningNotify);

      let gameName = format.gameName(filePath);
      if (!gameName) {
        warningNotify('Could not determine game name from file path.');
        gameName = 'Unknown Game';
      }

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
      const loaded = await readSave(content.format ?? formatFor(content.filePath), content.filePath);
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
    } catch (error) {
      errorNotify(`Error Saving File! \n${error}`);
    }
  }, [content, setContent]);
};
