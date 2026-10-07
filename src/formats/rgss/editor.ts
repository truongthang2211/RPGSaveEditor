import { ActorField, ActorView, InventoryKind, SaveEditor } from '../types';
import { MObject, MValue } from '../marshal/types';
import { decodeString, getSymbolKey, isNode, makeString, numberLike, toDisplayValue, toNumber } from '../marshal/helpers';
import { originalIndex, originalIntKey, PatchedView, patchField, patchIndex, patchIntKey, restoreIndex, restoreIntKey, RgssSave } from './patches';

export type { RgssSave } from './patches';

export type RgssPart = 'party' | 'actors' | 'switches' | 'variables';

/** How an RGSS version (XP / VX / VX Ace) lays out the data the editor touches. */
export interface RgssEditorSpec {
  /** Finds Game_Party / Game_Actors / Game_Switches / Game_Variables in the save's dumps. */
  locate(dumps: MValue[], part: RgssPart): MObject | undefined;
  /** Instance variable per stat; stats the engine doesn't have are omitted. */
  stats: Partial<Record<Exclude<ActorField, 'exp'>, string>>;
  /** VX Ace keeps EXP per class (@exp Hash); XP and VX keep a total (@exp Integer). */
  expPerClass: boolean;
  /** Bonus params: one Array field (VX Ace) or one field per param (XP/VX). */
  params: { field: string; labels: string[] } | { fields: string[]; labels: string[] };
  statLabels?: Partial<Record<ActorField, string>>;
}

/**
 * Class/actor parameter tables are Table(n, 100) in XP, VX and VX Ace, so
 * param_base looks up nil (-> NoMethodError in Game_BattlerBase#param) for a
 * level outside 1..99.
 */
const ACTOR_LIMITS: ActorView['limits'] = { level: { min: 1, max: 99 } };

const clamp = (value: number, range?: { min: number; max: number }) =>
  range ? Math.min(range.max, Math.max(range.min, value)) : value;

const INVENTORY_FIELDS: Record<InventoryKind, string> = {
  items: '@items',
  weapons: '@weapons',
  armors: '@armors',
};

/**
 * VX Ace: DataManager.make_save_contents -> contents[:party] etc. Contents is
 * normally the second dump, but scripts may write extra dumps (e.g. a
 * thumbnail between header and contents), so every dump is searched.
 */
export const locateInContents = (dumps: MValue[], part: RgssPart): MObject | undefined => {
  for (const dump of dumps ?? []) {
    const value = getSymbolKey(dump, part);
    if (isNode(value, 'object')) return value;
  }
  return undefined;
};

const CLASS_NAMES: Record<RgssPart, string> = {
  party: 'Game_Party',
  actors: 'Game_Actors',
  switches: 'Game_Switches',
  variables: 'Game_Variables',
};

/** XP/VX: each $game_* object is its own dump; find it by class name. */
export const locateByClass = (dumps: MValue[], part: RgssPart): MObject | undefined =>
  dumps?.find((dump): dump is MObject => isNode(dump, 'object') && dump.className.name === CLASS_NAMES[part]);

/**
 * Editor for an RGSS save. Getters read through the save's patches; setters
 * add a patch and return a new save (the dumps themselves are never mutated).
 */
