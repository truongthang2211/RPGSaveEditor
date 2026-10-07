import { useCallback } from 'react';
import { useContent } from '../context/ContentContext';
import { SaveEditor } from '../formats';

/**
 * The open save (current, as loaded, and previous) plus its format's editor.
 * `update` applies an editor setter to the current save.
 */
export const useSaveEditor = () => {
  const { content, setContent } = useContent();
  const editor = content.format?.editor;

  /** Applies any save -> save change (e.g. the Advanced tree's setValue). */
  const updateSave = useCallback(
    (change: (save: any) => any) => {
      setContent((prev) => {
        if (!prev.saveData) return prev;
        const saveData = change(prev.saveData);
        // Unsaved until the data matches the file again (e.g. every edit undone).
        const same = prev.format?.sameData && prev.originSaveData && prev.format.sameData(saveData, prev.originSaveData);
        return { ...prev, saveData, dirty: !same };
      });
    },
    [setContent],
  );

  const update = useCallback(
    (change: (editor: SaveEditor, save: any) => any) =>
      setContent((prev) => {
        if (!prev.format || !prev.saveData) return prev;
        const saveData = change(prev.format.editor, prev.saveData);
        const same = prev.format.sameData && prev.originSaveData && prev.format.sameData(saveData, prev.originSaveData);
        return { ...prev, saveData, dirty: !same };
      }),
    [setContent],
  );

  return {
    format: content.format,
    tree: content.format?.tree,
    editor,
    save: content.saveData,
    origin: content.originSaveData,
    old: content.oldSaveData,
    database: content.database,
    update,
    updateSave,
  };
};
