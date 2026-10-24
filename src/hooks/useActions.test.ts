import { describe, expect, it } from 'vitest';
import { sameGameAs } from './useActions';
import { SaveFormat } from '../formats';

const formatA = { id: 'a' } as SaveFormat;
const formatB = { id: 'b' } as SaveFormat;

describe('sameGameAs', () => {
  it('is the same game when both the name and the format match', () => {
    expect(sameGameAs(formatA, 'My Game', formatA, 'My Game')).toBe(true);
  });

  it('is not the same game when the format differs, even with the same (guessed) name', () => {
    // Two different games' saves can land on the same name when it's only guessed from the file's
    // path (e.g. two unrelated files picked from the same folder); comparing their data would crash.
    expect(sameGameAs(formatB, 'save_files', formatA, 'save_files')).toBe(false);
  });

  it('is not the same game when the name differs, even in the same format', () => {
    expect(sameGameAs(formatA, 'Another Game', formatA, 'My Game')).toBe(false);
  });

  it('is not the same game on the very first open (nothing opened before)', () => {
    expect(sameGameAs(formatA, 'My Game', undefined, undefined)).toBe(false);
  });
});
