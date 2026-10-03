import { describe, expect, it } from 'vitest';
import { fromDumps, materialize, PatchedView, patchField, patchIndex, patchIntKey } from './patches';
import { getField, symbol } from '../marshal/helpers';
import { MArray, MHash, MObject, MValue } from '../marshal/types';
import { readMarshalStream } from '../marshal/reader';
import { writeMarshalStream } from '../marshal/writer';

const obj = (fields: Record<string, MValue>): MObject => ({
  kind: 'object',
  className: symbol('Thing'),
  fields: Object.entries(fields).map(([name, value]) => [symbol(name), value]),
});
const array = (...items: MValue[]): MArray => ({ kind: 'array', items });
const hash = (entries: [number, MValue][]): MHash => ({ kind: 'hash', entries, hasDefault: false });

describe('PatchedView', () => {
  it('reads patched fields, including a patch to nil', () => {
    const o = obj({ '@a': 1, '@b': 2 });
    let save = fromDumps([o]);
    save = patchField(save, o, '@a', 10);
    save = patchField(save, o, '@b', null);
    save = patchField(save, o, '@new', 3);
    const view = new PatchedView(save.patches);
    expect(view.field(o, '@a')).toBe(10);
    expect(view.field(o, '@b')).toBeNull();
    expect(view.field(o, '@new')).toBe(3);
    expect(view.field(o, '@missing')).toBeUndefined();
  });

  it('applies patched array indices, padding with nil', () => {
    const a = array(true, false);
    const save = patchIndex(patchIndex(fromDumps([a]), a, 1, true), a, 4, true);
    expect(new PatchedView(save.patches).items(a)).toEqual([true, true, null, null, true]);
  });

  it('applies patched Integer hash keys and appends new ones', () => {
    const h = hash([[1, 5], [2, 6]]);
    const save = patchIntKey(patchIntKey(fromDumps([h]), h, 2, 60), h, 9, 1);
    const view = new PatchedView(save.patches);
    expect(view.intEntries(h)).toEqual([[1, 5], [2, 60], [9, 1]]);
    expect(view.intKey(h, 9)).toBe(1);
  });
});

describe('patching', () => {
  it('never mutates the dumps and shares them between versions', () => {
    const o = obj({ '@gold': 1 });
    const before = fromDumps([o]);
    const after = patchField(before, o, '@gold', 2);
    expect(after.dumps).toBe(before.dumps);
    expect(getField(o, '@gold')).toBe(1);
    expect(before.patches.size).toBe(0);
    materialize(after);
    expect(getField(o, '@gold')).toBe(1);
  });

  it('materialize returns the dumps unchanged when there are no patches', () => {
    const dumps = [obj({ '@a': 1 })];
    expect(materialize(fromDumps(dumps))).toBe(dumps);
  });

  it('a patched node that is referenced twice stays one shared object when written', () => {
    const shared = obj({ '@hp': 10 });
    const holder = array(shared, shared);
    const save = patchField(fromDumps([holder]), shared, '@hp', 99);
    const [back] = readMarshalStream(writeMarshalStream(materialize(save))) as MArray[];
    expect(back.items[0]).toBe(back.items[1]);
    expect(getField(back.items[0], '@hp')).toBe(99);
  });
});
