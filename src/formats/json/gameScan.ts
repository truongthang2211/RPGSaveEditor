import { listDir, openRandomAccess, readBinary } from '../../utils/fileUtils';
import { ancestorDirs, pathSegments } from '../../utils/path';
import { detectCipher, DetectedCipher } from './cipher';
import { parseJsonBytes } from './save';

/**
 * Finds the password of an Easy Save save in the files of its game. A
 * password is a plain string inside the game, so every string of those files
 * is tried:
 *   - 'dll': .NET code (Mono games), whose text constants are UTF-16;
 *   - 'text': IL2CPP's global-metadata.dat, whose list of string constants is read as
 *     such (its text is run together, so it can't be split by looking for text);
 *   - 'assets': Unity's serialized data (resources.assets...), where Easy
 *     Save's own settings are; a string there follows its length as an int32.
 */
export type SourceKind = 'dll' | 'text' | 'assets';

export interface GameSource {
  name: string;
  kind: SourceKind;
  /** The file's bytes, piece by piece (a piece may repeat a few bytes of the one before). */
  chunks: () => AsyncIterable<Uint8Array>;
}

const MAX_LENGTH = 64;
const CHUNK = 16 * 1024 * 1024;
/** Chunks of one file overlap by this much, so no string is cut in two. */
const OVERLAP = MAX_LENGTH * 2 + 8;

const isPrintable = (byte: number) => byte >= 0x21 && byte <= 0x7e;

/** Strings of Unity serialized data: an int32 length, then that many printable bytes. */
export function assetStrings(bytes: Uint8Array): string[] {
  const found: string[] = [];
  for (let i = 0; i + 5 <= bytes.length; i++) {
    const length = bytes[i];
    if (length === 0 || length > MAX_LENGTH || bytes[i + 1] || bytes[i + 2] || bytes[i + 3] || i + 4 + length > bytes.length) continue;
    let end = i + 4;
    while (end < i + 4 + length && isPrintable(bytes[end])) end++;
    if (end === i + 4 + length) found.push(String.fromCharCode(...bytes.subarray(i + 4, end)));
  }
  return found;
}

/** Runs of printable text of at least `min` characters: ASCII/UTF-8, or UTF-16 (a zero byte after each character). */
export function textRuns(bytes: Uint8Array, utf16: boolean, min = 4): string[] {
  const step = utf16 ? 2 : 1;
  const found: string[] = [];
  // UTF-16 text can start on an even or an odd byte.
  for (let start = 0; start < Math.min(step, bytes.length); start++) {
    let run = '';
    const flush = () => {
      if (run.length >= min && run.length <= MAX_LENGTH) found.push(run);
      run = '';
    };
    for (let i = start; i + step <= bytes.length; i += step) {
      if (isPrintable(bytes[i]) && (!utf16 || bytes[i + 1] === 0)) run += String.fromCharCode(bytes[i]);
      else flush();
    }
    flush();
  }
  return found;
}

/**
 * The string constants of an IL2CPP global-metadata.dat: a header of (offset, size)
 * pairs, where the 2nd is the list of (length, position) entries and the 3rd the
 * text they point into. Null when `bytes` is not such a file.
 */
export function metadataLiterals(bytes: Uint8Array): string[] | null {
  if (bytes.length < 32) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0xfab11baf) return null;
  const [listAt, listSize, dataAt, dataSize] = [view.getInt32(8, true), view.getInt32(12, true), view.getInt32(16, true), view.getInt32(20, true)];
  if (listAt < 0 || dataAt < 0 || listAt + listSize > bytes.length || dataAt + dataSize > bytes.length) return null;
  const decoder = new TextDecoder();
  const found: string[] = [];
  for (let at = listAt; at + 8 <= listAt + listSize; at += 8) {
    const length = view.getUint32(at, true);
    const from = view.getUint32(at + 4, true);
    if (length > 0 && length <= MAX_LENGTH && from + length <= dataSize) found.push(decoder.decode(bytes.subarray(dataAt + from, dataAt + from + length)));
  }
  return found;
}

const stringsOf = (kind: SourceKind, chunk: Uint8Array) =>
  kind === 'assets' ? assetStrings(chunk) : kind === 'text' ? (metadataLiterals(chunk) ?? textRuns(chunk, false)) : textRuns(chunk, true);

