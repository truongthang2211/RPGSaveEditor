import LZString from 'lz-string';
import { sameValue } from '../sameValue';
import { deltaDecode, diff } from './diff';

/**
 * A SugarCube 2 save (Save > Save to Disk, `<name>-<date>.save`): the
 * LZ-String Base64 of the save object's JSON:
 *
 *   { id, state: { delta | history, index, expired?, seed? }, date, title, metadata?, ... }
 *
 * `history` holds one moment per visited passage, `{ title, variables, ... }`,
 * and `index` is the current one. SugarCube writes the history delta encoded
 * (`delta`); a game that disables deltas writes `history` as is.
 */
export interface SugarCubeSave {
  /** The text of the file, written back as is when nothing was edited. */
  text: string;
  /** The save object, with the history as stored in the file. */
  raw: Record<string, any>;
  /** Every moment, decoded; edits replace moments here. */
  history: readonly any[];
  /** The moments as decoded from the file, to find the edited ones. */
  loadedHistory: readonly any[];
  /** Current moment: the passage and variables the save loads. */
  index: number;
  /** Whether the file stores the history delta encoded. */
  delta: boolean;
}

export const isSugarCubeObject = (raw: unknown): raw is Record<string, any> =>
  !!raw &&
  typeof raw === 'object' &&
  'id' in raw &&
  !!(raw as any).state &&
  (Array.isArray((raw as any).state.delta) || Array.isArray((raw as any).state.history));

function decode(text: string): unknown {
  const json = LZString.decompressFromBase64(text.trim());
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Whether `bytes` look like a SugarCube save (used to tell it from a Ren'Py .save). */
export function isSugarCubeSave(bytes: Uint8Array): boolean {
  if (bytes.length === 0 || bytes[0] === 0x50 /* "PK": a zip */) return false;
  return isSugarCubeObject(decode(new TextDecoder().decode(bytes)));
}

export function parseSugarCubeSave(text: string): SugarCubeSave {
  const raw = decode(text);
  if (!isSugarCubeObject(raw)) {
    throw new Error('Not a SugarCube save: expected an exported save (Save to Disk) of a SugarCube 2 game');
  }
  const delta = Array.isArray(raw.state.delta);
  const history = delta ? deltaDecode(raw.state.delta) : raw.state.history;
  if (history.length === 0) throw new Error('This SugarCube save has no history');
  const index = Number.isInteger(raw.state.index) && raw.state.index >= 0 && raw.state.index < history.length
    ? raw.state.index
    : history.length - 1;
  return { text, raw, history, loadedHistory: history, index, delta };
}

/** The save's text: the file as is when nothing was edited, else the re-encoded save. */
export function serializeSugarCubeSave(save: SugarCubeSave): string {
  const { history, loadedHistory } = save;
  const edited = history.map((moment, i) => moment !== loadedHistory[i] && !sameValue(moment, loadedHistory[i]));
  if (!edited.some(Boolean)) return save.text;

  const state = { ...save.raw.state };
  if (save.delta) {
    // Only the entries of the edited moments (and those right after them) change.
    const delta = [...state.delta];
    history.forEach((moment, i) => {
      if (edited[i] || (i > 0 && edited[i - 1])) delta[i] = i === 0 ? moment : diff(history[i - 1], moment);
    });
    state.delta = delta;
  } else {
    state.history = history;
  }
  return LZString.compressToBase64(JSON.stringify({ ...save.raw, state }));
}
