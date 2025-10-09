import { useCallback } from 'react';
import { ContentType, useContent } from '../context/ContentContext';
import { readFile, selectFile, writeFile } from '../utils/fileUtils';
import { decodeRpgsave, encodeRpgsave } from '../utils/rpgsaveUtils';
import { toast } from 'react-toastify';
import { basename, dirname, join as pathJoin } from '@tauri-apps/api/path';

export const useFileUpload = () => {
  const { content, setContent } = useContent();

  const handleReadFile = useCallback(async (filePath: string) => {
    try {
      const fileContent = await readFile(filePath);
      const decodedContent = decodeRpgsave(fileContent);
      const gameName = await getNameOfGame(filePath)

      const contentData: ContentType = {
        ...content,

        oldSaveData: gameName != content?.gameName ? {} : (content?.originSaveData || {}),
        saveData: JSON.parse(decodedContent),
        originSaveData: JSON.parse(decodedContent),
        fileName: await basename(filePath)
      };

      // Get Items Data
      const itemFilePath = await getFileFilePath(filePath, 'Items.json');
      contentData.itemData = JSON.parse(await readFile(itemFilePath));

      // Get System Data
      const sysFilePath = await getFileFilePath(filePath, 'System.json');
      contentData.systemData = JSON.parse(await readFile(sysFilePath));

      // Get Weapons Data
      const weaponsFilePath = await getFileFilePath(filePath, 'Weapons.json');
      contentData.weaponsData = JSON.parse(await readFile(weaponsFilePath));

      // Get Armors Data
      const armorsFilePath = await getFileFilePath(filePath, 'Armors.json');
      contentData.armorsData = JSON.parse(await readFile(armorsFilePath));


      contentData.filePath = filePath
      contentData.gameName = gameName
      setContent(contentData);
    } catch (error) {
      errorNotify('Error processing file! \n' + error)

    }
  }, [content, setContent]);

  const uploadFile = useCallback(async () => {
    const filePath = await selectFile();
    if (filePath) {
      await handleReadFile(filePath);
    }
    console.log('Upload file triggered');
  }, [handleReadFile]);

  return uploadFile;
};

export const useReload = () => {
  const { content, setContent } = useContent();

  const handleReadFile = useCallback(async (filePath: string) => {
    try {

      const fileContent = await readFile(filePath);
      const decodedContent = decodeRpgsave(fileContent);
      // console.log(JSON.stringify(content));


      setContent((prev: any) => {
        console.log(JSON.stringify(prev.filePath));

        const contentData: ContentType = { ...prev }

        contentData.oldSaveData = contentData?.originSaveData || {}
        contentData.saveData = JSON.parse(decodedContent);
        contentData.originSaveData = JSON.parse(decodedContent);
        return contentData
      });
      successNotify('File Reloaded!')
    } catch (error) {
      errorNotify('Error Reloading File Save! \n' + error)
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
        const encodedContent = encodeRpgsave(JSON.stringify(content.saveData));
        await writeFile(content.filePath, encodedContent);
        successNotify('File Saved!')
      }
      console.log('Save triggered');
      console.log(content);
    } catch (error) {
      errorNotify('Error Saving File! \n' + error)

    }

  }, [content.filePath, content.saveData]);

  return save;
};


async function getFileFilePath(originalPath: string, fileName: string): Promise<string> {
  // Get filename and its directory
  const fileNameWithExt = await basename(originalPath); // 'file1.rpgsave'
  const folderPath = await dirname(await dirname(originalPath)); // 'D:\Gamess\AmongUs\Winter Memories (Kagura v1.08)\www'

  if (fileNameWithExt) {
    return pathJoin(folderPath, "data", fileName); // Create new path
  }

  throw new Error('Invalid file path');
}
async function getNameOfGame(originalPath: string): Promise<string> {
  // First dirname gets "data", then "www". Finally basename gives us Game's name.
  const gameName = await basename(await dirname(await dirname(originalPath)))
  console.log(gameName);

  if (gameName) {
    return gameName;
  }

  throw new Error('Invalid file path');
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
