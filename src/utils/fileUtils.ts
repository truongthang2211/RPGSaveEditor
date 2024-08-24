import { open, save } from '@tauri-apps/api/dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/api/fs';

/**
 * Mở hộp thoại chọn file và trả về đường dẫn file đã chọn.
 */
export async function selectFile(): Promise<string | null> {
  const filePath = await open({
    multiple: false, // Chỉ chọn một file
    filters: [{ name: 'RPG Save Files', extensions: ['rpgsave'] }], // Chỉ chấp nhận file .rpgsave
  });
  return filePath as string | null;
}

/**
 * Đọc nội dung của file từ đường dẫn file.
 * @param filePath - Đường dẫn đến file
 * @returns Nội dung của file dưới dạng chuỗi
 */
export async function readFile(filePath: string): Promise<string> {
  const fileContent = await readTextFile(filePath);
  return fileContent;
}
// fileUtils.ts
export const saveFile = async (): Promise<string | null> => {
  try {
    // Mở hộp thoại lưu file và nhận đường dẫn file
    const filePath = await save({
      defaultPath: 'savefile.rpgsave', // Đặt tên file mặc định
      filters: [
        { name: 'RPG Save Files', extensions: ['rpgsave'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    
    return filePath ? filePath.toString() : null;
  } catch (error) {
    console.error('Error opening save file dialog:', error);
    return null;
  }
};

export const writeFile = async (filePath: string, content: string) => {
  try {
    await writeTextFile(filePath, content);
    console.log('File saved successfully.');
  } catch (error) {
    console.error('Error writing file:', error);
  }
};