import { describe, expect, it } from 'vitest';
import { arrayPath, unwrapArray } from './jsonExUtils';

describe('unwrapArray', () => {
  it('reads MV "@a"-wrapped arrays and MZ plain arrays', () => {
    const mv = { '@a': [null, true], '@c': 5 };
    const mz = [null, true];
    expect(unwrapArray(mv)).toBe(mv['@a']);
    expect(unwrapArray(mz)).toBe(mz);
  });

  it('returns an empty array for missing data', () => {
    expect(unwrapArray(undefined)).toEqual([]);
    expect(unwrapArray({})).toEqual([]);
  });
});

describe('arrayPath', () => {
  it('points at "@a" only for MV-wrapped arrays', () => {
    expect(arrayPath({ '@a': [] }, 'saveData.switches._data')).toBe('saveData.switches._data.@a');
    expect(arrayPath([], 'saveData.switches._data')).toBe('saveData.switches._data');
  });
});
