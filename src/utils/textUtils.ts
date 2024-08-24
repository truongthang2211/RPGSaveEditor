// utils/textUtils.ts

// Define colorMap with color codes and their corresponding colors
export const colorMap: { [key: number]: string } = {
  0: '#ffffff', // White (Default color)
  1: '#FF0000', // Red
  2: '#00FF00', // Green
  3: '#0000FF', // Blue
  4: '#FFFF00', // Yellow
  5: '#FF00FF', // Magenta
  6: '#00FFFF', // Cyan
  7: '#800000', // Maroon
  8: '#008000', // Dark Green
  9: '#000080', // Navy Blue
  10: '#808000', // Olive
  11: '#800080', // Purple
  12: '#008080', // Teal
  13: '#C0C0C0', // Silver
  14: '#FF00FF', // Pink
  15: '#000000', // Black
  16: '#A52A2A', // Brown
  17: '#B22222', // Firebrick
  18: '#FF4500', // Orange Red
  19: '#FFD700', // Gold
  20: '#DAA520', // Golden Rod
  21: '#D3D3D3', // Light Gray
  22: '#A9A9A9', // Dark Gray
  23: '#F0E68C', // Khaki
  24: '#E6E6FA', // Lavender
  25: '#FFF0F5', // Lavender Blush
  26: '#FF1493', // Deep Pink
  27: '#FF6347', // Tomato
  28: '#FF69B4', // Hot Pink
  29: '#4169E1', // Royal Blue
  30: '#4682B4', // Steel Blue
  31: '#32CD32', // Lime Green
  32: '#ADFF2F', // Green Yellow
  33: '#98FB98', // Pale Green
  34: '#8B4513', // Saddle Brown
  35: '#2E8B57', // Sea Green
};

// Convert text with color codes to styled segments
export const convertText = (text: string): { text: string; color: string }[] => {
  const result: { text: string; color: string }[] = [];
  const regex = /\\c\[(\d+)\]/g; // Regex to match color codes

  let match;

  // Initialize the default color
  let currentColor = '#ffffff';
  // text = text.replaceAll('\\n','\n')
  // Split the text into lines
  const lines = text.split('\n');

  lines.forEach((line) => {
    // Process each line for color codes
    let lineLastIndex = 0;
    while ((match = regex.exec(line)) !== null) {
      // Push the text segment before the match with the current color
      if (match.index > lineLastIndex) {
        result.push({
          text: line.slice(lineLastIndex, match.index),
          color: currentColor,
        });
      }

      // Update the current color based on the match
      const colorCode = parseInt(match[1], 10);
      currentColor = colorMap[colorCode] || '#000000';

      lineLastIndex = match.index + match[0].length; // Update lineLastIndex to end of match
    }

    // Push the remaining text after the last match
    if (lineLastIndex < line.length) {
      result.push({
        text: line.slice(lineLastIndex),
        color: currentColor,
      });
    }

    // Add a line break after each line
    result.push({
      text: '\n',
      color: currentColor,
    });
  });

  // Remove the last line break if the text ends with it
  if (result.length > 0 && result[result.length - 1].text === '\n') {
    result.pop();
  }

  return result;
};
export function getDifferences(base: string, str: string) {
  let result = '';
  const baseLength = base.length;
  const strLength = str.length;
  const maxLength = Math.max(baseLength, strLength);

  for (let i = 0; i < maxLength; i++) {
    const charBase = base[i] || '';
    const charStr = str[i] || '';

    if (charBase !== charStr) {
      // Nếu ký tự khác nhau, thêm ký tự từ str vào kết quả
      if (charStr !== '') {
        result += charStr;
      }
      // Nếu chuỗi cơ sở có ký tự mà chuỗi so sánh không có
      if (charBase !== '' && i >= strLength) {
        result += charBase;
      }
    }
  }

  return result;
}