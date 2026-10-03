import React, { createContext, useState, ReactNode } from 'react';
import { GameDatabase, SaveFormat } from '../formats';

export interface ContentType {
  /** Format of the open file; its `editor` reads/writes the save data below. */
  format?: SaveFormat;
  /** Current, edited save. */
  saveData?: any;
  /** Save as loaded from disk (for "GAP" comparisons and reload). */
  originSaveData?: any;
  /** Previously loaded save of the same game (for "Old" columns). */
  oldSaveData?: any;
  /** Format-specific details needed to write the file back. */
  saveMeta?: unknown;
  database?: GameDatabase;
  filePath?: string;
  fileName?: string;
  gameName?: string;
}

interface ContentContextType {
  content: ContentType;
  setContent: React.Dispatch<React.SetStateAction<ContentType>>;
}

const ContentContext = createContext<ContentContextType | undefined>(undefined);

const ContentProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [content, setContent] = useState<ContentType>({});

  return (
    <ContentContext.Provider value={{ content, setContent }}>
      {children}
    </ContentContext.Provider>
  );
};

const useContent = (): ContentContextType => {
  const context = React.useContext(ContentContext);
  if (context === undefined) {
    throw new Error('useContent must be used within a ContentProvider');
  }
  return context;
};

export { ContentProvider, useContent };
