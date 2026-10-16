import { Chunk, encodeChunks, HEADER_TEXT, newChunk, parseChunks, readBer, Value } from './lcf';

/** Chunk ids of the top-level structures (Save) and the fields used by the editors. */
export const SAVE = { system: 0x65, actors: 0x6c, inventory: 0x6d } as const;
export const SYSTEM = { switchCount: 0x1f, switches: 0x20, variableCount: 0x21, variables: 0x22 } as const;
export const INVENTORY = { itemCount: 0x0b, itemIds: 0x0c, itemCounts: 0x0d, itemUsage: 0x0e, gold: 0x15 } as const;
export const ACTOR = {
  level: 0x1f, exp: 0x20, hpMod: 0x21, spMod: 0x22, attackMod: 0x29, defenseMod: 0x2a, spiritMod: 0x2b, agilityMod: 0x2c,
  hp: 0x47, sp: 0x48,
} as const;

/**
 * An RPG Maker 2000/2003 save (Save01.lsd...). Changes replace the chunks
 * along the way to the value (nothing is mutated), and writing re-encodes only
 * those: the rest of the file is written as it was read.
 */
export interface LsdSave {
  /** The file as read; written back as is when nothing differs. */
  raw: Uint8Array;
  /** Length-prefixed "LcfSaveData". */
  header: Uint8Array;
  chunks: Chunk[];
}

export function parseLsdSave(bytes: Uint8Array): LsdSave {
  let length: number;
  let pos: number;
  try {
    [length, pos] = readBer(bytes, 0);
  } catch {
    throw new Error('Not an RPG Maker 2000/2003 save');
  }
  const text = new TextDecoder('latin1').decode(bytes.subarray(pos, pos + length));
  if (length !== HEADER_TEXT.length || text !== HEADER_TEXT) throw new Error('Not an RPG Maker 2000/2003 save (no "LcfSaveData" header)');
  const start = pos + length;
  return { raw: bytes, header: bytes.subarray(0, start), chunks: parseChunks('Save', bytes, start, bytes.length, false) };
}

const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((byte, i) => byte === b[i]);

/** The file to write: the original bytes when the contents are the same as when it was read. */
export function serializeLsdSave(save: LsdSave): Uint8Array {
  const body = encodeChunks(save.chunks);
  const out = new Uint8Array(save.header.length + body.length);
  out.set(save.header, 0);
  out.set(body, save.header.length);
  return same(out, save.raw) ? save.raw : out;
}

export const sameLsdData = (a: LsdSave, b: LsdSave) => same(serializeLsdSave(a), serializeLsdSave(b));

// -- Reading and changing chunks ---------------------------------------------

export const chunkOf = (chunks: readonly Chunk[], id: number) => chunks.find((chunk) => chunk.id === id);

/** The chunks of the structure at the top-level chunk `id` (SaveSystem, SaveInventory...). */
export function structOf(save: LsdSave, id: number): Chunk[] | null {
  const value = chunkOf(save.chunks, id)?.value;
  return value?.t === 'struct' ? value.chunks : null;
}

/** The save with the structure at the top-level chunk `id` replaced by `update(its chunks)`. */
export function updateStruct(save: LsdSave, id: number, update: (chunks: Chunk[]) => Chunk[]): LsdSave {
  const index = save.chunks.findIndex((chunk) => chunk.id === id);
  const chunk = save.chunks[index];
  if (!chunk || chunk.value.t !== 'struct') throw new Error(`This save has no 0x${id.toString(16)} section`);
  const chunks = [...save.chunks];
  chunks[index] = { ...chunk, value: { ...chunk.value, chunks: update(chunk.value.chunks) } };
  return { ...save, chunks };
}

export function numberAt(chunks: readonly Chunk[] | null, id: number, fallback: number): number {
  const value = chunkOf(chunks ?? [], id)?.value;
  return value && (value.t === 'ber' || value.t === 'u8' || value.t === 'i8' || value.t === 'i16') ? value.n : fallback;
}

export function vectorAt(chunks: readonly Chunk[] | null, id: number): number[] | null {
  const value = chunkOf(chunks ?? [], id)?.value;
  return value?.t === 'vec' ? value.values : null;
}

/** Replaces a chunk by id, or adds it in id order when it is not there (fields at their default are left out of a save). */
export function withChunk(chunks: Chunk[], id: number, name: string, type: string, make: (old: Value | undefined) => Value): Chunk[] {
  const index = chunks.findIndex((chunk) => chunk.id === id);
  if (index >= 0) {
    const next = [...chunks];
    next[index] = { ...chunks[index], value: make(chunks[index].value) };
    return next;
  }
  const at = chunks.findIndex((chunk) => chunk.id > id);
  const added = newChunk(id, name, type, make(undefined));
  return at < 0 ? [...chunks, added] : [...chunks.slice(0, at), added, ...chunks.slice(at)];
}

export const withNumber = (chunks: Chunk[], id: number, name: string, value: number) =>
  withChunk(chunks, id, name, 'Int32', () => ({ t: 'ber', n: value }));

/** The vector's chunk plus its count chunk, kept in step when the length changes. */
export function withVector(chunks: Chunk[], vectorId: number, countId: number | null, name: string, kind: 'i32' | 'i16' | 'u8' | 'bool', values: number[]) {
  const vectorType = { i32: 'Vector<Int32>', i16: 'Vector<Int16>', u8: 'Vector<UInt8>', bool: 'Vector<Boolean>' }[kind];
  let next = withChunk(chunks, vectorId, name, vectorType, () => ({ t: 'vec', kind, values }));
  if (countId !== null) next = withChunk(next, countId, `${name}_count`, 'Count', () => ({ t: 'ber', n: values.length }));
  return next;
}

/** A top-level chunk's actors: [id, chunks] per actor. */
export function actorsOf(save: LsdSave): { id: number; chunks: Chunk[] }[] {
  const value = chunkOf(save.chunks, SAVE.actors)?.value;
  return value?.t === 'array' ? value.items.map((item) => ({ id: item.id ?? 0, chunks: item.chunks })) : [];
}

export function updateActor(save: LsdSave, index: number, update: (chunks: Chunk[]) => Chunk[]): LsdSave {
  const at = save.chunks.findIndex((chunk) => chunk.id === SAVE.actors);
  const chunk = save.chunks[at];
  if (!chunk || chunk.value.t !== 'array' || !chunk.value.items[index]) throw new Error('No such character in this save');
  const items = [...chunk.value.items];
  items[index] = { ...items[index], chunks: update(items[index].chunks) };
  const chunks = [...save.chunks];
  chunks[at] = { ...chunk, value: { ...chunk.value, items } };
  return { ...save, chunks };
}

