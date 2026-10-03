import { describe, expect, it } from 'vitest';
import { fileNameFromPath, hasExtension, pathSegments } from './path';

describe('pathSegments / fileNameFromPath', () => {
  it('handles Windows and POSIX separators', () => {
    expect(fileNameFromPath('C:\\Games\\My Game\\save\\file1.rmmzsave')).toBe('file1.rmmzsave');
    expect(fileNameFromPath('/g/save/f.rpgsave')).toBe('f.rpgsave');
    expect(pathSegments('/g//save\\f.rpgsave')).toEqual(['g', 'save', 'f.rpgsave']);
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
