import { isGetOp, OP } from './ops';
import { LeafType, ParsedPickle } from './model';

/** A new value for the leaf pushed by one op. */
export interface LeafEdit {
  type: LeafType;
  value: number | string | boolean | null;
  /** Re-encode text as a Python 2 byte string (it was one). */
  byteString?: boolean;
}

const encoder = new TextEncoder();

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

const u32 = (n: number) => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, n, true);
  return bytes;
};

const ascii = (text: string) => encoder.encode(text);

/** Two's complement, little-endian, as short as possible (Python's encode_long). */
export function encodeLong(value: bigint): Uint8Array {
  if (value === 0n) return new Uint8Array(0);
  const bits = (value < 0n ? -value - 1n : value).toString(2).length;
  const length = (bits >> 3) + 1;
  const bytes = new Uint8Array(length);
  let n = BigInt.asUintN(length * 8, value);
  for (let i = 0; i < length; i++) {
    bytes[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return bytes;
}

function sized(code: number, data: Uint8Array, lengthBytes: 1 | 4): Uint8Array {
  return concat([Uint8Array.of(code), lengthBytes === 1 ? Uint8Array.of(data.length) : u32(data.length), data]);
}

/** The op(s) pushing `edit` in a pickle of the given protocol. */
export function encodeLiteral(edit: LeafEdit, protocol: number): Uint8Array {
  const { type, value } = edit;
  switch (type) {
    case 'none':
      return Uint8Array.of(OP.NONE);
    case 'bool':
      return protocol >= 2 ? Uint8Array.of(value ? OP.NEWTRUE : OP.NEWFALSE) : ascii(value ? 'I01\n' : 'I00\n');
    case 'int': {
      const n = BigInt(value as number);
      if (protocol >= 1 && n >= 0n && n <= 0xffn) return Uint8Array.of(OP.BININT1, Number(n));
      if (protocol >= 1 && n >= 0n && n <= 0xffffn) return Uint8Array.of(OP.BININT2, Number(n) & 0xff, Number(n) >> 8);
      if (protocol >= 1 && n >= -(2n ** 31n) && n < 2n ** 31n) {
        const bytes = new Uint8Array(5);
        bytes[0] = OP.BININT;
        new DataView(bytes.buffer).setInt32(1, Number(n), true);
        return bytes;
      }
      if (protocol >= 2) {
        const data = encodeLong(n);
        return data.length < 256 ? sized(OP.LONG1, data, 1) : sized(OP.LONG4, data, 4);
      }
      return ascii(`I${n}\n`);
    }
    case 'float': {
      if (protocol < 1) return ascii(`F${value as number}\n`);
      const bytes = new Uint8Array(9);
      bytes[0] = OP.BINFLOAT;
      new DataView(bytes.buffer).setFloat64(1, value as number, false);
      return bytes;
    }
    case 'str': {
      const data = encoder.encode(value as string);
      if (edit.byteString) return data.length < 256 ? sized(OP.SHORT_BINSTRING, data, 1) : sized(OP.BINSTRING, data, 4);
      if (protocol >= 4 && data.length < 256) return sized(OP.SHORT_BINUNICODE, data, 1);
      return sized(OP.BINUNICODE, data, 4);
    }
    default:
      throw new Error(`Cannot write a ${type} value`);
  }
}

/**
 * Writes the pickle back with `edits` (op index -> new value) applied. Ops
 * without edits are copied byte for byte; FRAME lengths are recomputed.
 *
 * A literal that is also read back elsewhere through the memo keeps its old
 * value in the memo (Python shares it, but the user edited just one place):
 * it is written as before, and after its PUT the new value replaces it on the
 * stack (`... PUT n POP <new value>`).
 */
export function writePickle(parsed: ParsedPickle, edits: ReadonlyMap<number, LeafEdit>): Uint8Array {
  const { bytes, ops, protocol, memoOfSite, putOfMemo, gotMemos } = parsed;
  if (edits.size === 0) return bytes.slice(0, ops[ops.length - 1].end);

  const chunks: Uint8Array[] = ops.map((op) => bytes.subarray(op.start, op.end));
  const appendAfter = new Map<number, Uint8Array>();

  for (const [site, edit] of edits) {
    const op = ops[site];
    if (!op) throw new Error(`No pickle op ${site}`);
    const literal = encodeLiteral(edit, protocol);
    const slot = memoOfSite.get(site);
    if (!isGetOp(op.code) && slot !== undefined && gotMemos.has(slot)) {
      appendAfter.set(putOfMemo.get(slot)!, concat([Uint8Array.of(OP.POP), literal]));
    } else {
      chunks[site] = literal;
    }
  }
  for (const [index, extra] of appendAfter) chunks[index] = concat([chunks[index], extra]);

  // Each FRAME announces the byte length of the ops inside it.
  const frameLengths = new Map<number, number>();
  ops.forEach((op, i) => {
    if (op.frame !== undefined) frameLengths.set(op.frame, (frameLengths.get(op.frame) ?? 0) + chunks[i].length);
  });
  for (const [index, length] of frameLengths) {
    const frame = new Uint8Array(9);
    frame[0] = OP.FRAME;
    new DataView(frame.buffer).setBigUint64(1, BigInt(length), true);
    chunks[index] = frame;
  }
  return concat(chunks);
}
