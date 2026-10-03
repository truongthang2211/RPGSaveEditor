/** LZ-String + Base64 save formats used by stock RPG Maker MV / MZ. */
export const RPG_SAVE_EXTENSIONS = ['rpgsave', 'rmmzsave'] as const;

export function isRpgSavePath(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return RPG_SAVE_EXTENSIONS.some((ext) => lower.endsWith(`.${ext}`));
}

export function fileNameFromPath(filePath: string): string {
  return filePath.split(/[/\\]/).pop() || '';
}
