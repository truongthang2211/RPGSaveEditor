import LZString from 'lz-string';

/**
 * Giải nén và phân tích dữ liệu từ file .rpgsave
 * @param {string} save - Dữ liệu mã hóa base64
 * @returns {string} - Dữ liệu JSON đã giải nén và định dạng
 */
export function decodeRpgsave(save: string): string {
  try {
    const decoded = LZString.decompressFromBase64(save);
    if (!decoded) throw new Error('Failed to decompress data');
    const parsed = JSON.parse(decoded);
    return JSON.stringify(parsed, null, 4); // Định dạng JSON đẹp hơn
  } catch (error) {
    console.error('Error decoding .rpgsave file:', error);
    throw error;
  }
}

/**
 * Nén và mã hóa dữ liệu cho file .rpgsave
 * @param {string} save - Dữ liệu JSON để mã hóa
 * @returns {string} - Dữ liệu mã hóa base64
 */
export function encodeRpgsave(save: string): string {
  try {
    const parsed = JSON.parse(save);
    const minified = JSON.stringify(parsed, null, 0); // Loại bỏ khoảng trắng không cần thiết
    const encoded = LZString.compressToBase64(minified);
    return encoded;
  } catch (error) {
    console.error('Error encoding .rpgsave file:', error);
    throw error;
  }
}
