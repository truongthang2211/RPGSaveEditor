import { describe, expect, it } from 'vitest';
import { MatchContext, matches, parseQuery, usesOld } from './query';

const ctx = (over: Partial<MatchContext>): MatchContext => ({
  key: '@gold',
  type: 'Integer',
  value: 1500,
  oldValue: undefined,
  path: ['dump 1', ':party', '@gold'],
  ...over,
});
const test = (query: string, over: Partial<MatchContext> = {}) => matches(parseQuery(query), ctx(over));

describe('search query', () => {
  it('plain words search key, type and value (case-insensitive)', () => {
    expect(test('gold')).toBe(true);
    expect(test('INTEGER')).toBe(true);
    expect(test('150')).toBe(true);
    expect(test('silver')).toBe(false);
  });

  it('quoted text must match a whole key or value', () => {
    expect(test('"Lona"', { key: '@name', type: 'String', value: 'Lona' })).toBe(true);
    expect(test('"Lon"', { key: '@name', type: 'String', value: 'Lona' })).toBe(false);
    expect(test('"party"', { key: ':party', type: 'Game_Party', value: undefined })).toBe(true);
  });

  it('regexes match key, type or value', () => {
    expect(test('/^@g/')).toBe(true);
    expect(test('/^@stat_/', { key: '@stat_atk' })).toBe(true);
    expect(test('/^game_/', { type: 'Game_Party', key: ':party', value: undefined })).toBe(true);
    expect(() => parseQuery('/[/')).toThrow(/Invalid regex/);
  });

  it('field prefixes restrict where to look', () => {
    expect(test('key:gold')).toBe(true);
    expect(test('type:gold')).toBe(false);
    expect(test('type:game_', { type: 'Game_Party' })).toBe(true);
    expect(test('value:1500')).toBe(true);
    expect(test('key:"@gold"')).toBe(true);
    expect(test('key:party', { key: ':party' })).toBe(true);
  });

  it('compares numbers and ranges', () => {
    expect(test('>1000')).toBe(true);
    expect(test('>=1500')).toBe(true);
    expect(test('<1500')).toBe(false);
    expect(test('=1500')).toBe(true);
    expect(test('!=1500')).toBe(false);
    expect(test('1000..2000')).toBe(true);
    expect(test('2000..3000')).toBe(false);
    expect(test('value:>1000')).toBe(true);
    expect(test('>10', { value: 'abc' })).toBe(false);
    expect(test('=abc', { value: 'ABC' })).toBe(true);
  });

  it('matches paths as suffixes with * and ** wildcards', () => {
    expect(test('party.@gold')).toBe(true);
    expect(test('party.@items')).toBe(false);
    expect(test('*.@gold')).toBe(true);
    expect(test('dump 1.**.@gold'.replace(' ', ''))).toBe(false); // "dump1" is not a key
    expect(test('path:party.@gold')).toBe(true);
    const deep = { path: ['dump 2', ':actors', '@data', '[1]', '@hp'], key: '@hp' };
    expect(test('actors.**.@hp', deep)).toBe(true);
    expect(test('actors.*.@hp', deep)).toBe(false);
    expect(test('@data.1.@hp', deep)).toBe(true);
    expect(test('1.5')).toBe(false); // a number with a dot is not a path
  });

  it('old: compares the previous save, and terms combine with AND', () => {
    const changed = { value: 125, oldValue: 120 };
    expect(test('old:120 =125', changed)).toBe(true);
    expect(test('old:120 =130', changed)).toBe(false);
    expect(test('key:@gold old:<200 >100', changed)).toBe(true);
    expect(test('old:120')).toBe(false); // no previous value
    expect(usesOld(parseQuery('old:1'))).toBe(true);
    expect(usesOld(parseQuery('gold'))).toBe(false);
  });

  it('ignores extra spaces', () => {
    expect(parseQuery('   gold    >1   ')).toHaveLength(2);
    expect(parseQuery('')).toEqual([]);
  });
});
