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

  const update = useCallback(
    (change: (editor: SaveEditor, save: any) => any) => {
      setContent((prev) =>
        prev.format && prev.saveData
          ? { ...prev, saveData: change(prev.format.editor, prev.saveData) }
          : prev,
      );
    },
    [setContent],
  );

  return {
    editor,
    save: content.saveData,
    origin: content.originSaveData,
    old: content.oldSaveData,
    database: content.database,
    update,
  };
};
