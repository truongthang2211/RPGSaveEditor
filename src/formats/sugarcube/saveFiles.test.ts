import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isSugarCubeSave, parseSugarCubeSave, serializeSugarCubeSave } from './save';
import { sugarcubeFormat } from './index';
import { sugarcubeTree } from './tree';

const dir = join(process.cwd(), 'save_files');
const realSaves = existsSync(dir)
  ? readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.save') && isSugarCubeSave(new Uint8Array(readFileSync(join(dir, f)))))
  : [];

describe.skipIf(realSaves.length === 0)('SugarCube real saves', () => {
  it.each(realSaves)('%s: writes back unchanged, and edits survive a write/read cycle', (file) => {
    const text = readFileSync(join(dir, file), 'utf8');
    const save = parseSugarCubeSave(text);
    expect(serializeSugarCubeSave(save)).toBe(text);

    const variables = sugarcubeFormat.namedVariables!(save);
    expect(variables.length).toBeGreaterThan(0);
    const number = variables.find((v) => v.node.editable === 'number')!;
    const edited = sugarcubeTree.setValue(save, number.node, (number.node.value as number) + 1);

    const back = parseSugarCubeSave(serializeSugarCubeSave(edited));
    const after = sugarcubeFormat.namedVariables!(back).find((v) => v.name === number.name)!;
    expect(after.node.value).toBe((number.node.value as number) + 1);
    expect(back.history.filter((_, i) => i !== save.index)).toEqual(save.history.filter((_, i) => i !== save.index));
  });
});
