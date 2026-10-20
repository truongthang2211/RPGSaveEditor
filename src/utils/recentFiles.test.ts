import { beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetRecentFile, getRecentFiles, rememberRecentFile } from './recentFiles';

const storage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
});

beforeEach(() => storage.clear());

describe('recent files', () => {
  it('starts empty and puts the latest file first', () => {
    expect(getRecentFiles()).toEqual([]);
    rememberRecentFile('/games/a/save1.rpgsave');
    rememberRecentFile('/games/b/Save01.rvdata2');
    expect(getRecentFiles()).toEqual(['/games/b/Save01.rvdata2', '/games/a/save1.rpgsave']);
  });

  it('moves a file opened again to the top instead of listing it twice', () => {
    rememberRecentFile('/games/a/save1.rpgsave');
    rememberRecentFile('/games/b/save2.rpgsave');
    expect(rememberRecentFile('/games/a/save1.rpgsave')).toEqual(['/games/a/save1.rpgsave', '/games/b/save2.rpgsave']);
  });

  it('treats Windows paths that differ only in case as the same file, but not other paths', () => {
    rememberRecentFile('C:\\Games\\Hero\\Save01.rvdata2');
    expect(rememberRecentFile('c:\\games\\hero\\save01.rvdata2')).toEqual(['c:\\games\\hero\\save01.rvdata2']);
    rememberRecentFile('/games/a/save1.rpgsave');
    expect(rememberRecentFile('/games/A/save1.rpgsave')).toHaveLength(3);
  });

  it('keeps the 8 most recent', () => {
    for (let i = 1; i <= 10; i++) rememberRecentFile(`/games/g${i}/save.json`);
    const recent = getRecentFiles();
    expect(recent).toHaveLength(8);
    expect(recent[0]).toBe('/games/g10/save.json');
    expect(recent[7]).toBe('/games/g3/save.json');
  });

  it('forgets a file, with the same path rules', () => {
    rememberRecentFile('C:\\Games\\Hero\\Save01.rvdata2');
    rememberRecentFile('/games/a/save1.rpgsave');
    expect(forgetRecentFile('c:\\games\\hero\\SAVE01.rvdata2')).toEqual(['/games/a/save1.rpgsave']);
    expect(getRecentFiles()).toEqual(['/games/a/save1.rpgsave']);
    expect(forgetRecentFile('/not/in/the/list')).toEqual(['/games/a/save1.rpgsave']);
  });

  it('ignores stored data that is not a list of paths', () => {
    storage.set('recentFiles', 'not json');
    expect(getRecentFiles()).toEqual([]);
    storage.set('recentFiles', '{"a":1}');
    expect(getRecentFiles()).toEqual([]);
    storage.set('recentFiles', JSON.stringify(['/ok/save.json', 5, '', null, '/also/ok.save']));
    expect(getRecentFiles()).toEqual(['/ok/save.json', '/also/ok.save']);
  });
});
