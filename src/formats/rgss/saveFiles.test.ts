import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readMarshalStream } from '../marshal/reader';
import { writeMarshalStream } from '../marshal/writer';
import { SaveEditor } from '../types';
import { vxaceEditor } from '../vxace/editor';
import { vxEditor } from '../vx/editor';
import { xpEditor } from '../xp/editor';

/**
 * Edits every real RGSS save in save_files/ (git-ignored, local only) through
 * its engine's editor: the edit must survive a write/read cycle, and undoing
 * it must give back the original file byte-for-byte.
 */
const EDITORS: Record<string, SaveEditor> = { rvdata2: vxaceEditor, rvdata: vxEditor, rxdata: xpEditor };

const dir = join(process.cwd(), 'save_files');
const files = existsSync(dir)
  ? readdirSync(dir).filter((f) => (f.split('.').pop()?.toLowerCase() ?? '') in EDITORS)
  : [];

describe.skipIf(files.length === 0)('editing real RGSS saves', () => {
  it.each(files)('%s', (file) => {
    const editor = EDITORS[file.split('.').pop()!.toLowerCase()];
    const original = new Uint8Array(readFileSync(join(dir, file)));
    const save = readMarshalStream(original);

    const gold = editor.getGold(save);
    const [actor] = editor.getActors(save);
    const switches = editor.getSwitches(save);

    let edited = editor.setGold(save, gold + 12345);
    if (actor?.level !== undefined) edited = editor.setActorField(edited, actor.slot, 'level', actor.level + 1);
    if (actor && actor.paramPlus.length > 2) edited = editor.setActorParamPlus(edited, actor.slot, 2, actor.paramPlus[2] + 7);
    if (switches.length > 1) edited = editor.setSwitch(edited, 1, !switches[1]);

    const back = readMarshalStream(writeMarshalStream(edited));
    expect(editor.getGold(back)).toBe(gold + 12345);
    if (actor?.level !== undefined) expect(editor.getActors(back)[0].level).toBe(actor.level + 1);
    if (actor && actor.paramPlus.length > 2) expect(editor.getActors(back)[0].paramPlus[2]).toBe(actor.paramPlus[2] + 7);
    if (switches.length > 1) expect(editor.getSwitches(back)[1]).toBe(!switches[1]);

    let reverted = editor.setGold(back, gold);
    if (actor?.level !== undefined) reverted = editor.setActorField(reverted, actor.slot, 'level', actor.level);
    if (actor && actor.paramPlus.length > 2) reverted = editor.setActorParamPlus(reverted, actor.slot, 2, actor.paramPlus[2]);
    if (switches.length > 1) reverted = editor.setSwitch(reverted, 1, switches[1] as boolean);
    expect(Buffer.from(writeMarshalStream(reverted)).equals(Buffer.from(original))).toBe(true);
  });
});
