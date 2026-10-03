import { describe, expect, it } from 'vitest';
import { toDatabaseEntries, toSystemData } from './database';
import { makeString, symbol } from '../marshal/helpers';
import { MObject, MValue } from '../marshal/types';

const rpgObject = (className: string, fields: Record<string, MValue>): MObject => ({
  kind: 'object',
  className: symbol(className),
  fields: Object.entries(fields).map(([name, value]) => [symbol(name), value]),
});

describe('VX Ace database', () => {
  it('maps RPG::Item arrays to id/name/description', () => {
    const items = {
      kind: 'array' as const,
      items: [
        null,
        rpgObject('RPG::Item', { '@id': 1, '@name': makeString('Potion'), '@description': makeString('Heals 50 HP') }),
        rpgObject('RPG::Item', { '@id': 2, '@name': makeString('ポーション'), '@description': null }),
      ],
    };
    expect(toDatabaseEntries(items)).toEqual([
      null,
      { id: 1, name: 'Potion', description: 'Heals 50 HP' },
      { id: 2, name: 'ポーション', description: '' },
    ]);
  });

  it('reads switch and variable names from RPG::System', () => {
    const system = rpgObject('RPG::System', {
      '@switches': { kind: 'array', items: [makeString(''), makeString('Door open')] },
      '@variables': { kind: 'array', items: [makeString(''), makeString('Gold found')] },
    });
    expect(toSystemData(system)).toEqual({ switches: ['', 'Door open'], variables: ['', 'Gold found'] });
  });
});
