import { describe, expect, it } from 'vitest';
import { ancestorDirs, fileNameFromPath, hasExtension, pathSegments } from './path';

describe('pathSegments / fileNameFromPath', () => {
  it('handles Windows and POSIX separators', () => {
    expect(fileNameFromPath('C:\\Games\\My Game\\save\\file1.rmmzsave')).toBe('file1.rmmzsave');
    expect(fileNameFromPath('/g/save/f.rpgsave')).toBe('f.rpgsave');
    expect(pathSegments('/g//save\\f.rpgsave')).toEqual(['g', 'save', 'f.rpgsave']);
  });
});

describe('ancestorDirs', () => {
  it('lists the folders above a file, closest first, keeping the drive letter or leading slash', () => {
    expect(ancestorDirs('C:\\Games\\Studio\\MyGame\\saves\\slot1.es3')).toEqual([
      'C:/Games/Studio/MyGame/saves',
      'C:/Games/Studio/MyGame',
      'C:/Games/Studio',
      'C:/Games',
      'C:',
    ]);
    expect(ancestorDirs('/home/me/Games/MyGame/save/slot1.es3')).toEqual(['/home/me/Games/MyGame/save', '/home/me/Games/MyGame', '/home/me/Games', '/home/me', '/home']);
  });

  it('stops at maxLevels', () => {
    expect(ancestorDirs('/a/b/c/d/e/f/save.es3', 2)).toEqual(['/a/b/c/d/e/f', '/a/b/c/d/e']);
  });
});

describe('hasExtension', () => {
  it('matches case-insensitively and only at the end', () => {
    expect(hasExtension('C:\\Game\\www\\save\\file1.rpgsave', ['rpgsave', 'rmmzsave'])).toBe(true);
    expect(hasExtension('/game/save/file1.RmmzSave', ['rpgsave', 'rmmzsave'])).toBe(true);
    expect(hasExtension('/game/save/file1.sav', ['rpgsave'])).toBe(false);
    expect(hasExtension('/game/save/rpgsave.txt', ['rpgsave'])).toBe(false);
  });
});