/** Passwords are often put together from two constants: those that look like a piece of one (not a plain word) are tried in pairs. */
const MAX_PIECE = 16;
/** A piece without the punctuation that identifiers, paths and sentences have. */
const isLikelyPiece = (word: string) => /[A-Za-z0-9]/.test(word) && !/[_/.,:;=(){}[\]<>"'\\%]/.test(word);
const isPiece = (word: string) => word.length >= 2 && word.length <= MAX_PIECE && /[^A-Za-z0-9_]/.test(word) && !/\s/.test(word);

export interface ScanProgress {
  tried: number;
  /** The file being read, or a note about the combinations. */
  file: string;
  /** How many words in all, when known (the combinations). */
  total?: number;
}

export interface ScanOptions {
  /** Also try two constants put together (a few seconds to minutes; on by default). */
  combinations?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: ScanProgress) => void;
}

// WebCrypto's PBKDF2/AES run off the JS thread, so trying many passwords at once
// (not one at a time) is what makes this fast; past a few hundred it stops helping.
const BATCH = 256;

/** Tries a batch of candidate passwords against `save` (whose encryption `cipher` already recognised); the one that opens it, if any. */
async function tryBatch(save: Uint8Array, cipher: DetectedCipher, batch: string[]): Promise<string | null> {
  const fits = await Promise.all(batch.map((word) => cipher.fits(word)));
  for (let j = 0; j < batch.length; j++) {
    if (!fits[j]) continue;
    // A wrong password/key gets past the fast check now and then: the text must be JSON too.
    try {
      await parseJsonBytes(save, { password: batch[j] });
      return batch[j];
    } catch {
      // keep looking
    }
  }
  return null;
}

export interface SinglesResult {
  password: string | null;
  /** Candidate fragments seen while reading `sources`, kept for a later `scanCombinations` call that needs no file access. */
  pieces: string[];
}

/** Tries each string found in `sources` on its own as the password of `save` (the fast pass). */
export async function scanSingles(save: Uint8Array, sources: GameSource[], { signal, onProgress }: Pick<ScanOptions, 'signal' | 'onProgress'> = {}): Promise<SinglesResult> {
  const cipher = detectCipher(save);
  if (!cipher) return { password: null, pieces: [] }; // not actually (recognisably) encrypted

  const tried = new Set<string>();
  const pieces = new Set<string>();
  for (const source of sources) {
    for await (const chunk of source.chunks()) {
      const all = [...new Set(stringsOf(source.kind, chunk))];
      all.filter(isPiece).forEach((word) => pieces.add(word));
      const words = all.filter((word) => !tried.has(word));
      for (let i = 0; i < words.length; i += BATCH) {
        if (signal?.aborted) return { password: null, pieces: [...pieces] };
        const batch = words.slice(i, i + BATCH);
        batch.forEach((word) => tried.add(word));
        const hit = await tryBatch(save, cipher, batch);
        if (hit !== null) return { password: hit, pieces: [...pieces] };
        onProgress?.({ tried: tried.size, file: source.name });
      }
    }
  }
  return { password: null, pieces: [...pieces] };
}

/** Tries two of `pieces` put together as the password of `save` (the slow pass): no file access, so a prior `scanSingles`'s pieces can be reused. */
export async function scanCombinations(save: Uint8Array, pieces: string[], { signal, onProgress }: Pick<ScanOptions, 'signal' | 'onProgress'> = {}): Promise<string | null> {
  const cipher = detectCipher(save);
  if (!cipher) return null;

  // First the pieces without the punctuation of identifiers and paths (far fewer), then all of them.
  const all = pieces;
  const likely = all.filter(isLikelyPiece);
  const rest = all.filter((word) => !isLikelyPiece(word));
  const passes = [
    { name: 'combinations of likely constants', firsts: likely, seconds: likely },
    { name: 'combinations of all constants', firsts: all, seconds: rest, also: rest },
  ];
  for (const { name, firsts, seconds, also } of passes) {
    const total = also ? all.length * all.length - likely.length * likely.length : likely.length * likely.length;
    let done = 0;
    for (const first of firsts) {
      // The second pass leaves out the pairs of the first one.
      const list = also && isLikelyPiece(first) ? seconds : also ? all : seconds;
      for (let i = 0; i < list.length; i += BATCH) {
        if (signal?.aborted) return null;
        const hit = await tryBatch(save, cipher, list.slice(i, i + BATCH).map((second) => first + second));
        if (hit !== null) return hit;
        done += Math.min(BATCH, list.length - i);
      }
      onProgress?.({ tried: done, file: name, total });
    }
  }
  return null;
}

/** Tries the strings of `sources` as the password of `save`; resolves the one that opens it, or null. */
export async function scanSources(save: Uint8Array, sources: GameSource[], { signal, onProgress, combinations = true }: ScanOptions = {}): Promise<string | null> {
  const singles = await scanSingles(save, sources, { signal, onProgress });
  if (singles.password !== null || !combinations) return singles.password;
  return scanCombinations(save, singles.pieces, { signal, onProgress });
}

