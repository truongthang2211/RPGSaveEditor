/**
 * The LCF container of RPG Maker 2000/2003 saves (.lsd), after liblcf by the
 * EasyRPG project (MIT License, see LICENSE-liblcf.txt).
 *
 * A save is a list of chunks `[id][length][data]` (ids and lengths are BER
 * integers). Structures nest: a chunk's data is itself a list of chunks that
 * ends with a 0 byte. Arrays are a count, then each element (with an id for
 * some structures) as a nested structure.
 *
 * Every chunk keeps the bytes it was read from, and those bytes are written
 * back as long as its value is the one that was read, so a save is written
 * byte for byte unless something in it was changed.
 */
import { HAS_ID, SCHEMA } from './schema';

export type Scalar = 'ber' | 'u8' | 'i8' | 'i16' | 'f64';
export type VectorKind = 'i32' | 'i16' | 'u8' | 'bool';

export type Value =
  | { t: Scalar; n: number }
  | { t: 'str'; bytes: Uint8Array }
  | { t: 'vec'; kind: VectorKind; values: number[] }
  | { t: 'struct'; name: string; chunks: Chunk[] }
  | { t: 'array'; name: string; items: ArrayItem[] }
  | { t: 'raw'; bytes: Uint8Array };

export interface ArrayItem {
  /** The element's id (1-based), for structures that have one. */
  id: number | null;
  chunks: Chunk[];
}

export interface Chunk {
  id: number;
  /** The field's name, or the id in hex when it is not known. */
  name: string;
  /** The field's type in liblcf's notation ("Int32", "Vector<Int16>"...), or "" when unknown. */
  type: string;
  value: Value;
  /** The value as read: while `value` is this one, `src` is written back. */
  orig: Value;
  /** The data bytes as read. */
  src: Uint8Array;
}

export const HEADER_TEXT = 'LcfSaveData';

/** BER integer: 7 bits per byte, high bit set when more follow. Wraps to 32 bits like liblcf. */
export function readBer(data: Uint8Array, start: number): [number, number] {
  let value = 0;
  let pos = start;
  let byte: number;
  let loops = 0;
  do {
    if (pos >= data.length) throw new Error('Unexpected end of the save');
    byte = data[pos++];
    value = (value << 7) | (byte & 0x7f);
    if (++loops > 6) throw new Error('Invalid number in the save');
  } while (byte & 0x80);
  return [value, pos];
}

export function berBytes(value: number): number[] {
  let rest = value >>> 0;
  const bytes = [rest & 0x7f];
  rest = Math.floor(rest / 128);
  while (rest > 0) {
    bytes.unshift((rest & 0x7f) | 0x80);
    rest = Math.floor(rest / 128);
  }
  return bytes;
}

