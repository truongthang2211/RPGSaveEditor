import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { jsonFormat, jsonGameName } from './index';
import { looksLikeJsonSave, parseJsonBytes, parseJsonSave, sameJsonData, serializeJsonBytes, serializeJsonSave } from './save';
import { jsonTree } from './tree';
import { parseDoc } from './doc';
import { findFormat } from '..';
import { TreeNode } from '../types';

type Save = ReturnType<typeof parseJsonSave>;

const sample = {
  day: 2,
  isNight: false,
  currentRoom: 'quarto',
  visitor: null,
  kitchen: { beer: 3, cigarette: 1 },
  guests: [{ id: 'elena', room: 'sala', trust: 0.5 }],
  nested: { deep: { value: 7 } },
};

const path = (save: Save, ...keys: string[]): TreeNode => {
  let nodes = jsonTree.roots(save);
  let found: TreeNode | undefined;
  for (const key of keys) {
    found = nodes.find((n) => n.key === key);
    if (!found) throw new Error(`No "${key}" among ${nodes.map((n) => n.key).join(', ')}`);
    nodes = found.hasChildren ? jsonTree.children(save, found) : [];
  }
  return found!;
};
const names = (save: Save) => jsonFormat.namedVariables!(save).map((v) => v.name);
const variable = (save: Save, name: string) => jsonFormat.namedVariables!(save).find((v) => v.name === name)!.node;
const set = (save: Save, node: TreeNode, value: number | string | boolean) => jsonTree.setValue(save, node, value);
const encode = (value: unknown, indent?: number) => new TextEncoder().encode(JSON.stringify(value, null, indent));
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const pipe = async (bytes: Uint8Array, stream: CompressionStream | DecompressionStream) =>
  new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream)).arrayBuffer());

describe('JSON text with positions', () => {
  it('reads valid JSON and refuses invalid JSON', () => {
    expect(parseDoc('{"a": [1, 2.50, true, null, "x"], "b": {"c": -3e2}, "a": 9}').root.k).toBe('object');
    expect(() => parseDoc('{"a": }')).toThrow(/Invalid JSON/);
    expect(() => parseDoc('{"a": 1} x')).toThrow(/unexpected text/);
    expect(() => parseDoc('[1, 2')).toThrow(/Invalid JSON/);
    expect(() => parseDoc('{"a": "unterminated}')).toThrow(/Invalid JSON/);
  });
});

