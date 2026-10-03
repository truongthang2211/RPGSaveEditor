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

/** An RGSS save file: the Marshal dumps it contains, in order. */
export type RgssSave = MValue[];

export type RgssPart = 'party' | 'actors' | 'switches' | 'variables';

/** How an RGSS version (XP / VX / VX Ace) lays out the data the editor touches. */
export interface RgssEditorSpec {
  /** Finds Game_Party / Game_Actors / Game_Switches / Game_Variables in the save. */
  locate(save: RgssSave, part: RgssPart): MObject | undefined;
  /** Instance variable per stat; stats the engine doesn't have are omitted. */
  stats: Partial<Record<Exclude<ActorField, 'exp'>, string>>;
  /** VX Ace keeps EXP per class (@exp Hash); XP and VX keep a total (@exp Integer). */
  expPerClass: boolean;
  /** Bonus params: one Array field (VX Ace) or one field per param (XP/VX). */
  params: { field: string; labels: string[] } | { fields: string[]; labels: string[] };
  statLabels?: Partial<Record<ActorField, string>>;
}

const INVENTORY_FIELDS: Record<InventoryKind, string> = {
  items: '@items',
  weapons: '@weapons',
  armors: '@armors',
};

/** VX Ace: DataManager.make_save_contents -> contents[:party] etc. */
export const locateInContents = (save: RgssSave, part: RgssPart): MObject | undefined => {
  const value = getSymbolKey(save?.[1], part);
  return isNode(value, 'object') ? value : undefined;
};

const CLASS_NAMES: Record<RgssPart, string> = {
  party: 'Game_Party',
  actors: 'Game_Actors',
  switches: 'Game_Switches',
  variables: 'Game_Variables',
};

/** XP/VX: each $game_* object is its own dump; find it by class name. */
export const locateByClass = (save: RgssSave, part: RgssPart): MObject | undefined =>
  save?.find((dump): dump is MObject => isNode(dump, 'object') && dump.className.name === CLASS_NAMES[part]);

/**
 * Setters edit a structuredClone of the save: the Marshal tree has shared and
 * cyclic references (e.g. VX Ace Game_ActionResult#@battler -> its actor),
 * which a path copy would split into separate objects.
 */
function edit(save: RgssSave, change: (copy: RgssSave) => void): RgssSave {
  const copy = structuredClone(save);
  change(copy);
  return copy;
}

export function createRgssEditor(spec: RgssEditorSpec): SaveEditor<RgssSave> {
  const requirePart = (save: RgssSave, part: RgssPart): MObject => {
    const obj = spec.locate(save, part);
    if (!obj) throw new Error(`Save has no ${part} data`);
    return obj;
  };
  const actorList = (save: RgssSave) => arrayItems(getField(spec.locate(save, 'actors'), '@data'));
  const requireActor = (save: RgssSave, slot: number): MObject => {
    const actor = actorList(save)[slot];
    if (!isNode(actor, 'object')) throw new Error(`No actor in slot ${slot}`);
    return actor;
  };
  const classIdOf = (actor: MValue) => toNumber(getField(actor, '@class_id')) ?? 1;
  const expOf = (actor: MValue) =>
    spec.expPerClass ? getIntKey(getField(actor, '@exp'), classIdOf(actor)) : getField(actor, '@exp');
  const paramsOf = (actor: MValue): MValue[] =>
    'field' in spec.params
      ? arrayItems(getField(actor, spec.params.field))
      : spec.params.fields.map((field) => getField(actor, field) ?? null);
  const stat = (actor: MValue, field: Exclude<ActorField, 'exp'>) => {
    const name = spec.stats[field];
    return name ? toNumber(getField(actor, name)) : undefined;
  };

  return {
    getGold: (save) => toNumber(getField(spec.locate(save, 'party'), '@gold')) ?? 0,
    setGold: (save, gold) =>
      edit(save, (copy) => {
        const party = requirePart(copy, 'party');
        setField(party, '@gold', numberLike(getField(party, '@gold'), gold));
      }),

    getInventory: (save, kind) => {
      const hash = getField(spec.locate(save, 'party'), INVENTORY_FIELDS[kind]);
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
        const hash = getField(requirePart(copy, 'party'), INVENTORY_FIELDS[kind]);
        if (!isNode(hash, 'hash')) throw new Error(`Save has no party ${kind}`);
        setIntKey(hash, id, count);
      }),

    getActors: (save) =>
      actorList(save).flatMap((actor, slot): ActorView[] => {
        if (!isNode(actor, 'object')) return [];
        return [{
          slot,
          name: decodeString(getField(actor, '@name')) ?? '',
          paramPlus: paramsOf(actor).map((v) => toNumber(v) ?? 0),
          paramLabels: spec.params.labels,
          statLabels: spec.statLabels,
          hp: stat(actor, 'hp'),
          mp: stat(actor, 'mp'),
          tp: stat(actor, 'tp'),
          level: stat(actor, 'level'),
          exp: toNumber(expOf(actor)),
        }];
      }),
    setActorField: (save, slot, field, value) =>
      edit(save, (copy) => {
        const actor = requireActor(copy, slot);
        if (field === 'exp') {
          if (!spec.expPerClass) {
            setField(actor, '@exp', numberLike(getField(actor, '@exp'), value));
            return;
          }
          const exp = getField(actor, '@exp');
          if (!isNode(exp, 'hash')) throw new Error('Actor has no EXP table');
          const classId = classIdOf(actor);
          setIntKey(exp, classId, numberLike(getIntKey(exp, classId), value));
          return;
        }
        const name = spec.stats[field];
        if (!name) throw new Error(`This engine has no ${field}`);
        setField(actor, name, numberLike(getField(actor, name), value));
      }),
    setActorParamPlus: (save, slot, index, value) =>
      edit(save, (copy) => {
        const actor = requireActor(copy, slot);
        if ('field' in spec.params) {
          const params = getField(actor, spec.params.field);
          if (!isNode(params, 'array')) throw new Error('Actor has no bonus params');
          setArrayItem(params, index, numberLike(params.items[index], value));
          return;
        }
        const field = spec.params.fields[index];
        if (!field) throw new Error(`No bonus param #${index}`);
        setField(actor, field, numberLike(getField(actor, field), value));
      }),

    getSwitches: (save) =>
      arrayItems(getField(spec.locate(save, 'switches'), '@data')).map((v) => (v === null ? null : v === true)),
    setSwitch: (save, id, value) =>
      edit(save, (copy) => {
        const data = getField(requirePart(copy, 'switches'), '@data');
        if (!isNode(data, 'array')) throw new Error('Save has no switch data');
        setArrayItem(data, id, value);
      }),

    getVariables: (save) => {
      const result: Record<number, any> = {};
      arrayItems(getField(spec.locate(save, 'variables'), '@data')).forEach((value, id) => {
        result[id] = toDisplayValue(value);
      });
      return result;
    },
    setVariable: (save, id, value) =>
      edit(save, (copy) => {
        const data = getField(requirePart(copy, 'variables'), '@data');
        if (!isNode(data, 'array')) throw new Error('Save has no variable data');
        const stored: MValue =
          typeof value === 'number' ? numberLike(data.items[id], value)
          : typeof value === 'boolean' || value === null ? value
          : makeString(String(value));
        setArrayItem(data, id, stored);
      }),
  };
}
