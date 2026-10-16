import { readBinary, writeBinary } from '../../utils/fileUtils';
import { hasExtension, pathSegments } from '../../utils/path';
import { rgssGameName } from '../rgss/paths';
import { ActorField, ActorView, InventoryKind, SaveEditor, SaveFormat } from '../types';
import { decodeText } from './lcf';
import {
  ACTOR, actorsOf, INVENTORY, LsdSave, numberAt, parseLsdSave, SAVE, sameLsdData, serializeLsdSave, structOf, SYSTEM, updateActor, updateStruct,
  vectorAt, withNumber, withVector,
} from './save';
import { lsdTree } from './tree';

export const RM2K_EXTENSIONS = ['lsd'] as const;

/** RPG Maker 2000/2003 limits. */
const MAX_GOLD = 999999;
const MAX_ITEM_COUNT = 99;
const MAX_SWITCHES_OR_VARIABLES = 5000;

const whole = (value: number, min: number, max: number, label: string) => {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${label} must be a whole number from ${min} to ${max}`);
  return value;
};

/** [field id, label] of the bonus stats, in the order shown. */
const PARAMS: [number, string][] = [
  [ACTOR.hpMod, 'MaxHP'], [ACTOR.spMod, 'MaxSP'], [ACTOR.attackMod, 'Attack'],
  [ACTOR.defenseMod, 'Defense'], [ACTOR.spiritMod, 'Spirit'], [ACTOR.agilityMod, 'Agility'],
];

const ACTOR_FIELDS: Record<Exclude<ActorField, 'tp'>, [number, string]> = {
  hp: [ACTOR.hp, 'current_hp'], mp: [ACTOR.sp, 'current_sp'], level: [ACTOR.level, 'level'], exp: [ACTOR.exp, 'exp'],
};

function inventory(save: LsdSave) {
  const chunks = structOf(save, SAVE.inventory);
  const ids = vectorAt(chunks, INVENTORY.itemIds) ?? [];
  const counts = vectorAt(chunks, INVENTORY.itemCounts) ?? [];
  const usage = vectorAt(chunks, INVENTORY.itemUsage);
  return { ids, counts, usage };
}

const rm2kEditor: SaveEditor<LsdSave> = {
  getGold: (save) => numberAt(structOf(save, SAVE.inventory), INVENTORY.gold, 0),
  setGold: (save, gold) =>
    updateStruct(save, SAVE.inventory, (chunks) => withNumber(chunks, INVENTORY.gold, 'gold', whole(gold, 0, MAX_GOLD, 'Gold'))),

  // Weapons and armor are items in RPG Maker 2000/2003.
  getInventory: (save, kind) => {
    if (kind !== 'items') return {};
    const { ids, counts } = inventory(save);
    return Object.fromEntries(ids.slice(0, counts.length).map((id, i) => [id, counts[i]]));
  },
  setInventoryCount: (save, kind: InventoryKind, id, count) => {
    if (kind !== 'items') throw new Error('RPG Maker 2000/2003 saves have items only');
    whole(count, 0, MAX_ITEM_COUNT, 'Item count');
    whole(id, 1, 0x7fff, 'Item ID');
    const { ids, counts, usage } = inventory(save);
    const nextIds = [...ids];
    const nextCounts = [...counts];
    const nextUsage = usage ? [...usage] : null;
    const at = nextIds.indexOf(id);
    if (at >= 0 && count > 0) {
      nextCounts[at] = count;
    } else if (at >= 0) {
      nextIds.splice(at, 1);
      nextCounts.splice(at, 1);
      nextUsage?.splice(at, 1);
    } else if (count > 0) {
      let place = nextIds.findIndex((other) => other > id);
      if (place < 0) place = nextIds.length;
      nextIds.splice(place, 0, id);
      nextCounts.splice(place, 0, count);
      nextUsage?.splice(place, 0, 0);
    } else {
      return save;
    }
    return updateStruct(save, SAVE.inventory, (chunks) => {
      let next = withVector(chunks, INVENTORY.itemIds, INVENTORY.itemCount, 'item_ids', 'i16', nextIds);
      next = withVector(next, INVENTORY.itemCounts, null, 'item_counts', 'u8', nextCounts);
      if (nextUsage) next = withVector(next, INVENTORY.itemUsage, null, 'item_usage', 'u8', nextUsage);
      return next;
    });
  },

  getActors: (save) =>
    actorsOf(save).map(({ chunks }, slot): ActorView => {
      const name = chunks.find((chunk) => chunk.id === 0x01)?.value;
      return {
        slot,
        name: name?.t === 'str' ? decodeText(name.bytes) : '',
        paramPlus: PARAMS.map(([id]) => numberAt(chunks, id, 0)),
        paramLabels: PARAMS.map(([, label]) => label),
        statLabels: { mp: 'SP' },
        limits: { hp: { min: 0, max: 9999 }, mp: { min: 0, max: 999 }, level: { min: 1, max: 99 } },
        hp: numberAt(chunks, ACTOR.hp, 0),
        mp: numberAt(chunks, ACTOR.sp, 0),
        level: numberAt(chunks, ACTOR.level, 1),
        exp: numberAt(chunks, ACTOR.exp, 0),
      };
    }),
  setActorField: (save, slot, field, value) => {
    if (field === 'tp') throw new Error('RPG Maker 2000/2003 characters have no TP');
    const [id, name] = ACTOR_FIELDS[field];
    whole(value, field === 'level' ? 1 : 0, 0x7fffffff, name);
    return updateActor(save, slot, (chunks) => withNumber(chunks, id, name, value));
  },
  setActorParamPlus: (save, slot, index, value) => {
    const param = PARAMS[index];
    if (!param) throw new Error('No such stat');
    whole(value, -0x80000000, 0x7fffffff, param[1]);
    return updateActor(save, slot, (chunks) => withNumber(chunks, param[0], param[1], value));
  },

  // Switch and variable IDs start at 1.
  getSwitches: (save) => [null, ...(vectorAt(structOf(save, SAVE.system), SYSTEM.switches) ?? []).map((n) => n > 0)],
  setSwitch: (save, id, value) => {
    whole(id, 1, MAX_SWITCHES_OR_VARIABLES, 'Switch ID');
    const values = [...(vectorAt(structOf(save, SAVE.system), SYSTEM.switches) ?? [])];
    while (values.length < id) values.push(0);
    values[id - 1] = value ? 1 : 0;
    return updateStruct(save, SAVE.system, (chunks) => withVector(chunks, SYSTEM.switches, SYSTEM.switchCount, 'switches', 'bool', values));
  },

  getVariables: (save) => Object.fromEntries((vectorAt(structOf(save, SAVE.system), SYSTEM.variables) ?? []).map((n, i) => [i + 1, n])),
  setVariable: (save, id, value) => {
    whole(id, 1, MAX_SWITCHES_OR_VARIABLES, 'Variable ID');
    const number = whole(Number(value), -0x80000000, 0x7fffffff, `Variable ${id}`);
    const values = [...(vectorAt(structOf(save, SAVE.system), SYSTEM.variables) ?? [])];
    while (values.length < id) values.push(0);
    values[id - 1] = number;
    return updateStruct(save, SAVE.system, (chunks) => withVector(chunks, SYSTEM.variables, SYSTEM.variableCount, 'variables', 'i32', values));
  },
  integerVariables: true,
};

/** Game data files (RPG_RT.ldb, RPG_RT.lmt, Map0001.lmu) share the format's container, not its saves. */
function rm2kNotASave(filePath: string): string | null {
  const name = pathSegments(filePath).pop() ?? '';
  if (!hasExtension(filePath, ['ldb', 'lmt', 'lmu'])) return null;
  return `${name} is part of the game's data, not a save. Saves are usually named Save01.lsd, Save02.lsd...`;
}

export const rm2kFormat: SaveFormat<LsdSave> = {
  id: 'rm2k',
  label: 'RPG Maker 2000/2003',
  hint: 'Save01.lsd... in the game folder. Item, switch and variable names are not read: they show as numbers.',
  extensions: RM2K_EXTENSIONS,
  matches: (filePath) => hasExtension(filePath, RM2K_EXTENSIONS),
  notASave: rm2kNotASave,
  pages: ['Party', 'Items', 'Switches', 'Variables', 'Advanced'],

  async read(filePath) {
    return { data: parseLsdSave(await readBinary(filePath)) };
  },

  async write(filePath, { data }) {
    await writeBinary(filePath, serializeLsdSave(data));
  },

  // Names live in RPG_RT.ldb, which is not read yet.
  loadDatabase: async () => ({ database: { items: null, weapons: null, armors: null, system: null }, warnings: [] }),
  gameName: rgssGameName,
  editor: rm2kEditor,
  tree: lsdTree,
  sameData: sameLsdData,
};