describe('JSON saves', () => {
  it('shows the contents by type, and the top-level values on the Variables page', () => {
    const save = parseJsonSave(JSON.stringify(sample));
    expect(path(save, 'day')).toMatchObject({ type: 'Number', value: 2, editable: 'number' });
    expect(path(save, 'isNight')).toMatchObject({ type: 'Boolean', editable: 'boolean' });
    expect(path(save, 'guests')).toMatchObject({ type: 'Array', summary: 'Array(1)' });
    expect(path(save, 'visitor')).toMatchObject({ type: 'null', hasChildren: false });
    expect(names(save)).toEqual(['day', 'isNight', 'currentRoom', 'kitchen.beer', 'kitchen.cigarette']);
  });

  it('writes the file back unchanged when nothing was edited, in whatever layout it had', () => {
    for (const text of [
      JSON.stringify(sample),
      JSON.stringify(sample, null, 2),
      JSON.stringify(sample, null, '\t') + '\n',
      '\uFEFF' + JSON.stringify(sample, null, 4).replace(/\n/g, '\r\n') + '\r\n',
    ]) {
      const save = parseJsonSave(text);
      expect(serializeJsonSave(save)).toBe(text);
      const day = path(save, 'day');
      expect(serializeJsonSave(set(set(save, day, 9), day, 2))).toBe(text);
    }
  });

  it('replaces only the edited value in the text: the layout, BOM and line endings stay', () => {
    const text = '\uFEFF' + JSON.stringify(sample, null, '\t').replace(/\n/g, '\r\n') + '\r\n';
    const save = parseJsonSave(text);
    const out = serializeJsonSave(set(save, path(save, 'kitchen', 'beer'), 99));
    expect(out).toBe(text.replace('"beer": 3', '"beer": 99'));
    expect(out.startsWith('\uFEFF')).toBe(true);
  });

  it('keeps how numbers are written, and numbers too large for a double', () => {
    const text = '{"speed": 1.0, "big": 9007199254740993, "exp": 1E3, "n": 5}';
    const save = parseJsonSave(text);
    expect(serializeJsonSave(set(save, path(save, 'n'), 6))).toBe('{"speed": 1.0, "big": 9007199254740993, "exp": 1E3, "n": 6}');
    // Setting a number to what it is changes nothing: 1.0 stays 1.0.
    expect(serializeJsonSave(set(save, path(save, 'speed'), 1))).toBe(text);
    expect(serializeJsonSave(set(save, path(save, 'speed'), 2))).toBe('{"speed": 2, "big": 9007199254740993, "exp": 1E3, "n": 5}');
  });

  it('edits values and rereads them; the saved file differs only by the edit', () => {
    const save = parseJsonSave(JSON.stringify(sample));
    let edited = set(save, path(save, 'day'), 30);
    edited = set(edited, path(save, 'currentRoom'), 'sala "2"');
    edited = set(edited, path(save, 'isNight'), true);
    edited = set(edited, path(save, 'guests', '[0]', 'trust'), 1);
    expect(JSON.parse(serializeJsonSave(edited))).toEqual({
      ...sample,
      day: 30,
      currentRoom: 'sala "2"',
      isNight: true,
      guests: [{ id: 'elena', room: 'sala', trust: 1 }],
    });
    expect(jsonTree.valueOf(save, path(save, 'day'))).toBe(2); // the loaded save is untouched
  });

  it('refuses to change a value into another type or to replace a container', () => {
    const save = parseJsonSave(JSON.stringify(sample));
    expect(() => set(save, path(save, 'day'), 'x')).toThrow();
    expect(() => set(save, path(save, 'day'), Number.NaN)).toThrow();
    expect(() => set(save, path(save, 'visitor'), 1)).toThrow();
    expect(() => set(save, path(save, 'kitchen'), 1)).toThrow();
  });

  it('does not open files that are not an object or a list', () => {
    expect(() => parseJsonSave('hello')).toThrow(/Not a JSON file/);
    expect(() => parseJsonSave('42')).toThrow(/no object or list/);
  });

  it('opens a list at the top level', () => {
    const save = parseJsonSave('[{"hp": 5}, {"hp": 7}]');
    expect(path(save, '[1]', 'hp')).toMatchObject({ value: 7 });
    expect(serializeJsonSave(set(save, path(save, '[1]', 'hp'), 9))).toBe('[{"hp": 5}, {"hp": 9}]');
  });

  it('shows long text by its length and does not edit it', () => {
    const save = parseJsonSave(JSON.stringify({ picture: 'A'.repeat(5000), name: 'x' }));
    expect(path(save, 'picture')).toMatchObject({ type: 'String', summary: '5,000 characters', hasChildren: false });
    expect(path(save, 'picture').editable).toBeUndefined();
    expect(path(save, 'name').editable).toBe('string');
  });

  it('compares saves by value: 1.0 equals 1', () => {
    expect(sameJsonData(parseJsonSave('{"a": 1.0}'), parseJsonSave('{"a": 1}'))).toBe(true);
    expect(sameJsonData(parseJsonSave('{"a": 1.0}'), parseJsonSave('{"a": 2}'))).toBe(false);
  });

  it('recognises .json, .es3 and .nson files and gets the game name from the folder', () => {
    expect(findFormat('C:/Games/Hero Quest/save.json')?.id).toBe('json');
    expect(findFormat('C:/Games/Hero Quest/GameSave001.nson')?.id).toBe('json');
    expect(findFormat('C:/Users/me/AppData/LocalLow/Studio/Game/SaveFile.es3')?.id).toBe('json');
    expect(jsonGameName('C:/Games/Hero Quest/saves/slot1.json')).toBe('Hero Quest');
    expect(jsonGameName('/home/me/Downloads/save1.json')).toBe('Downloads');
    expect(jsonGameName('/home/me/SaveFile.es3')).toBe('me');
    expect(looksLikeJsonSave('{"a":1}')).toBe(true);
    expect(looksLikeJsonSave('plain')).toBe(false);
  });
});

