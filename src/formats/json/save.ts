import { sameValue } from '../sameValue';

/**
 * A plain JSON save (`save.json`, `slot1.json`...), as written by many games
 * made with their own JavaScript code (browser, NW.js, Electron...).
 *
 * The file is written back the way it was read: same indentation, same line
 * endings, same BOM. Numbers that don't survive JSON.parse unchanged (more
 * than 15 significant digits) make the file refuse to open instead of
 * being rounded silently.
 */
export interface JsonSave {
  /** The text of the file, written back as is when nothing was edited. */
  text: string;
  /** Parsed contents (edited by replacing the containers along a path). */
  data: unknown;
  /** The contents as read, to tell whether anything differs. */
  loaded: unknown;
  /** How the file was laid out, to write it back the same way. */
  layout: { indent: string | number | undefined; newline: '\n' | '\r\n'; bom: boolean; finalNewline: boolean };
}

/** Detects the indentation used for the first indented line ("\t", 2 or 4 spaces...), if any. */
function detectIndent(text: string): string | number | undefined {
  const match = /\r?\n([ \t]+)\S/.exec(text);
  if (!match) return undefined;
  const indent = match[1];
  return /^ +$/.test(indent) ? indent.length : indent;
}

/** Numbers in the text that JSON.parse can't hold exactly (integers beyond 2^53, long decimals). */
function lossyNumber(text: string): string | null {
  // Strings are skipped: only tokens outside quotes are numbers.
  const stripped = text.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  for (const match of stripped.matchAll(/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g)) {
    const token = match[0];
    if (/[eE.]/.test(token)) continue; // decimals and exponents may reformat, but keep their value
    if (String(Number(token)) !== token) return token;
  }
  return null;
}

/** Whether `text` is a JSON object or array (used to recognise a save by its content). */
export function looksLikeJsonSave(text: string): boolean {
  const trimmed = text.replace(/^﻿/, '').trimStart();
  if (trimmed[0] !== '{' && trimmed[0] !== '[') return false;
  try {
    const value = JSON.parse(trimmed);
    return value !== null && typeof value === 'object';
  } catch {
    return false;
  }
}

export function parseJsonSave(text: string): JsonSave {
  const bom = text.charCodeAt(0) === 0xfeff;
  const body = bom ? text.slice(1) : text;
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch (error) {
    throw new Error(`Not a JSON file: ${(error as Error).message}`);
  }
  if (data === null || typeof data !== 'object') throw new Error('The JSON file has no object or list at its top level');
  const lossy = lossyNumber(body);
  if (lossy) {
    throw new Error(`The file has a number (${lossy}) that is too large to edit without changing it, so it was not opened`);
  }
  return {
    text,
    data,
    loaded: data,
    layout: {
      indent: detectIndent(body),
      newline: body.includes('\r\n') ? '\r\n' : '\n',
      bom,
      finalNewline: /\r?\n$/.test(body),
    },
  };
}

export function serializeJsonSave(save: JsonSave): string {
  if (save.data === save.loaded || sameValue(save.data, save.loaded)) return save.text;
  const { indent, newline, bom, finalNewline } = save.layout;
  let text = JSON.stringify(save.data, null, indent);
  if (newline === '\r\n') text = text.replace(/\n/g, '\r\n');
  if (finalNewline) text += newline;
  return (bom ? '﻿' : '') + text;
}
