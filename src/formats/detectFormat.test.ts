import { describe, expect, it, vi } from 'vitest';

const files = new Map<string, Uint8Array>();
vi.mock('../utils/fileUtils', () => ({
  readBinary: async (path: string) => files.get(path) ?? Promise.reject(new Error(`no such file: ${path}`)),
}));

const { detectFormat, findFormat, saveFileFilters } = await import('.');

describe('detectFormat', () => {
  it("falls back to a save's content when no format's extension matches its own (a game's own extension for a plain-JSON save)", async () => {
    files.set('/game/saves/slot1.mdrgslot', new TextEncoder().encode(JSON.stringify({ day: 1 })));
    expect(findFormat('/game/saves/slot1.mdrgslot')).toBeUndefined(); // extension-only lookup still doesn't know it
    expect((await detectFormat('/game/saves/slot1.mdrgslot'))?.id).toBe('json');
  });

  it("doesn't read the file at all when the extension already settles it (the usual, fast path)", async () => {
    expect((await detectFormat('/game/save.json'))?.id).toBe('json'); // not in `files`: would throw if read
  });

  it("stays undefined for an unlisted extension whose content isn't any format's either", async () => {
    files.set('/game/readme.oddext', new TextEncoder().encode('Just some notes, not a save.'));
    expect(await detectFormat('/game/readme.oddext')).toBeUndefined();
  });
});

describe('saveFileFilters', () => {
  it("ends with an All Files entry, so a save under a game's own extension (not in any format's list) can still be picked in the open dialog", () => {
    const filters = saveFileFilters();
    expect(filters[filters.length - 1]).toEqual({ name: 'All Files', extensions: ['*'] });
  });
});