describe('JSON inside JSON strings', () => {
  // The state is text in the file: "{\"gold\":100,\"mult\":1.0,...}".
  const state = '{"gold":100,"mult":1.0,"name":"Hero","party":[{"hp":10},{"hp":20}],"inner":' + JSON.stringify('{"deep":5,"flag":true}') + '}';
  const text = JSON.stringify({ title: 'Save', state, notJson: '{oops', list: '[1, 2, 3]' });

  it('shows what a string holds as children of the string', () => {
    const save = parseJsonSave(text);
    expect(path(save, 'state')).toMatchObject({ type: 'JSON text', summary: '5 keys', hasChildren: true });
    expect(path(save, 'state', 'gold')).toMatchObject({ type: 'Number', value: 100, editable: 'number' });
    expect(path(save, 'state', 'party', '[1]', 'hp').value).toBe(20);
    expect(path(save, 'state', 'inner', 'flag')).toMatchObject({ type: 'Boolean', value: true });
    expect(path(save, 'list')).toMatchObject({ type: 'JSON text', summary: 'Array(3)' });
    expect(path(save, 'notJson')).toMatchObject({ type: 'String', value: '{oops' });
    expect(path(save, 'state').editable).toBeUndefined();
  });

  it('writes an edit back into the string, leaving the rest of the JSON as it was', () => {
    const save = parseJsonSave(text);
    const edited = set(save, path(save, 'state', 'gold'), 99999);
    expect(JSON.parse(serializeJsonSave(edited)).state).toBe(state.replace('"gold":100', '"gold":99999')); // mult stays 1.0
    const deep = set(save, path(save, 'state', 'inner', 'deep'), 6);
    expect(JSON.parse(JSON.parse(serializeJsonSave(deep)).state).inner).toBe('{"deep":6,"flag":true}');
    expect(path(deep, 'state', 'inner', 'deep').value).toBe(6);
    expect(serializeJsonSave(set(edited, path(edited, 'state', 'gold'), 100))).toBe(text);
  });

  it('compares saves by what the strings hold', () => {
    const a = parseJsonSave(JSON.stringify({ s: '{"x":1.0}' }));
    const b = parseJsonSave(JSON.stringify({ s: '{"x":1}' }));
    expect(sameJsonData(a, b)).toBe(true);
    expect(sameJsonData(a, parseJsonSave(JSON.stringify({ s: '{"x":2}' })))).toBe(false);
  });
});

