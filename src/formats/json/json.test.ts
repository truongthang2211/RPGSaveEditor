import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { jsonFormat, jsonGameName } from './index';
import { looksLikeJsonSave, parseJsonSave, serializeJsonSave } from './save';
import { jsonTree } from './tree';
import { findFormat } from '..';
import { TreeNode } from '../types';

const sample = {
  day: 2,
  isNight: false,
  currentRoom: 'quarto',
  visitor: null,
  kitchen: { beer: 3, cigarette: 1 },
  guests: [{ id: 'elena', room: 'sala', trust: 0.5 }],
  nested: { deep: { value: 7 } },
};

const path = (save: ReturnType<typeof parseJsonSave>, ...keys: string[]): TreeNode => {
  let nodes = jsonTree.roots(save);
  let found: TreeNode | undefined;
  for (const key of keys) {
    found = nodes.find((n) => n.key === key);
    if (!found) throw new Error(`No "${key}"`);
    nodes = found.hasChildren ? jsonTree.children(save, found) : [];
  }
  return found!;
};

describe('JSON saves', () => {
  it('shows the contents by type, and the top-level values on the Variables page', () => {
    const save = parseJsonSave(JSON.stringify(sample));
    expect(path(save, 'day')).toMatchObject({ type: 'Number', value: 2, editable: 'number' });
    expect(path(save, 'isNight')).toMatchObject({ type: 'Boolean', editable: 'boolean' });
    expect(path(save, 'guests')).toMatchObject({ type: 'Array', summary: 'Array(1)' });
    expect(path(save, 'visitor')).toMatchObject({ type: 'null', hasChildren: false });
    expect(sugarNames(save)).toEqual(['day', 'isNight', 'currentRoom', 'kitchen.beer', 'kitchen.cigarette']);
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
      expect(serializeJsonSave(jsonTree.setValue(jsonTree.setValue(save, day, 9), day, 2))).toBe(text);
    }
  });

  it('keeps indentation, line endings, BOM and the final newline when editing', () => {
    const text = '\uFEFF' + JSON.stringify(sample, null, '\t').replace(/\n/g, '\r\n') + '\r\n';
    const save = parseJsonSave(text);
    const out = serializeJsonSave(jsonTree.setValue(save, path(save, 'kitchen', 'beer'), 99));
    expect(out).toBe(text.replace('"beer": 3', '"beer": 99'));
    expect(out.startsWith('\uFEFF')).toBe(true);
    expect(out.endsWith('}\r\n')).toBe(true);
  });

  it('edits values and rereads them; the saved file differs only by the edit', () => {
    const save = parseJsonSave(JSON.stringify(sample));
    let edited = jsonTree.setValue(save, path(save, 'day'), 30);
    edited = jsonTree.setValue(edited, path(save, 'currentRoom'), 'sala');
    edited = jsonTree.setValue(edited, path(save, 'isNight'), true);
    edited = jsonTree.setValue(edited, path(save, 'guests', '[0]', 'trust'), 1);
    expect(JSON.parse(serializeJsonSave(edited))).toEqual({
      ...sample,
      day: 30,
      currentRoom: 'sala',
      isNight: true,
      guests: [{ id: 'elena', room: 'sala', trust: 1 }],
    });
    expect(jsonTree.valueOf(save, path(save, 'day'))).toBe(2); // the loaded save is untouched
  });

  it('refuses to change a value into another type or to replace a container', () => {
    const save = parseJsonSave(JSON.stringify(sample));
    expect(() => jsonTree.setValue(save, path(save, 'day'), 'x')).toThrow();
    expect(() => jsonTree.setValue(save, path(save, 'visitor'), 1)).toThrow();
    expect(() => jsonTree.setValue(save, path(save, 'kitchen'), 1)).toThrow();
  });

  it('does not open files that are not an object or a list, or that would lose a number', () => {
    expect(() => parseJsonSave('hello')).toThrow(/Not a JSON file/);
    expect(() => parseJsonSave('42')).toThrow(/no object or list/);
    expect(() => parseJsonSave('{"id": 9007199254740993}')).toThrow(/too large/);
    // Long numbers inside strings are fine, and so are decimals.
    expect(parseJsonSave('{"id": "9007199254740993", "x": 0.1}').data).toEqual({ id: '9007199254740993', x: 0.1 });
  });

  it('opens a list at the top level', () => {
    const save = parseJsonSave('[{"hp": 5}, {"hp": 7}]');
    expect(path(save, '[1]', 'hp')).toMatchObject({ value: 7 });
    expect(JSON.parse(serializeJsonSave(jsonTree.setValue(save, path(save, '[1]', 'hp'), 9)))).toEqual([{ hp: 5 }, { hp: 9 }]);
  });

  it('recognises .json files and gets the game name from the folder', () => {
    expect(findFormat('C:\\Games\\Not Human\\save.json')?.id).toBe('json');
    expect(jsonGameName('C:\\Games\\Not Human\\saves\\slot1.json')).toBe('Not Human');
    expect(jsonGameName('/home/me/Downloads/nothuman_save.json')).toBe('Downloads');
    expect(looksLikeJsonSave('{"a":1}')).toBe(true);
    expect(looksLikeJsonSave('plain')).toBe(false);
  });
});

function sugarNames(save: ReturnType<typeof parseJsonSave>) {
  return jsonFormat.namedVariables!(save).map((v) => v.name);
}

// Real JSON saves dropped into save_files/ (git-ignored).
const dir = join(process.cwd(), 'save_files');
const realSaves = existsSync(dir) ? readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.json')) : [];

describe.skipIf(realSaves.length === 0)('real JSON saves', () => {
  it.each(realSaves)('%s: writes back unchanged, and an edit changes only that value', (file) => {
    const text = readFileSync(join(dir, file), 'utf8');
    const save = parseJsonSave(text);
    expect(serializeJsonSave(save)).toBe(text);

    const variable = jsonFormat.namedVariables!(save).find((v) => v.node.editable === 'number');
    if (!variable) return;
    const value = variable.node.value as number;
    const out = serializeJsonSave(jsonTree.setValue(save, variable.node, value + 1));
    const before = JSON.parse(text);
    const after = JSON.parse(out);
    const [top, field] = variable.name.split('.');
    if (field) before[top][field] = value + 1;
    else before[top] = value + 1;
    expect(after).toEqual(before);
  });
});
