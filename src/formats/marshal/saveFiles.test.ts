import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readMarshalStream } from './reader';
import { writeMarshalStream } from './writer';

/**
 * Round-trips real RGSS saves from save_files/ (git-ignored, local only).
 * Skipped when the folder is missing or empty.
 */
const dir = join(process.cwd(), 'save_files');
const files = existsSync(dir)
  ? readdirSync(dir).filter((f) => /\.(rvdata2|rvdata|rxdata)$/i.test(f))
  : [];

describe.skipIf(files.length === 0)('real save files', () => {
  it.each(files)('%s is rewritten byte-for-byte', (file) => {
    const original = new Uint8Array(readFileSync(join(dir, file)));
    const dumps = readMarshalStream(original);
    const rewritten = writeMarshalStream(dumps);

    expect(rewritten.length).toBe(original.length);
    const firstDiff = rewritten.findIndex((b, i) => b !== original[i]);
    expect(firstDiff).toBe(-1);
  });

  it.each(files)('%s survives structuredClone (as the editor copies saves)', (file) => {
    const original = new Uint8Array(readFileSync(join(dir, file)));
    const rewritten = writeMarshalStream(structuredClone(readMarshalStream(original)));
    expect(Buffer.from(rewritten).equals(Buffer.from(original))).toBe(true);
  });
});
