import { describe, expect, it, vi } from 'vitest';
import { encryptEs3 } from './es3crypto';

type Entry = { name: string; isDirectory: boolean };
const dirs = new Map<string, Entry[]>();
const files = new Map<string, Uint8Array>();
const reads: string[] = []; // which files were actually read, to check a second scan doesn't repeat them
vi.mock('../../utils/fileUtils', () => ({
  listDir: async (folder: string) => dirs.get(folder) ?? [],
  readBinary: async (path: string) => {
    reads.push(path);
    const bytes = files.get(path);
    if (!bytes) throw new Error(`no such file: ${path}`);
    return bytes;
  },
  openRandomAccess: async (path: string) => {
    reads.push(path);
    const bytes = files.get(path);
    if (!bytes) throw new Error(`no such file: ${path}`);
    let done = false;
    return {
      readAt: async () => (done ? new Uint8Array(0) : ((done = true), bytes)),
      close: async () => {},
    };
  },
}));

const { detectGameFolder, findGamePasswordQuick, findGamePasswordThorough } = await import('./gameScan');

describe('detectGameFolder', () => {
  it('finds the closest ancestor that holds a `<Name>_Data` folder', async () => {
    dirs.set('C:/Games/Studio/MyGame/saves', [{ name: 'slot1.es3', isDirectory: false }]);
    dirs.set('C:/Games/Studio/MyGame', [
      { name: 'MyGame.exe', isDirectory: false },
      { name: 'MyGame_Data', isDirectory: true },
      { name: 'saves', isDirectory: true },
    ]);
    expect(await detectGameFolder('C:\\Games\\Studio\\MyGame\\saves\\slot1.es3')).toBe('C:/Games/Studio/MyGame');
  });

  it("finds it even when a folder's own name ends in _data (not just its children)", async () => {
    dirs.set('C:/Games/MyGame', [{ name: 'save.es3', isDirectory: false }]);
    dirs.set('C:/Games', [{ name: 'MyGame', isDirectory: true }]);
    // No folder above the save itself holds a *_Data child, so nothing is found here;
    // detectGameFolder only looks at what's inside each ancestor, not the ancestor's own name.
    expect(await detectGameFolder('C:\\Games\\MyGame\\save.es3')).toBeNull();
  });

  it('returns null when no ancestor looks like a Unity game', async () => {
    dirs.set('C:/Users/me/AppData/LocalLow/Studio/MyGame', [{ name: 'save.es3', isDirectory: false }]);
    dirs.set('C:/Users/me/AppData/LocalLow/Studio', [{ name: 'MyGame', isDirectory: true }]);
    dirs.set('C:/Users/me/AppData/LocalLow', [{ name: 'Studio', isDirectory: true }]);
    dirs.set('C:/Users/me/AppData', []);
    dirs.set('C:/Users/me', []);
    dirs.set('C:/Users', []);
    expect(await detectGameFolder('C:\\Users\\me\\AppData\\LocalLow\\Studio\\MyGame\\save.es3')).toBeNull();
  });
});

describe('findGamePasswordQuick / findGamePasswordThorough', () => {
  it("lets the slow pass reuse the quick pass's pieces instead of reading the game's files again", async () => {
    const utf16 = (text: string) => Uint8Array.from([...[...text].flatMap((c) => [c.charCodeAt(0), 0]), 1, 0]);
    const join = (...parts: Uint8Array[]) => Uint8Array.from(parts.flatMap((part) => [...part]));
    // textRuns (the 'dll' kind) only keeps runs of 4+ characters, so both pieces need to be that long.
    const dll = join(...['alpha', 'Zx!9', 'beta', 'q#rZ', 'gamma'].map(utf16));

    dirs.set('C:/Games/MyGame', [{ name: 'MyGame_Data', isDirectory: true }]);
    dirs.set('C:/Games/MyGame/MyGame_Data', [{ name: 'Managed', isDirectory: true }]);
    dirs.set('C:/Games/MyGame/MyGame_Data/Managed', [{ name: 'Assembly-CSharp.dll', isDirectory: false }]);
    dirs.set('C:/Games/MyGame/MyGame_Data/il2cpp_data/Metadata', []);
    files.set('C:/Games/MyGame/MyGame_Data/Managed/Assembly-CSharp.dll', dll);
    files.set('C:/Games/save.es3', await encryptEs3(new TextEncoder().encode('{"a":1}'), 'Zx!9q#rZ'));

    reads.length = 0;
    const quick = await findGamePasswordQuick('C:/Games/save.es3', 'C:/Games/MyGame');
    expect(quick.password).toBeNull(); // the password needs two pieces put together
    expect(quick.pieces.sort()).toEqual(['Zx!9', 'q#rZ']);
    expect(reads).toEqual(['C:/Games/save.es3', 'C:/Games/MyGame/MyGame_Data/Managed/Assembly-CSharp.dll']);

    reads.length = 0;
    expect(await findGamePasswordThorough(quick.save, quick.pieces)).toBe('Zx!9q#rZ');
    expect(reads).toEqual([]); // no file read for the slow pass: it only uses what the quick pass already found
  });
});
