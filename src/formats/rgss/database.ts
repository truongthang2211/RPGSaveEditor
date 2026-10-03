import { SystemData } from '../../types/System';
import { DatabaseEntry } from '../types';
import { MValue } from '../marshal/types';
import { arrayItems, decodeString, getField, isNode, toNumber } from '../marshal/helpers';

/** Data/Items|Weapons|Armors.rvdata2: [nil, RPG::Item, ...] -> id/name/description. */
export function toDatabaseEntries(value: MValue): (DatabaseEntry | null)[] {
  return arrayItems(value).map((entry) =>
    isNode(entry, 'object')
      ? {
          id: toNumber(getField(entry, '@id')) ?? 0,
          name: decodeString(getField(entry, '@name')) ?? '',
          description: decodeString(getField(entry, '@description')) ?? '',
        }
      : null,
  );
}

/** Data/System.rvdata2: RPG::System -> switch and variable names. */
export function toSystemData(value: MValue): SystemData {
  const names = (field: string) => arrayItems(getField(value, field)).map((name) => decodeString(name) ?? null);
  return { switches: names('@switches'), variables: names('@variables') };
}