describe('Easy Save (.es3) saves', () => {
  const es3 = {
    gold: { __type: 'int', value: 100 },
    playerName: { __type: 'string', value: 'Hero' },
    hardMode: { __type: 'bool', value: false },
    player: { __type: 'Player,Assembly-CSharp', hp: 50, mp: 20, name: 'Hero' },
    level: 7,
    stats: { __type: 'Stats,Assembly-CSharp', value: { str: 3, dex: 4 } },
  };

  it('lists each key by name: a value under its key, an object by its fields, never the type marker', async () => {
    const save = await parseJsonBytes(encode(es3, 2));
    expect(names(save)).toEqual(['gold', 'playerName', 'hardMode', 'player.hp', 'player.mp', 'player.name', 'level', 'stats.str', 'stats.dex']);
    expect(variable(save, 'gold')).toMatchObject({ value: 100, editable: 'number' });
  });

  it('writes the bytes back unchanged, and an edit changes only that value', async () => {
    const bytes = encode(es3, 2);
    const save = await parseJsonBytes(bytes);
    expect(await serializeJsonBytes(save)).toBe(bytes);
    const out = decode(await serializeJsonBytes(set(save, variable(save, 'gold'), 99999)));
    expect(out).toBe(JSON.stringify({ ...es3, gold: { __type: 'int', value: 99999 } }, null, 2));
  });

  it('opens gzip-compressed saves and compresses them again when edited', async () => {
    const packed = await pipe(encode(es3), new CompressionStream('gzip'));
    const save = await parseJsonBytes(packed);
    expect(save.compression).toBe('gzip');
    expect(names(save)).toContain('gold');
    expect(await serializeJsonBytes(save)).toBe(packed);

    const out = await serializeJsonBytes(set(save, variable(save, 'gold'), 5));
    expect([out[0], out[1]]).toEqual([0x1f, 0x8b]);
    expect(JSON.parse(serializeJsonSave(await parseJsonBytes(out))).gold.value).toBe(5);
  });

  it('keeps a BOM, and explains files that are encrypted or not JSON', async () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...encode(es3)]);
    const bom = await parseJsonBytes(withBom);
    expect(await serializeJsonBytes(bom)).toBe(withBom);
    expect((await serializeJsonBytes(set(bom, variable(bom, 'gold'), 1))).slice(0, 3)).toEqual(new Uint8Array([0xef, 0xbb, 0xbf]));

    const encrypted = Uint8Array.from({ length: 64 }, (_, i) => (i * 73 + 41) & 0xff);
    await expect(parseJsonBytes(encrypted)).rejects.toThrow(/encrypted/);
    await expect(parseJsonBytes(new TextEncoder().encode('<?xml version="1.0"?><a/>'))).rejects.toThrow(/isn't JSON text/);
    await expect(parseJsonBytes(Uint8Array.from([0x1f, 0x8b, 1, 2, 3]))).rejects.toThrow(/compressed/);
  });
});