async function* fileChunks(path: string, whole = false): AsyncGenerator<Uint8Array> {
  if (whole) {
    yield await readBinary(path);
    return;
  }
  const file = await openRandomAccess(path);
  try {
    let offset = 0;
    for (;;) {
      const chunk = await file.readAt(offset, CHUNK);
      if (chunk.length === 0) return;
      yield chunk;
      if (chunk.length < CHUNK) return;
      offset += CHUNK - OVERLAP;
    }
  } finally {
    await file.close();
  }
}

/**
 * The game's folder, when the save is kept inside it (some games, especially
 * cracked ones, save next to their own files instead of in the usual
 * per-user folder): the closest ancestor of `savePath` that holds a
 * `<Name>_Data` folder, or null when none of the folders above it looks
 * like a Unity game.
 */
export async function detectGameFolder(savePath: string): Promise<string | null> {
  for (const dir of ancestorDirs(savePath)) {
    const entries = await listDir(dir);
    if (entries.some((e) => e.isDirectory && e.name.toLowerCase().endsWith('_data'))) return dir;
  }
  return null;
}

/** The files of a Unity game to read, most likely first: `folder` is the game's `<Name>_Data` folder, or the one that holds it. */
export async function gameSources(folder: string): Promise<GameSource[]> {
  const root = folder.replace(/[/\\]+$/, '');
  const inRoot = await listDir(root);
  const dataDirs = pathSegments(root).pop()?.toLowerCase().endsWith('_data')
    ? [root]
    : inRoot.filter((e) => e.isDirectory && e.name.toLowerCase().endsWith('_data')).map((e) => `${root}/${e.name}`);
  if (dataDirs.length === 0) dataDirs.push(root);

  const sources: GameSource[] = [];
  const add = (path: string, kind: SourceKind) => sources.push({ name: pathSegments(path).slice(-2).join('/'), kind, chunks: () => fileChunks(path, kind === 'text') });
  type Entries = Awaited<ReturnType<typeof listDir>>;
  const files = (list: Entries, test: (name: string) => boolean) => list.filter((e) => !e.isDirectory && test(e.name.toLowerCase())).map((e) => e.name);

  for (const dir of dataDirs) {
    const [names, managed, metadata] = await Promise.all([listDir(dir), listDir(`${dir}/Managed`), listDir(`${dir}/il2cpp_data/Metadata`)]);
    files(managed, (n) => n.startsWith('assembly-csharp') && n.endsWith('.dll')).forEach((n) => add(`${dir}/Managed/${n}`, 'dll'));
    files(metadata, (n) => n === 'global-metadata.dat').forEach((n) => add(`${dir}/il2cpp_data/Metadata/${n}`, 'text'));
    for (const test of [(n: string) => n.startsWith('globalgamemanagers'), (n: string) => n === 'resources.assets', (n: string) => /^sharedassets\d+\.assets$/.test(n)]) {
      files(names, test).forEach((n) => add(`${dir}/${n}`, 'assets'));
    }
  }
  return sources;
}

/** Looks for the password of the save at `savePath` in the game files under `folder`. */
export async function findGamePassword(savePath: string, folder: string, options: ScanOptions = {}): Promise<string | null> {
  const [save, sources] = await Promise.all([readBinary(savePath), gameSources(folder)]);
  return scanSources(save, sources, options);
}

export interface QuickFindResult extends SinglesResult {
  /** The save's bytes, to pass to `findGamePasswordThorough` without reading the save file again either. */
  save: Uint8Array;
}

/** The fast pass of `findGamePassword` alone (single constants, not their combinations): reads the game's files once, keeping what it found for a later, slower `findGamePasswordThorough` call that needs no file access at all. */
export async function findGamePasswordQuick(savePath: string, folder: string, options: Pick<ScanOptions, 'signal' | 'onProgress'> = {}): Promise<QuickFindResult> {
  const [save, sources] = await Promise.all([readBinary(savePath), gameSources(folder)]);
  const singles = await scanSingles(save, sources, options);
  return { ...singles, save };
}

/** The slow pass of `findGamePassword` (combinations of two constants), given what a prior `findGamePasswordQuick` found; no file access. */
export const findGamePasswordThorough = (save: Uint8Array, pieces: string[], options: Pick<ScanOptions, 'signal' | 'onProgress'> = {}): Promise<string | null> =>
  scanCombinations(save, pieces, options);
