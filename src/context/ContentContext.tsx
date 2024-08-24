import React, { createContext, useState, ReactNode } from 'react';

// Define interfaces for Content and ContentContext
export interface ContentType {
  saveData?: any;
  originSaveData?: any;
  oldSaveData?: any;
  itemData?: any;
  weaponsData?: any;
  armorsData?: any;
  systemData?: any;
  filePath?: string;
  fileName?: string;
  gameName?: string;
}

interface ContentContextType {
  content: ContentType | any;
  setContent: (content: ContentType | any) => void;
}

// Create a Context with undefined default value
const ContentContext = createContext<ContentContextType | undefined>(undefined);

// Create a Provider component
const ContentProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Initialize state with undefined content
  const [content, setContent] = useState<ContentType>({});

  // Provide the context value with the current state and updater function
  const value = { content, setContent };

  return (
    <ContentContext.Provider value={value}>
      {children}
    </ContentContext.Provider>
  );
};

// Create a custom hook to use the ContentContext
const useContent = (): ContentContextType => {
  const context = React.useContext(ContentContext);
  if (context === undefined) {
    throw new Error('useContent must be used within a ContentProvider');
  }
  return context;
};

export { ContentProvider, useContent };
