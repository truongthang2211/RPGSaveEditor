import { describe, expect, it } from 'vitest';
import { arrayKeys, isArrayLike, unwrapArray } from './jsonEx';

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

describe('arrayKeys / isArrayLike', () => {
  it('adds "@a" only for MV-wrapped arrays', () => {
    expect(arrayKeys({ '@a': [] })).toEqual(['@a']);
    expect(arrayKeys([])).toEqual([]);
    expect(arrayKeys({ 1: 2 })).toEqual([]);
  });

  it('recognises both array shapes but not plain objects', () => {
    expect(isArrayLike({ '@a': [] })).toBe(true);
    expect(isArrayLike([])).toBe(true);
    expect(isArrayLike({ 1: 2 })).toBe(false);
    expect(isArrayLike(undefined)).toBe(false);
  });
});
