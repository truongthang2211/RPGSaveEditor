import { describe, expect, it } from 'vitest';
import { isRgssSavePath, rgssGameName } from './paths';

describe('isRgssSavePath', () => {
  it('accepts save files of the given extension only', () => {
    expect(isRgssSavePath('C:\\Games\\Hero\\Save01.rvdata2', 'rvdata2')).toBe(true);
    expect(isRgssSavePath('/games/hero/Save/SAVE12.RVDATA2', 'rvdata2')).toBe(true);
    expect(isRgssSavePath('C:\\Games\\Hero\\Save1.rvdata', 'rvdata')).toBe(true);
    expect(isRgssSavePath('C:\\Games\\Hero\\Save4.rxdata', 'rxdata')).toBe(true);
    expect(isRgssSavePath('C:\\Games\\Hero\\Save1.rvdata2', 'rvdata')).toBe(false);
    expect(isRgssSavePath('C:\\Games\\Hero\\Save1.rvdata', 'rvdata2')).toBe(false);
  });

  it('rejects database and map files and other extensions', () => {
    expect(isRgssSavePath('C:\\Games\\Hero\\Data\\Items.rvdata2', 'rvdata2')).toBe(false);
    expect(isRgssSavePath('C:\\Games\\Hero\\Data\\Map001.rvdata2', 'rvdata2')).toBe(false);
    expect(isRgssSavePath('C:\\Games\\Hero\\Data\\Scripts.rxdata', 'rxdata')).toBe(false);
    expect(isRgssSavePath('C:\\Games\\Hero\\Data\\Areas.rvdata', 'rvdata')).toBe(false);
    expect(isRgssSavePath('C:\\Games\\Hero\\Save01.rpgsave', 'rvdata2')).toBe(false);
  });
});

describe('rgssGameName', () => {
  it('uses the folder of a save in the game root', () => {
    expect(rgssGameName('C:\\Games\\Hero Quest\\Save01.rvdata2')).toBe('Hero Quest');
  });

  it('skips a Save/ subfolder', () => {
    expect(rgssGameName('/games/Hero/Save/Save01.rvdata2')).toBe('Hero');
    expect(rgssGameName('/games/Hero/UserData/Save1.rxdata')).toBe('Hero');
  });

  it('returns null when there is no folder', () => {
    expect(rgssGameName('Save01.rvdata2')).toBeNull();
  });
});
