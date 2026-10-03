import { ActorField, ActorView, InventoryKind, SaveEditor } from '../types';
import { MObject, MValue } from '../marshal/types';
import {
  arrayItems,
  decodeString,
  getField,
  getIntKey,
  getSymbolKey,
  isNode,
  makeString,
  numberLike,
  setArrayItem,
  setField,
  setIntKey,
  toDisplayValue,
  toNumber,
} from '../marshal/helpers';

/** A VX Ace save file: [header, contents], two consecutive Marshal dumps. */
export type VxAceSave = MValue[];

const INVENTORY_FIELDS: Record<InventoryKind, string> = {
  items: '@items',
  weapons: '@weapons',
  armors: '@armors',
};

const ACTOR_FIELDS: Record<Exclude<ActorField, 'exp'>, string> = {
  hp: '@hp',
  mp: '@mp',
  tp: '@tp',
  level: '@level',
};

/** contents[:name] from DataManager.make_save_contents. */
const contentsObject = (save: VxAceSave, name: string): MObject | undefined => {
  const value = getSymbolKey(save?.[1], name);
  return isNode(value, 'object') ? value : undefined;
};

const actorList = (save: VxAceSave) => arrayItems(getField(contentsObject(save, 'actors'), '@data'));

const classIdOf = (actor: MValue) => toNumber(getField(actor, '@class_id')) ?? 1;

/**
 * Setters edit a structuredClone of the save: the Marshal tree has shared and
 * cyclic references (e.g. Game_ActionResult#@battler -> its actor), which a
 * path copy would split into separate objects.
 */
function edit(save: VxAceSave, change: (copy: VxAceSave) => void): VxAceSave {
  const copy = structuredClone(save);
  change(copy);
  return copy;
}

function requireObject(save: VxAceSave, name: string): MObject {
  const obj = contentsObject(save, name);
  if (!obj) throw new Error(`Save has no ${name} data`);
  return obj;
}

function requireActor(save: VxAceSave, slot: number): MObject {
  const actor = actorList(save)[slot];
  if (!isNode(actor, 'object')) throw new Error(`No actor in slot ${slot}`);
  return actor;
}

export const vxaceEditor: SaveEditor<VxAceSave> = {
  getGold: (save) => toNumber(getField(contentsObject(save, 'party'), '@gold')) ?? 0,
  setGold: (save, gold) =>
    edit(save, (copy) => {
      const party = requireObject(copy, 'party');
      setField(party, '@gold', numberLike(getField(party, '@gold'), gold));
    }),

  getInventory: (save, kind) => {
    const hash = getField(contentsObject(save, 'party'), INVENTORY_FIELDS[kind]);
    const result: Record<number, number> = {};
    if (isNode(hash, 'hash')) {
      for (const [key, value] of hash.entries) {
        if (typeof key === 'number') result[key] = toNumber(value) ?? 0;
      }
    }
    return result;
  },
  setInventoryCount: (save, kind, id, count) =>
    edit(save, (copy) => {
      const hash = getField(requireObject(copy, 'party'), INVENTORY_FIELDS[kind]);
      if (!isNode(hash, 'hash')) throw new Error(`Save has no party ${kind}`);
      setIntKey(hash, id, count);
    }),

  getActors: (save) =>
    actorList(save).flatMap((actor, slot): ActorView[] => {
      if (!isNode(actor, 'object')) return [];
      return [{
        slot,
        name: decodeString(getField(actor, '@name')) ?? '',
        paramPlus: arrayItems(getField(actor, '@param_plus')).map((v) => toNumber(v) ?? 0),
        hp: toNumber(getField(actor, '@hp')),
        mp: toNumber(getField(actor, '@mp')),
        tp: toNumber(getField(actor, '@tp')),
        level: toNumber(getField(actor, '@level')),
        exp: toNumber(getIntKey(getField(actor, '@exp'), classIdOf(actor))),
      }];
    }),
  setActorField: (save, slot, field, value) =>
    edit(save, (copy) => {
      const actor = requireActor(copy, slot);
      if (field === 'exp') {
        const exp = getField(actor, '@exp');
        if (!isNode(exp, 'hash')) throw new Error('Actor has no EXP table');
        const classId = classIdOf(actor);
        setIntKey(exp, classId, numberLike(getIntKey(exp, classId), value));
        return;
      }
      const name = ACTOR_FIELDS[field];
      setField(actor, name, numberLike(getField(actor, name), value));
    }),
  setActorParamPlus: (save, slot, index, value) =>
    edit(save, (copy) => {
      const paramPlus = getField(requireActor(copy, slot), '@param_plus');
      if (!isNode(paramPlus, 'array')) throw new Error('Actor has no param_plus');
      setArrayItem(paramPlus, index, numberLike(paramPlus.items[index], value));
    }),

  getSwitches: (save) =>
    arrayItems(getField(contentsObject(save, 'switches'), '@data')).map((v) => (v === null ? null : v === true)),
  setSwitch: (save, id, value) =>
    edit(save, (copy) => {
      const data = getField(requireObject(copy, 'switches'), '@data');
      if (!isNode(data, 'array')) throw new Error('Save has no switch data');
      setArrayItem(data, id, value);
    }),

  getVariables: (save) => {
    const result: Record<number, any> = {};
    arrayItems(getField(contentsObject(save, 'variables'), '@data')).forEach((value, id) => {
      result[id] = toDisplayValue(value);
    });
    return result;
  },
  setVariable: (save, id, value) =>
    edit(save, (copy) => {
      const data = getField(requireObject(copy, 'variables'), '@data');
      if (!isNode(data, 'array')) throw new Error('Save has no variable data');
      const stored: MValue =
        typeof value === 'number' ? numberLike(data.items[id], value)
        : typeof value === 'boolean' || value === null ? value
        : makeString(String(value));
      setArrayItem(data, id, stored);
    }),
};
