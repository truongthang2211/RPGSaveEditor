import { describe, expect, it } from 'vitest';
import { fileNameFromPath, isRpgSavePath } from './saveExtensions';

describe('isRpgSavePath', () => {
  it('accepts MV and MZ saves case-insensitively', () => {
    expect(isRpgSavePath('C:\\Game\\www\\save\\file1.rpgsave')).toBe(true);
    expect(isRpgSavePath('/game/save/file1.RmmzSave')).toBe(true);
  });

  it('rejects other extensions', () => {
    expect(isRpgSavePath('/game/save/file1.sav')).toBe(false);
    expect(isRpgSavePath('/game/save/rpgsave.txt')).toBe(false);
  });
});

describe('fileNameFromPath', () => {
  it('handles Windows and POSIX separators', () => {
    expect(fileNameFromPath('C:\\Games\\My Game\\save\\file1.rmmzsave')).toBe('file1.rmmzsave');
    expect(fileNameFromPath('/g/save/f.rpgsave')).toBe('f.rpgsave');
  });
});