const concat = (parts: (Uint8Array | number[])[]): Uint8Array => {
  const size = parts.reduce((total, part) => total + part.length, 0);
  const out = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

const idHex = (id: number) => `0x${id.toString(16).toUpperCase().padStart(2, '0')}`;

/** The struct name inside "Array<SaveActor>", or null. */
const arrayOf = (type: string) => /^Array<(\w+)>$/.exec(type)?.[1] ?? null;

/** Fixed-size numbers stored as BER: Int32, booleans, enums and references. */
const isBer = (type: string) => type === 'Int32' || type === 'Boolean' || /^(Enum|Ref)<[^:>]*>$/.test(type);

const VECTORS: Record<string, [VectorKind, number]> = {
  'Vector<Int32>': ['i32', 4],
  'Vector<Int16>': ['i16', 2],
  'Vector<UInt8>': ['u8', 1],
  'Vector<Boolean>': ['bool', 1],
};

const raw = (bytes: Uint8Array): Value => ({ t: 'raw', bytes });

/** Reads `bytes` as a value of `type`; anything unexpected stays raw bytes. */
function parseValue(type: string, bytes: Uint8Array, isCount: boolean): Value {
  try {
    if (isCount || isBer(type)) {
      const [n, next] = readBer(bytes, 0);
      return next === bytes.length ? { t: 'ber', n } : raw(bytes);
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (type === 'UInt8') return bytes.length === 1 ? { t: 'u8', n: bytes[0] } : raw(bytes);
    if (type === 'Int8') return bytes.length === 1 ? { t: 'i8', n: view.getInt8(0) } : raw(bytes);
    if (type === 'Double') return bytes.length === 8 ? { t: 'f64', n: view.getFloat64(0, true) } : raw(bytes);
    if (type === 'String') return { t: 'str', bytes };
    const vector = VECTORS[type];
    if (vector) {
      const [kind, size] = vector;
      if (bytes.length % size !== 0) return raw(bytes);
      const values: number[] = [];
      for (let i = 0; i < bytes.length; i += size) {
        values.push(kind === 'i32' ? view.getInt32(i, true) : kind === 'i16' ? view.getInt16(i, true) : bytes[i]);
      }
      return { t: 'vec', kind, values };
    }
    const element = arrayOf(type);
    if (element && SCHEMA[element]) return parseArray(element, bytes);
    if (SCHEMA[type]) return { t: 'struct', name: type, chunks: parseChunks(type, bytes, 0, bytes.length, true) };
  } catch {
    // Fall through: keep the bytes.
  }
  return raw(bytes);
}

function parseArray(element: string, bytes: Uint8Array): Value {
  let [count, pos] = readBer(bytes, 0);
  const items: ArrayItem[] = [];
  for (let i = 0; i < count; i++) {
    let id: number | null = null;
    if (HAS_ID.has(element)) [id, pos] = readBer(bytes, pos);
    const { chunks, end } = readStruct(element, bytes, pos, bytes.length);
    items.push({ id, chunks });
    pos = end;
  }
  if (pos !== bytes.length) throw new Error('Unexpected data after an array');
  return { t: 'array', name: element, items };
}

function readStruct(struct: string, data: Uint8Array, start: number, end: number): { chunks: Chunk[]; end: number } {
  const chunks: Chunk[] = [];
  let pos = start;
  const fields = new Map((SCHEMA[struct] ?? []).map((field) => [field[0], field]));
  for (;;) {
    if (pos >= end) throw new Error('A structure is not terminated');
    let id: number;
    [id, pos] = readBer(data, pos);
    if (id === 0) return { chunks, end: pos };
    let length: number;
    [length, pos] = readBer(data, pos);
    if (length < 0 || pos + length > end) throw new Error('A chunk is longer than its structure');
    const src = data.subarray(pos, pos + length);
    pos += length;
    chunks.push(makeChunk(id, fields.get(id), src));
  }
}

function makeChunk(id: number, field: [number, string, string, string?] | undefined, src: Uint8Array): Chunk {
  const value = field ? parseValue(field[2], src, field[3] === 'count') : raw(src);
  // A size chunk and its vector share a name in liblcf: the size is "<name>_count".
  const name = field ? (field[3] === 'count' ? `${field[1]}_count` : field[1]) : idHex(id);
  return { id, name, type: field ? (field[3] === 'count' ? 'Count' : field[2]) : '', value, orig: value, src };
}

/** The chunks of a structure: until its 0 terminator, or (the top level) until `end`. */
export function parseChunks(struct: string, data: Uint8Array, start: number, end: number, terminated: boolean): Chunk[] {
  if (terminated) {
    const { chunks, end: stop } = readStruct(struct, data, start, end);
    if (stop !== end) throw new Error('Unexpected data after a structure');
    return chunks;
  }
  const chunks: Chunk[] = [];
  let pos = start;
  const fields = new Map((SCHEMA[struct] ?? []).map((field) => [field[0], field]));
  while (pos < end) {
    let id: number;
    [id, pos] = readBer(data, pos);
    if (id === 0) break;
    let length: number;
    [length, pos] = readBer(data, pos);
    if (length < 0 || pos + length > end) throw new Error('A chunk is longer than the file');
    chunks.push(makeChunk(id, fields.get(id), data.subarray(pos, pos + length)));
    pos += length;
  }
  return chunks;
}

const scalarBytes = (value: Value & { t: Scalar }): Uint8Array => {
  if (value.t === 'ber') return Uint8Array.from(berBytes(value.n));
  const size = value.t === 'f64' ? 8 : value.t === 'i16' ? 2 : 1;
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  if (value.t === 'f64') view.setFloat64(0, value.n, true);
  else if (value.t === 'i16') view.setInt16(0, value.n, true);
  else if (value.t === 'i8') view.setInt8(0, value.n);
  else view.setUint8(0, value.n);
  return out;
};

export function encodeValue(value: Value): Uint8Array {
  switch (value.t) {
    case 'raw':
    case 'str':
      return value.bytes;
    case 'vec': {
      const size = value.kind === 'i32' ? 4 : value.kind === 'i16' ? 2 : 1;
      const out = new Uint8Array(value.values.length * size);
      const view = new DataView(out.buffer);
      value.values.forEach((n, i) => {
        if (value.kind === 'i32') view.setInt32(i * 4, n, true);
        else if (value.kind === 'i16') view.setInt16(i * 2, n, true);
        else out[i] = n;
      });
      return out;
    }
    case 'struct':
      return concat([encodeChunks(value.chunks), [0]]);
    case 'array':
      return concat([
        berBytes(value.items.length),
        ...value.items.map((item) => concat([item.id === null ? [] : berBytes(item.id), encodeChunks(item.chunks), [0]])),
      ]);
    default:
      return scalarBytes(value);
  }
}

/** Chunks written one after another; a chunk whose value was not changed is written as it was read. */
export function encodeChunks(chunks: Chunk[]): Uint8Array {
  return concat(
    chunks.map((chunk) => {
      const data = chunk.value === chunk.orig ? chunk.src : encodeValue(chunk.value);
      return concat([berBytes(chunk.id), berBytes(data.length), data]);
    }),
  );
}

/** A chunk that is not in the file yet (written from its value). */
export function newChunk(id: number, name: string, type: string, value: Value): Chunk {
  return { id, name, type, value, orig: { t: 'raw', bytes: new Uint8Array(0) }, src: new Uint8Array(0) };
}

const decoders = new Map<string, TextDecoder>();
function decoder(label: string) {
  let found = decoders.get(label);
  if (!found) decoders.set(label, (found = new TextDecoder(label, { fatal: true })));
  return found;
}

/** Text from a save: Shift-JIS when the bytes are a valid Japanese text, otherwise Windows-1252. */
export function decodeText(bytes: Uint8Array): string {
  if (bytes.every((byte) => byte < 0x80)) return new TextDecoder().decode(bytes);
  for (const label of ['shift_jis', 'windows-1252']) {
    try {
      return decoder(label).decode(bytes);
    } catch {
      // try the next
    }
  }
  return new TextDecoder('windows-1252').decode(bytes);
}
