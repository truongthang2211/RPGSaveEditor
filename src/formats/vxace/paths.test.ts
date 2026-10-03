import { describe, expect, it } from 'vitest';
import { isVxAceSavePath, vxaceGameName } from './paths';

describe('isVxAceSavePath', () => {
  it('accepts save files', () => {
    expect(isVxAceSavePath('C:\\Games\\Hero\\Save01.rvdata2')).toBe(true);
    expect(isVxAceSavePath('/games/hero/Save/SAVE12.RVDATA2')).toBe(true);
  });

  it('rejects database and map files and other extensions', () => {
    expect(isVxAceSavePath('C:\\Games\\Hero\\Data\\Items.rvdata2')).toBe(false);
    expect(isVxAceSavePath('C:\\Games\\Hero\\Data\\Map001.rvdata2')).toBe(false);
    expect(isVxAceSavePath('C:\\Games\\Hero\\Save01.rpgsave')).toBe(false);
  });
});

describe('vxaceGameName', () => {
  it('uses the folder of a save in the game root', () => {
    expect(vxaceGameName('C:\\Games\\Hero Quest\\Save01.rvdata2')).toBe('Hero Quest');
  });

  it('skips a Save/ subfolder', () => {
    expect(vxaceGameName('/games/Hero/Save/Save01.rvdata2')).toBe('Hero');
    expect(vxaceGameName('/games/Hero/UserData/Save01.rvdata2')).toBe('Hero');
  });

  it('returns null when there is no folder', () => {
    expect(vxaceGameName('Save01.rvdata2')).toBeNull();
  });
});
