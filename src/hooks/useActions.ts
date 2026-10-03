import { useCallback } from 'react';
import { ContentType, useContent } from '../context/ContentContext';
import { readFile, selectFile, writeFile } from '../utils/fileUtils';
import { exists, readTextFile } from '@tauri-apps/plugin-fs';
import { decodeRpgsave, encodeRpgsave, preferredCodecForPath } from '../utils/rpgsaveUtils';
import { fileNameFromPath, isRpgSavePath } from '../utils/saveExtensions';
import { toast } from 'react-toastify';
import { rpgSaveToSaveData } from '../utils/saveDataUtils';
import { dirname, join } from '@tauri-apps/api/path';


export const useFileUpload = () => {
  const { content, setContent } = useContent();

  const handleReadFile = useCallback(async (filePath: string) => {
    try {
      if (!isRpgSavePath(filePath)) {
        return errorNotify('Invalid file type! Please upload a .rpgsave or .rmmzsave file.');
      }
      const fileContent = await readFile(filePath);

      const preferred = preferredCodecForPath(filePath);
      const decoded = await decodeRpgsave(fileContent, preferred);
      const decodedOrigin = await decodeRpgsave(fileContent, decoded.codec);
      const gameName = getNameOfGame(filePath);

      const contentData: ContentType = {
        ...content,
        oldSaveData: gameName !== content?.gameName ? undefined : content?.originSaveData,
        saveData: rpgSaveToSaveData(decoded.data),
        originSaveData: rpgSaveToSaveData(decodedOrigin.data),
        fileName: fileNameFromPath(filePath),
        filePath,
        gameName,
        saveCodec: decoded.codec,
        itemData: await loadJsonData(filePath, 'Items'),
        systemData: await loadJsonData(filePath, 'System'),
        weaponsData: await loadJsonData(filePath, 'Weapons'),
        armorsData: await loadJsonData(filePath, 'Armors'),
      };

      setContent(contentData);
    } catch (error) {
      errorNotify(`Error processing file! \n${error}`);
    }
  }, [content, setContent]);

 const loadJsonData = async (filePath: string, fileName: string) => {
   let path;
   // Check if file exists
   try {
      path = await getJsonFilePath(filePath, fileName);
      const fileExists = await exists(path);
      if (!fileExists) {
        warningNotify(`Missing JSON file: ${path}`);
        return null;
      }
    } catch (e) {
      console.error('Failed to check file existence for', path, e);
      return null;
    }

    try {
      let fileContent = await readTextFile(path);
      
      // Remove BOM if present
      fileContent = fileContent.replace(/^\uFEFF/, '');
      
      // Remove control characters (except newline, tab, carriage return)
      fileContent = fileContent.replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F]/g, '');
      
      return JSON.parse(fileContent);

    } catch (error) {
      console.error('Failed to parse JSON from', fileName);
      warningNotify(`Failed to load JSON data from ${fileName}: ${error}`);
      return null;
    }
  };

  const uploadFile = useCallback(async () => {
    const filePath = await selectFile();
    if (filePath) {
      await handleReadFile(filePath);
    }
  }, [handleReadFile]);

  return uploadFile;
};

export const useReload = () => {
  const { content, setContent } = useContent();

  const handleReadFile = useCallback(async (filePath: string) => {
    try {
      if (!isRpgSavePath(filePath)) {
        return errorNotify('Invalid file type! Please upload a .rpgsave or .rmmzsave file.');
      }
      const fileContent = await readFile(filePath);
      const preferred = preferredCodecForPath(filePath);
      const decoded = await decodeRpgsave(fileContent, preferred);
      const decodedOrigin = await decodeRpgsave(fileContent, decoded.codec);
      setContent((prev: any) => ({
        ...prev,
        oldSaveData: prev?.originSaveData || undefined,
        saveData: rpgSaveToSaveData(decoded.data),
        originSaveData: rpgSaveToSaveData(decodedOrigin.data),
        saveCodec: decoded.codec,
      }));
      successNotify('File Reloaded!');
    } catch (error) {
      errorNotify(`Error Reloading File Save! \n${error}`);
    }
  }, [setContent]);

  const reload = async () => {
    if (content.filePath) {
      await handleReadFile(content.filePath);
    }
    console.log('Reload triggered');
  };

  return reload;
};

export const useSave = () => {
  const { content } = useContent();

  const save = useCallback(async () => {
    try {
      if (content.filePath) {
        const encodedContent = await encodeRpgsave(JSON.stringify(content.saveData), content.saveCodec ?? 'lzstring');
        await writeFile(content.filePath, encodedContent);
        successNotify('File Saved!')
      }
      console.log('Save triggered');
      console.log(content);
    } catch (error) {
      errorNotify('Error Saving File! \n' + error)

    }

  }, [content.filePath, content.saveData, content.saveCodec]);

  return save;
};


const getJsonFilePath = async (originalPath: string, fileName: string): Promise<string> => {
  try {
    // Parent of save/ is www/ (MV) or the game root (MZ). Both keep data/*.json there.
    const saveDir = await dirname(originalPath);
    const gameOrWwwDir = await dirname(saveDir);
    const jsonPath = await join(gameOrWwwDir, 'data', `${fileName}.json`);
    
    return jsonPath;
  } catch (error) {
    warningNotify(`Could not get JSON path: ${fileName}.json`);
    throw error; // rethrow the error
  }
};
function getNameOfGame(originalPath: string): string {
  const pathParts = originalPath.split(/[/\\]/).filter(Boolean);
  pathParts.pop(); // file1.rpgsave / file1.rmmzsave
  pathParts.pop(); // save
  let gameName = pathParts.pop(); // www (MV) or game folder (MZ)
  if (gameName && gameName.toLowerCase() === 'www') {
    gameName = pathParts.pop();
  }
  console.log(gameName);

  if (gameName) {
    return gameName;
  }
  warningNotify('Could not determine game name from file path.');
  return 'Unknown Game';
}

const successNotify = (text: string) => {
  toast.success(text, {
    position: "bottom-right",
    autoClose: 1000,
    hideProgressBar: true,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
  });
};
const errorNotify = (text: string) => {
  toast.error(text, {
    position: "bottom-right",
    autoClose: 4000,
    hideProgressBar: true,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
  });
};

const warningNotify = (text: string) => {
  toast.warn(text, {
    position: "bottom-right",
    autoClose: 4000,
    hideProgressBar: true,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
  });
};
