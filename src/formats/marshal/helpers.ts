import { MArray, MHash, MNode, MObject, MString, MSymbol, MValue } from './types';

/** Helpers for reading and editing Marshal trees. Setters mutate in place. */

export function isNode<K extends MNode['kind']>(value: MValue | undefined, kind: K): value is Extract<MNode, { kind: K }> {
  return value !== null && typeof value === 'object' && value.kind === kind;
}

export const symbol = (name: string): MSymbol => ({ kind: 'symbol', name });

const isSymbolNamed = (value: MValue, name: string) => isNode(value, 'symbol') && value.name === name;

export function getField(obj: MValue | undefined, name: string): MValue | undefined {
  if (!isNode(obj, 'object')) return undefined;
  return obj.fields.find(([key]) => key.name === name)?.[1];
}

export function hasField(obj: MValue | undefined, name: string): boolean {
  return isNode(obj, 'object') && obj.fields.some(([key]) => key.name === name);
}

/** Replaces an existing instance variable; appends it if missing. */
export function setField(obj: MObject, name: string, value: MValue) {
  const entry = obj.fields.find(([key]) => key.name === name);
  if (entry) entry[1] = value;
  else obj.fields.push([symbol(name), value]);
}

/** Value for a symbol key (e.g. contents[:party]). */
export function getSymbolKey(hash: MValue | undefined, name: string): MValue | undefined {
  if (!isNode(hash, 'hash')) return undefined;
  return hash.entries.find(([key]) => isSymbolNamed(key, name))?.[1];
}

export function getIntKey(hash: MValue | undefined, key: number): MValue | undefined {
  if (!isNode(hash, 'hash')) return undefined;
  return hash.entries.find(([k]) => k === key)?.[1];
}

/** Sets an Integer-keyed entry, appending it when absent. */
export function setIntKey(hash: MHash, key: number, value: MValue) {
  const entry = hash.entries.find(([k]) => k === key);
  if (entry) entry[1] = value;
  else hash.entries.push([key, value]);
}

export function arrayItems(value: MValue | undefined): MValue[] {
  return isNode(value, 'array') ? value.items : [];
}

/** Sets array[index], padding with nil like Ruby does. */
export function setArrayItem(array: MArray, index: number, value: MValue) {
  while (array.items.length < index) array.items.push(null);
  array.items[index] = value;
}

/** Fixnum, Float or Bignum as a JS number; undefined for anything else. */
export function toNumber(value: MValue | undefined): number | undefined {
  if (typeof value === 'number') return value;
  if (isNode(value, 'float')) {
    if (value.text === 'inf') return Infinity;
    if (value.text === '-inf') return -Infinity;
    if (value.text === 'nan') return NaN;
    // Older Rubies (RGSS1/2) write "%.16g", a NUL and mantissa bytes; Ruby reads up to the NUL.
    const nul = value.text.indexOf('\0');
    return Number(nul < 0 ? value.text : value.text.slice(0, nul));
  }
  if (isNode(value, 'bignum')) {
    let n = 0n;
    for (let i = value.bytes.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(value.bytes[i]);
    return Number(value.sign === '-' ? -n : n);
  }
  return undefined;
}

/**
 * A number to store in place of `previous`, keeping Float fields Float
 * (e.g. VX Ace @tp) so Ruby code that expects a Float keeps working.
 */
export function numberLike(previous: MValue | undefined, value: number): MValue {
  if (isNode(previous, 'float')) return { kind: 'float', text: String(value) };
  return value;
}

function encodingOf(str: MString): string {
  for (const [key, value] of str.ivars ?? []) {
    if (key.name === 'E') return value === true ? 'utf-8' : 'us-ascii';
    if (key.name === 'encoding' && isNode(value, 'string')) return new TextDecoder('latin1').decode(value.bytes);
  }
  return 'binary';
}

/** Decodes a Ruby String using its encoding ivar (binary strings are tried as UTF-8). */
export function decodeString(value: MValue | undefined): string | undefined {
  if (!isNode(value, 'string')) return undefined;
  const encoding = encodingOf(value);
  if (encoding === 'us-ascii') return new TextDecoder('latin1').decode(value.bytes);
  try {
    return new TextDecoder(encoding === 'binary' ? 'utf-8' : encoding, { fatal: true }).decode(value.bytes);
  } catch {
    return new TextDecoder('latin1').decode(value.bytes);
  }
}

/** A UTF-8 Ruby String (what RGSS3 uses for text). */
export function makeString(text: string): MString {
  return { kind: 'string', bytes: new TextEncoder().encode(text), ivars: [[symbol('E'), true]] };
}

/** Plain JS value for display: numbers, decoded strings, or a short type label. */
export function toDisplayValue(value: MValue | undefined): number | string | boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  const number = toNumber(value);
  if (number !== undefined) return number;
  const text = decodeString(value);
  if (text !== undefined) return text;
  if (value.kind === 'symbol') return `:${value.name}`;
  if (value.kind === 'array') return `[Array(${value.items.length})]`;
  if (value.kind === 'hash') return `{Hash(${value.entries.length})}`;
  return `<${'className' in value ? value.className.name : value.kind}>`;
}
