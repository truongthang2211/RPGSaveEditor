import { ActorField, ActorView, InventoryKind, SaveEditor } from '../types';
import { Path, setIn, updateIn } from '../immutable';
import { arrayKeys, isArrayLike, unwrapArray } from './jsonEx';
import { MvMzSave } from './codec';

const INVENTORY_KEYS: Record<InventoryKind, string> = {
  items: '_items',
  weapons: '_weapons',
  armors: '_armors',
};

/** Game_Actor fields edited by the UI (EXP is stored per class id). */
const ACTOR_FIELDS: Record<Exclude<ActorField, 'exp'>, string> = {
  hp: '_hp',
  mp: '_mp',
  tp: '_tp',
  level: '_level',
};

function actorPath(save: MvMzSave, slot: number): Path {
  return ['actors', '_data', ...arrayKeys(save?.actors?._data), slot];
}

function actorAt(save: MvMzSave, slot: number): any {
  return unwrapArray(save?.actors?._data)[slot];
}

function classIdOf(actor: any): string {
  return String(actor?._classId ?? 1);
}

/** Game_Variables._data as id -> value (MV/MZ store an array; some saves use an object). */
function variablesOf(save: MvMzSave): Record<number, any> {
  const data = save?.variables?._data;
  if (!isArrayLike(data)) return data || {};
  const result: Record<number, any> = {};
  unwrapArray(data).forEach((value, id) => {
    result[id] = value;
  });
  return result;
}

export const mvmzEditor: SaveEditor<MvMzSave> = {
  getGold: (save) => save?.party?._gold ?? 0,
  setGold: (save, gold) => setIn(save, ['party', '_gold'], gold),

  getInventory: (save, kind) => save?.party?.[INVENTORY_KEYS[kind]] || {},
  setInventoryCount: (save, kind, id, count) =>
    updateIn(save, ['party', INVENTORY_KEYS[kind]], (inventory) => ({ ...inventory, [id]: count })),

  getActors: (save) =>
    unwrapArray(save?.actors?._data).flatMap((actor, slot): ActorView[] =>
      actor == null
        ? []
        : [{
            slot,
            name: actor._name,
            paramPlus: unwrapArray(actor._paramPlus),
            hp: actor._hp,
            mp: actor._mp,
            tp: actor._tp,
            level: actor._level,
            exp: actor._exp?.[classIdOf(actor)],
          }],
    ),
  setActorField: (save, slot, field, value) => {
    const key = field === 'exp' ? ['_exp', classIdOf(actorAt(save, slot))] : [ACTOR_FIELDS[field]];
    return setIn(save, [...actorPath(save, slot), ...key], value);
  },
  setActorParamPlus: (save, slot, index, value) => {
    const paramPlus = actorAt(save, slot)?._paramPlus;
    return setIn(save, [...actorPath(save, slot), '_paramPlus', ...arrayKeys(paramPlus), index], value);
  },

  getSwitches: (save) => unwrapArray(save?.switches?._data),
  setSwitch: (save, id, value) =>
    setIn(save, ['switches', '_data', ...arrayKeys(save?.switches?._data), id], value),

  getVariables: variablesOf,
  setVariable: (save, id, value) => {
    const data = save?.variables?._data;
    if (isArrayLike(data)) {
      return setIn(save, ['variables', '_data', ...arrayKeys(data), id], value);
    }
    return updateIn(save, ['variables', '_data'], (vars) => ({ ...vars, [id]: value }));
  },
};