describe('Naninovel saves', () => {
  const states: [string, string][] = [
    [
      'Naninovel.CustomVariableManager+GameState, Elringus.Naninovel.Runtime, Version=0.0.0.0',
      JSON.stringify({
        LocalVariables: [
          { name: 'Affection', scope: 0, value: { type: 1, stringValue: '', numericValue: 4, booleanValue: false } },
          { name: 'DoorOpen', scope: 0, value: { type: 2, stringValue: '', numericValue: 0, booleanValue: true } },
          { name: 'Mode', scope: 0, value: { type: 0, stringValue: 'Win', numericValue: 0, booleanValue: false } },
        ],
      }),
    ],
    ['Money.MoneyService+State, Assembly-CSharp', '{"balance":1099131,"min":0,"max":2147483647,"globalMult":1.0}'],
    ['Naninovel.UI.CustomUI+GameState, Elringus.Naninovel.Runtime', '{"Visible":false}'],
    ['Naninovel.UI.CustomUI+GameState, Elringus.Naninovel.Runtime', '{"Visible":true}'],
    ['Naninovel.ActorManager`4+GameState, X', '{"actorsJsonMap":{"keys":["A"],"values":[]}}'],
  ];
  const naninovel = {
    objectJsonMap: { keys: states.map(([key]) => key), values: states.map(([, value]) => value) },
    playbackSpot: { scriptPath: 'Main', lineIndex: 7, inlineIndex: 0 },
    playerRollbackAllowed: false,
    saveDateTime: '2026-09-18 10:22:08',
    thumbnailBase64: 'A'.repeat(3000),
    rollbackStackJson: '',
  };
  const text = JSON.stringify(naninovel);

  it('lists the story variables by name, then the values of the game states', () => {
    const save = parseJsonSave(text);
    expect(names(save)).toEqual([
      'Affection', 'DoorOpen', 'Mode',
      'Money.MoneyService+State.balance', 'Money.MoneyService+State.min', 'Money.MoneyService+State.max', 'Money.MoneyService+State.globalMult',
      'Naninovel.UI.CustomUI+GameState#1.Visible', 'Naninovel.UI.CustomUI+GameState#2.Visible',
    ]);
    expect(variable(save, 'Affection')).toMatchObject({ type: 'Number', value: 4, editable: 'number' });
    expect(variable(save, 'DoorOpen')).toMatchObject({ type: 'Boolean', value: true, editable: 'boolean' });
    expect(variable(save, 'Mode')).toMatchObject({ type: 'String', value: 'Win', editable: 'string' });
  });

  it('edits a story variable and a state value inside their JSON text', () => {
    const save = parseJsonSave(text);
    let edited = set(save, variable(save, 'Affection'), 99);
    edited = set(edited, variable(edited, 'Money.MoneyService+State.balance'), 5000000);
    edited = set(edited, variable(edited, 'DoorOpen'), false);
    const out = JSON.parse(serializeJsonSave(edited));
    expect(out.objectJsonMap.values[1]).toBe('{"balance":5000000,"min":0,"max":2147483647,"globalMult":1.0}'); // 1.0 stays
    expect(JSON.parse(out.objectJsonMap.values[0]).LocalVariables.map((v: any) => v.value)).toEqual([
      { type: 1, stringValue: '', numericValue: 99, booleanValue: false },
      { type: 2, stringValue: '', numericValue: 0, booleanValue: false },
      { type: 0, stringValue: 'Win', numericValue: 0, booleanValue: false },
    ]);
    expect(out.playbackSpot).toEqual(naninovel.playbackSpot);
    expect(out.thumbnailBase64).toBe(naninovel.thumbnailBase64);
  });

  it('opens .nson files (JSON deflated without a header) and writes them the same way', async () => {
    const packed = await pipe(new TextEncoder().encode('\uFEFF' + text), new CompressionStream('deflate-raw'));
    const save = await parseJsonBytes(packed);
    expect(save).toMatchObject({ compression: 'deflate', bom: true });
    expect(await serializeJsonBytes(save)).toBe(packed);
    const out = await serializeJsonBytes(set(save, variable(save, 'Affection'), 7));
    const back = await parseJsonBytes(out);
    expect(back.compression).toBe('deflate');
    expect(variable(back, 'Affection').value).toBe(7);
    const inflated = await pipe(out, new DecompressionStream('deflate-raw'));
    expect([inflated[0], inflated[1], inflated[2]]).toEqual([0xef, 0xbb, 0xbf]);
  });
});

// Real JSON saves dropped into save_files/ (git-ignored): .json and Naninovel's .nson.
const dir = join(process.cwd(), 'save_files');
const realSaves = existsSync(dir) ? readdirSync(dir).filter((f) => /\.(json|nson|es3)$/i.test(f)) : [];

describe.skipIf(realSaves.length === 0)('real JSON saves', () => {
  it.each(realSaves)('%s: writes back unchanged, and an edit changes only that value', async (file) => {
    const bytes = new Uint8Array(readFileSync(join(dir, file)));
    const save = await parseJsonBytes(bytes);
    expect(await serializeJsonBytes(save)).toEqual(bytes);

    const target = jsonFormat.namedVariables!(save).find((v) => v.node.editable === 'number');
    if (!target) return;
    const value = target.node.value as number;
    const edited = set(save, target.node, value + 1);
    const before = save.doc.text;
    const after = edited.doc.text;
    // Everything but the one number is the same text: find the part that differs.
    let start = 0;
    while (start < before.length && before[start] === after[start]) start++;
    let endBefore = before.length;
    let endAfter = after.length;
    while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
      endBefore--;
      endAfter--;
    }
    expect(before.slice(start, endBefore).length).toBeLessThan(25);
    expect(after.slice(start, endAfter).length).toBeLessThan(25);
    const back = await parseJsonBytes(await serializeJsonBytes(edited));
    expect(variable(back, target.name).value).toBe(value + 1);
    expect(serializeJsonSave(set(edited, variable(edited, target.name), value))).toBe(serializeJsonSave(save));
  });
});
