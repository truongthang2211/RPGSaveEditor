import { describe, expect, it } from 'vitest';
import { setIn, updateIn } from './immutable';

describe('updateIn / setIn', () => {
  it('copies only the containers along the path', () => {
    const shared = { big: true };
    const obj = { a: { b: 1, keep: shared }, other: shared };
    const updated = setIn(obj, ['a', 'b'], 2);
    expect(updated).toEqual({ a: { b: 2, keep: shared }, other: shared });
    expect(obj.a.b).toBe(1);
    expect(updated.other).toBe(shared);
    expect(updated.a.keep).toBe(shared);
  });

  it('copies arrays as arrays', () => {
    const obj = { list: [1, 2, 3] };
    const updated = setIn(obj, ['list', 1], 9);
    expect(Array.isArray(updated.list)).toBe(true);
    expect(updated.list).toEqual([1, 9, 3]);
    expect(obj.list).toEqual([1, 2, 3]);
  });

  it('creates missing containers', () => {
    expect(setIn({}, ['party', '_gold'], 5)).toEqual({ party: { _gold: 5 } });
    expect(setIn<any>({}, ['list', 2], true).list).toEqual([undefined, undefined, true]);
  });

  it('passes the current value to the updater', () => {
    expect(updateIn({ n: 2 }, ['n'], (n) => n * 10)).toEqual({ n: 20 });
  });
});
