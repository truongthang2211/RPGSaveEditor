import { useCallback } from 'react';
import { ContentType, useContent } from '../context/ContentContext';
import { readFile, selectFile, writeFile } from '../utils/fileUtils';
import { decodeRpgsave, encodeRpgsave } from '../utils/rpgsaveUtils';
import { toast } from 'react-toastify';

export const useFileUpload = () => {
  const { content, setContent } = useContent();

  const handleReadFile = useCallback(async (filePath: string) => {
    try {
      const fileContent = await readFile(filePath);
      const decodedContent = decodeRpgsave(fileContent);
      const gameName = getNameOfGame(filePath)

      const contentData: ContentType = {
        ...content,

        oldSaveData: gameName != content?.gameName ? {} : (content?.originSaveData || {}),
        saveData: JSON.parse(decodedContent),
        originSaveData: JSON.parse(decodedContent),
        fileName: filePath.split('\\').pop() || '',
      };

      // Get Items Data
      const itemFilePath = getFileFilePath(filePath, 'Items');
      contentData.itemData = JSON.parse(await readFile(itemFilePath));

      // Get System Data
      const sysFilePath = getFileFilePath(filePath, 'System');
      contentData.systemData = JSON.parse(await readFile(sysFilePath));

      // Get Weapons Data
      const weaponsFilePath = getFileFilePath(filePath, 'Weapons');
      contentData.weaponsData = JSON.parse(await readFile(weaponsFilePath));

      // Get Armors Data
      const armorsFilePath = getFileFilePath(filePath, 'Armors');
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


function getFileFilePath(originalPath: string, fileName: string): string {
  // Tách phần đường dẫn và tên file
  const pathParts = originalPath.split('\\');
  const fileNameWithExt = pathParts.pop(); // 'file1.rpgsave'
  pathParts.pop();
  const folderPath = pathParts.join('\\'); // 'D:\Gamess\AmongUs\Winter Memories (Kagura v1.08)\www'

  if (fileNameWithExt) {
    const newFilePath = `${folderPath}\\data\\${fileName}.json`; // Đường dẫn mới

    return newFilePath;
  }

  throw new Error('Invalid file path');
}
function getNameOfGame(originalPath: string): string {
  const pathParts = originalPath.split('\\');
  pathParts.pop() // 'file1.rpgsave'
  pathParts.pop() // 'save'
  pathParts.pop() // 'www'
  const gameName = pathParts.pop();
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