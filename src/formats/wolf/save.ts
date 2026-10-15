import { sameValue } from '../sameValue';
import { checksum, crypt, HEADER_SIZE } from './crypto';
import { parseWolfStructure, WolfInt, WolfStructure } from './parse';

/**
 * A Wolf RPG Editor save (Save/SaveData01.sav...). Edits are new values by
 * byte offset: writing overwrites those bytes in the decrypted data, fixes
 * the checksum and encrypts again, so everything else stays as is.
 */
export interface WolfSave {
  /** The file as read; written back as is when nothing was edited. */
  raw: Uint8Array;
  plain: Uint8Array;
  structure: WolfStructure;
  /** Offset -> new value of the numbers edited so far (values set back are removed). */
  edits: Readonly<Record<number, number>>;
}

export function parseWolfSave(raw: Uint8Array): WolfSave {
  if (raw.length <= HEADER_SIZE + 3) throw new Error('Not a Wolf RPG Editor save (file too small)');
  const plain = crypt(raw);
  return { raw, plain, structure: parseWolfStructure(plain), edits: {} };
}

const RANGES: Record<WolfInt['size'], [number, number]> = {
  1: [0, 0xff],
  2: [0, 0xffff],
  4: [-0x80000000, 0x7fffffff],
  8: [0, 0],
};

/** The save with `node` set to `value` (whole numbers in the field's range only). */
export function setWolfValue(save: WolfSave, node: WolfInt, value: number): WolfSave {
  const [min, max] = RANGES[node.size];
  if (node.readOnly) throw new Error(`${node.key} is read-only`);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${node.key} must be a whole number from ${min} to ${max}`);
  }
  const edits = { ...save.edits };
  if (value === node.value) delete edits[node.offset];
  else edits[node.offset] = value;
  return { ...save, edits };
}

export const wolfValue = (save: WolfSave, node: WolfInt): number => save.edits[node.offset] ?? node.value;

export function sameWolfData(a: WolfSave, b: WolfSave): boolean {
  return a.raw === b.raw && sameValue(a.edits, b.edits);
}

/** The file to write: the original when nothing was edited. */
export function serializeWolfSave(save: WolfSave, sizes = offsetSizes(save)): Uint8Array {
  const offsets = Object.keys(save.edits).map(Number);
  if (offsets.length === 0) return save.raw;
  const plain = new Uint8Array(save.plain);
  const view = new DataView(plain.buffer);
  for (const offset of offsets) {
    const value = save.edits[offset];
    const size = sizes.get(offset);
    if (size === 1) view.setUint8(offset, value);
    else if (size === 2) view.setUint16(offset, value, true);
    else if (size === 4) view.setInt32(offset, value, true);
    else throw new Error(`No editable number at offset 0x${offset.toString(16)}`);
  }
  plain[2] = checksum(plain);
  return crypt(plain);
}

/** Size of each number in the save, by offset. */
function offsetSizes(save: WolfSave): Map<number, number> {
  const sizes = new Map<number, number>();
  const walk = (node: WolfStructure['root']) => {
    for (const child of node.children) {
      if (child.kind === 'group') walk(child);
      else if (child.kind === 'int') sizes.set(child.offset, child.size);
    }
  };
  walk(save.structure.root);
  return sizes;
}

/**
 * The normal variables (通常変数): the first list in part 3, "vars4[0]".
 * Confirmed by a game's money: variable 7 held the money shown in game, and
 * editing it there changed the money after loading.
 */
export function normalVariables(save: WolfSave): WolfInt[] {
  const part3 = save.structure.root.children.find((c) => c.key === 'part 3');
  const lists = part3?.kind === 'group' ? part3.children.find((c) => c.key === 'vars4') : undefined;
  const first = lists?.kind === 'group' ? lists.children[0] : undefined;
  if (first?.kind !== 'group') return [];
  return first.children.filter((c): c is WolfInt => c.kind === 'int' && c.key.startsWith('['));
}
