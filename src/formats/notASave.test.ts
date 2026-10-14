import { describe, expect, it } from 'vitest';
import { findFormat, notASaveReason } from '.';

describe('files of a game that are not saves', () => {
  it.each([
    ['C:\\Game\\save\\config.rmmzsave', "config.rmmzsave holds the game's settings, not a save. Open a save slot instead (file1.rmmzsave, file2.rmmzsave...)."],
    ['C:\\Game\\www\\save\\global.rpgsave', "global.rpgsave holds the game's settings, not a save. Open a save slot instead (file1.rpgsave, file2.rpgsave...)."],
    ['C:\\Game\\Data\\Items.rvdata2', "Items.rvdata2 is part of the game's data, not a save. Saves are usually named Save01.rvdata2, Save02.rvdata2..."],
    ['/game/Data/Map001.rvdata', "Map001.rvdata is part of the game's data, not a save. Saves are usually named Save1.rvdata, Save2.rvdata..."],
    ['/game/Data/Scripts.rxdata', "Scripts.rxdata is part of the game's data, not a save. Saves are usually named Save1.rxdata, Save2.rxdata..."],
    ['/game/game/saves/persistent', "persistent holds data Ren'Py shares between saves, not a save. Open a .save file such as 1-1-LT1.save."],
  ])('%s is explained', (path, reason) => {
    expect(findFormat(path)).toBeUndefined();
    expect(notASaveReason(path)).toBe(reason);
  });

  it('leaves saves and unrelated files alone', () => {
    for (const path of ['/game/save/file1.rmmzsave', '/game/Save01.rvdata2', '/game/Save1.rxdata', '/game/saves/1-1-LT1.save']) {
      expect(findFormat(path)).toBeDefined();
      expect(notASaveReason(path)).toBeNull();
    }
    expect(notASaveReason('/home/me/notes.txt')).toBeNull();
  });
});
