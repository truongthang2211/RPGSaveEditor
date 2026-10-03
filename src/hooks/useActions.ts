import { useCallback } from 'react';
import { toast, ToastOptions } from 'react-toastify';
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

/** Reads and decodes a save; the origin copy is independent from the editable one. */
async function readSave(format: SaveFormat, filePath: string) {
  const { data, meta } = await format.read(filePath);
  return { saveData: data, originSaveData: structuredClone(data), saveMeta: meta };
}

export const useFileUpload = () => {
  const { setContent } = useContent();

  const openFile = useCallback(async (filePath: string) => {
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
  }, [setContent]);

  return useCallback(async () => {
    const filePath = await selectFile(saveFileFilters());
    if (filePath) {
      await openFile(filePath);
    }
  }, [openFile]);
};

export const useReload = () => {
  const { content, setContent } = useContent();

  return useCallback(async () => {
    if (!content.filePath) return;
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
  }, [content.filePath, content.format, setContent]);
};

export const useSave = () => {
  const { content } = useContent();

  return useCallback(async () => {
    const { filePath, format, saveData, saveMeta } = content;
    if (!filePath || !format || !saveData) return;
    try {
      await format.write(filePath, { data: saveData, meta: saveMeta });
      successNotify('File Saved!');
    } catch (error) {
      errorNotify(`Error Saving File! \n${error}`);
    }
  }, [content]);
};