export function createRgssEditor(spec: RgssEditorSpec): SaveEditor<RgssSave> {
  const view = (save: RgssSave) => new PatchedView(save.patches);
  const part = (save: RgssSave, name: RgssPart) => spec.locate(save.dumps, name);
  const requirePart = (save: RgssSave, name: RgssPart): MObject => {
    const obj = part(save, name);
    if (!obj) throw new Error(`Save has no ${name} data`);
    return obj;
  };
  const actorList = (save: RgssSave) => {
    const v = view(save);
    return v.items(v.field(part(save, 'actors'), '@data'));
  };
  const requireActor = (save: RgssSave, slot: number): MObject => {
    const actor = actorList(save)[slot];
    if (!isNode(actor, 'object')) throw new Error(`No actor in slot ${slot}`);
    return actor;
  };
  const classIdOf = (v: PatchedView, actor: MValue) => toNumber(v.field(actor, '@class_id')) ?? 1;
  const requireArray = (value: MValue | undefined, what: string) => {
    if (!isNode(value, 'array')) throw new Error(`Save has no ${what}`);
    return value;
  };
  const requireHash = (value: MValue | undefined, what: string) => {
    if (!isNode(value, 'hash')) throw new Error(`Save has no ${what}`);
    return value;
  };

  return {
    getGold: (save) => toNumber(view(save).field(part(save, 'party'), '@gold')) ?? 0,
    setGold: (save, gold) => {
      const party = requirePart(save, 'party');
      return patchField(save, party, '@gold', numberLike(view(save).field(party, '@gold'), gold));
    },

    getInventory: (save, kind) => {
      const v = view(save);
      const result: Record<number, number> = {};
      for (const [id, count] of v.intEntries(v.field(part(save, 'party'), INVENTORY_FIELDS[kind]))) {
        result[id] = toNumber(count) ?? 0;
      }
      return result;
    },
    setInventoryCount: (save, kind, id, count) => {
      const v = view(save);
      const hash = requireHash(v.field(requirePart(save, 'party'), INVENTORY_FIELDS[kind]), `party ${kind}`);
      // 0 of an item the file doesn't list is how the file already reads.
      if (count === 0 && originalIntKey(save, hash, id) === undefined) return restoreIntKey(save, hash, id);
      return patchIntKey(save, hash, id, count);
    },

    getActors: (save) => {
      const v = view(save);
      const stat = (actor: MValue, field: Exclude<ActorField, 'exp'>) => {
        const name = spec.stats[field];
        return name ? toNumber(v.field(actor, name)) : undefined;
      };
      const paramsOf = (actor: MValue): MValue[] =>
        'field' in spec.params
          ? v.items(v.field(actor, spec.params.field))
          : spec.params.fields.map((field) => v.field(actor, field) ?? null);
      const expOf = (actor: MValue) =>
        spec.expPerClass ? v.intKey(v.field(actor, '@exp'), classIdOf(v, actor)) : v.field(actor, '@exp');

      return actorList(save).flatMap((actor, slot): ActorView[] => {
        if (!isNode(actor, 'object')) return [];
        return [{
          slot,
          name: decodeString(v.field(actor, '@name')) ?? '',
          paramPlus: paramsOf(actor).map((value) => toNumber(value) ?? 0),
          paramLabels: spec.params.labels,
          statLabels: spec.statLabels,
          limits: ACTOR_LIMITS,
          hp: stat(actor, 'hp'),
          mp: stat(actor, 'mp'),
          tp: stat(actor, 'tp'),
          level: stat(actor, 'level'),
          exp: toNumber(expOf(actor)),
        }];
      });
    },
    setActorField: (save, slot, field, rawValue) => {
      const v = view(save);
      const actor = requireActor(save, slot);
      const value = clamp(rawValue, ACTOR_LIMITS?.[field]);
      if (field === 'exp') {
        if (!spec.expPerClass) return patchField(save, actor, '@exp', numberLike(v.field(actor, '@exp'), value));
        const exp = requireHash(v.field(actor, '@exp'), 'EXP table for this actor');
        const classId = classIdOf(v, actor);
        return patchIntKey(save, exp, classId, numberLike(v.intKey(exp, classId), value));
      }
      const name = spec.stats[field];
      if (!name) throw new Error(`This engine has no ${field}`);
      return patchField(save, actor, name, numberLike(v.field(actor, name), value));
    },
    setActorParamPlus: (save, slot, index, value) => {
      const v = view(save);
      const actor = requireActor(save, slot);
      if ('field' in spec.params) {
        const params = requireArray(v.field(actor, spec.params.field), 'bonus params for this actor');
        return patchIndex(save, params, index, numberLike(v.items(params)[index], value));
      }
      const field = spec.params.fields[index];
      if (!field) throw new Error(`No bonus param #${index}`);
      return patchField(save, actor, field, numberLike(v.field(actor, field), value));
    },

    getSwitches: (save) => {
      const v = view(save);
      return v.items(v.field(part(save, 'switches'), '@data')).map((s) => (s === null ? null : s === true));
    },
    setSwitch: (save, id, value) => {
      const v = view(save);
      const data = requireArray(v.field(requirePart(save, 'switches'), '@data'), 'switch data');
      // Off for a switch the file has as nil (or doesn't have) is how the file already reads.
      if (!value && (originalIndex(save, data, id) ?? null) === null) return restoreIndex(save, data, id);
      return patchIndex(save, data, id, value);
    },

    getVariables: (save) => {
      const v = view(save);
      const result: Record<number, any> = {};
      v.items(v.field(part(save, 'variables'), '@data')).forEach((value, id) => {
        result[id] = toDisplayValue(value);
      });
      return result;
    },
    setVariable: (save, id, value) => {
      const v = view(save);
      const data = requireArray(v.field(requirePart(save, 'variables'), '@data'), 'variable data');
      const stored: MValue =
        typeof value === 'number' ? numberLike(v.items(data)[id], value)
        : typeof value === 'boolean' || value === null ? value
        : makeString(String(value));
      // 0 for a variable the file has as nil (or doesn't have) is how the file already reads.
      if (value === 0 && (originalIndex(save, data, id) ?? null) === null) return restoreIndex(save, data, id);
      return patchIndex(save, data, id, stored);
    },
  };
}
