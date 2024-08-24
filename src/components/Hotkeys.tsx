import React, { ReactNode } from 'react';
import { HotKeys, KeyMap } from 'react-hotkeys';
import { useFileUpload, useReload, useSave } from '../hooks/useActions';

const keyMap: KeyMap = {
  UPLOAD_FILE: 'ctrl+o',
  RELOAD: 'ctrl+r',
  SAVE: 'ctrl+s',
};

const Hotkeys: React.FC<{ children: ReactNode }> = ({ children }) => {
  const uploadFile = useFileUpload();
  const reload = useReload();
  const save = useSave();
  const handlers = {
    UPLOAD_FILE: (event?: KeyboardEvent) => {
      
      event?.preventDefault();
      uploadFile();
    },
    RELOAD: (event?: KeyboardEvent) => {
      event?.preventDefault();
      reload();
    },
    SAVE: (event?: KeyboardEvent) => {
      event?.preventDefault();
      save();
    },
  };

  return (
    <HotKeys keyMap={keyMap} handlers={handlers}>
      {children}
    </HotKeys>
  );
};

export default Hotkeys;
