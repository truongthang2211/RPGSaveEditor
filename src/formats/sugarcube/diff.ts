/**
 * SugarCube's history delta encoding (lib/diff.js), on the raw JSON of a save.
 *
 * A save keeps its passage history as `[moment 0, diff(0, 1), diff(1, 2), ...]`.
 * SugarCube diffs revived values (Map, Set, Date, class instances); here they
 * are still in their serialized form, `["(revive:...)", data]`, so:
 * - encoding treats such a value as a whole: when it differs, it is copied
 *   (SugarCube always accepts a copy, e.g. it copies Maps and Sets anyway);
 * - decoding applies a nested delta to the data of a revived class instance,
 *   since SugarCube diffed the instance's own properties.
 */

/** Delta operations (Diff.Op). */
export const Op = { Delete: 0, SpliceArray: 1, Copy: 2, CopyDate: 3 } as const;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Delta = { [key: string]: unknown };

/** `["(revive:map)", ...]`, `["(revive:)", [code, data]]`...: a value SugarCube revives on load. */
export function isRevived(value: unknown): value is [string, unknown] {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && value[0].startsWith('(revive:');
}

/** Revived with code (`["(revive:)", [code, data]]`, legacy "(revive:eval)"): a class instance or a special value. */
export function revivedCode(value: unknown): { code: string; data: unknown; hasData: boolean } | null {
  if (!isRevived(value) || (value[0] !== '(revive:)' && value[0] !== '(revive:eval)')) return null;
  const payload = value[1];
  if (!Array.isArray(payload) || typeof payload[0] !== 'string') return null;
  return { code: payload[0], data: payload[1], hasData: payload.length > 1 };
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const clone = <T>(value: T): T => (value === null || typeof value !== 'object' ? value : JSON.parse(JSON.stringify(value)));

function same(a: unknown, b: unknown): boolean {
  return a === b || (typeof a === 'object' && a !== null && JSON.stringify(a) === JSON.stringify(b));
}

function isNumeric(key: string): boolean {
  const num = Number(key);
  return !Number.isNaN(num) && Number.isFinite(num);
}

const has = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key);

/** The delta turning `a` into `b`, or null when they are equal (Diff.diff). */
export function diff(a: Json, b: Json): Delta | null {
  const aObj = a as Record<string, Json>;
  const bObj = b as Record<string, Json>;
  const aIsArray = Array.isArray(a);
  const delta: Delta = {};
  const keys = [...Object.keys(aObj), ...Object.keys(bObj)].sort().filter((key, i, all) => i === 0 || all[i - 1] !== key);
  let spliceKey = '';

  for (const key of keys) {
    const aVal = aObj[key];
    const bVal = bObj[key];
    if (!has(aObj, key)) {
      delta[key] = [Op.Copy, clone(bVal)];
      continue;
    }
    if (!has(bObj, key)) {
      if (aIsArray && isNumeric(key)) {
        const index = Number(key);
        if (!spliceKey) {
          do spliceKey += '~';
          while (keys.includes(spliceKey));
          delta[spliceKey] = [Op.SpliceArray, index, index];
        }
        const op = delta[spliceKey] as [number, number, number];
        op[1] = Math.min(op[1], index);
        op[2] = Math.max(op[2], index);
      } else {
        delta[key] = Op.Delete;
      }
      continue;
    }
    if (aVal === bVal) continue;
    const bothContainers =
      typeof aVal === 'object' && aVal !== null && typeof bVal === 'object' && bVal !== null &&
      Array.isArray(aVal) === Array.isArray(bVal) && !isRevived(aVal) && !isRevived(bVal);
    if (bothContainers) {
      const sub = diff(aVal, bVal);
      if (sub !== null) delta[key] = sub;
    } else if (!same(aVal, bVal)) {
      delta[key] = [Op.Copy, clone(bVal)];
    }
  }
  return Object.keys(delta).length > 0 ? delta : null;
}

/** `orig` updated with `delta` (Diff.patch); `orig` is not modified. */
export function patch(orig: Json, delta: unknown): Json {
  const revived = revivedCode(orig);
  if (revived && revived.hasData && isObject(delta)) {
    // SugarCube diffed the class instance's properties: patch its data.
    const [tag, [code]] = orig as [string, [string, Json]];
    return [tag, [code, patch(revived.data as Json, delta)]];
  }
  const patched: any = clone(orig);
  if (!isObject(delta)) return patched;
  for (const key of Object.keys(delta)) {
    const value = delta[key];
    if (value === Op.Delete) {
      delete patched[key];
    } else if (Array.isArray(value)) {
      if (value[0] === Op.SpliceArray) patched.splice(value[1], value[2] - value[1] + 1);
      else if (value[0] === Op.Copy) patched[key] = clone(value[1]);
      else if (value[0] === Op.CopyDate) patched[key] = ['(revive:date)', new Date(value[1]).toISOString()];
    } else {
      patched[key] = patch(patched[key], value);
    }
  }
  return patched;
}

/** Full history from a delta encoded one (State.deltaDecode). */
export function deltaDecode(delta: unknown[]): Json[] {
  const history: Json[] = [];
  delta.forEach((entry, i) => history.push(i === 0 ? (entry as Json) : patch(history[i - 1], entry)));
  return history;
}
