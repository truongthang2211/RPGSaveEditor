import { describe, expect, it } from 'vitest';
import { isMvMzSavePath, mvmzGameName } from './paths';

describe('isMvMzSavePath', () => {
  it('accepts MV and MZ game saves', () => {
    expect(isMvMzSavePath('C:\\Game\\www\\save\\file1.rpgsave')).toBe(true);
    expect(isMvMzSavePath('/game/save/file12.RMMZSAVE')).toBe(true);
  });

  it('rejects other extensions and the global/config files', () => {
    expect(isMvMzSavePath('/game/save/file1.sav')).toBe(false);
    expect(isMvMzSavePath('C:\\Game\\www\\save\\global.rpgsave')).toBe(false);
    expect(isMvMzSavePath('/game/save/config.rmmzsave')).toBe(false);
  });
});

describe('mvmzGameName', () => {
  it('skips the www folder for MV', () => {
    expect(mvmzGameName('C:\\Games\\Winter Memories\\www\\save\\file1.rpgsave')).toBe('Winter Memories');
  });

  it('uses the folder above save/ for MZ', () => {
    expect(mvmzGameName('/home/u/Games/Hero/save/file1.rmmzsave')).toBe('Hero');
  });

  it('returns null when the path is too short', () => {
    expect(mvmzGameName('file1.rpgsave')).toBeNull();
  });
});
