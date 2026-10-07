import { describe, expect, it } from 'vitest';
import { mvmzTree } from '../../formats/mvmz/tree';
import { applySuggestion, fieldAtEnd, suggestions, VocabularyCollector } from './suggest';

describe('search suggestions', () => {
  it('collects the keys and types of a save, without array indexes', () => {
    const save = { party: { _gold: 1, _items: { 1: 3 } }, actors: { _data: { '@a': [null, { _hp: 5, _name: 'A' }] } } };
    const collector = new VocabularyCollector(mvmzTree, save);
    let steps = 0;
    while (!collector.step(2)) steps++;
    expect(steps).toBeGreaterThan(1); // runs in steps
    const { keys, types } = collector.vocabulary;
    expect(keys).toEqual(expect.arrayContaining(['party', '_gold', '_items', 'actors', '_hp', '_name']));
    expect(keys.some((k) => /^\[\d+\]$/.test(k))).toBe(false);
    expect(types).toEqual(expect.arrayContaining(['Number', 'String', 'null']));
  });

  it('finds the field being typed at the end of the query', () => {
    expect(fieldAtEnd('key:@he')).toEqual({ field: 'key', partial: '@he', start: 4 });
    expect(fieldAtEnd('gold TYPE:Gam')).toEqual({ field: 'type', partial: 'Gam', start: 10 });
    expect(fieldAtEnd('key:"rollback lo')).toBeNull(); // inside quotes with a space: not suggested
    expect(fieldAtEnd('key:@hp ')).toBeNull(); // finished
    expect(fieldAtEnd('gold')).toBeNull();
  });

  it('suggests prefix matches first and applies a choice', () => {
    expect(suggestions(['@mhp', '@hp', '@help', 'party'], '@h')).toEqual(['@hp', '@help']);
    expect(suggestions(['@mhp', '@hp', '@help', 'party'], 'hp')).toEqual(['@mhp', '@hp']); // contained, not prefix
    expect(suggestions(['@hp'], '@hp')).toEqual([]); // already typed
    expect(applySuggestion('gold key:@h', 9, '@hp')).toBe('gold key:@hp ');
    expect(applySuggestion('key:roll', 4, 'rollback log')).toBe('key:"rollback log" ');
  });
});
