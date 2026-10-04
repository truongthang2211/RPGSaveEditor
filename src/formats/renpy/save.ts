import { parsePickle, PNode } from '../pickle/model';
import { PickleDoc } from '../pickle/tree';
import { writePickle } from '../pickle/writer';
import { entryData, readZip, withData, writeZip, ZipArchive } from './zip';

/**
 * A Ren'Py save: a zip whose "log" entry is pickle.dumps((roots, log)).
 * `roots` maps "store.<name>" to the game's variables; `log` is the rollback
 * history. Edits are kept apart from the parsed pickle (see PickleDoc).
 */
export interface RenpySave extends PickleDoc {
  archive: ZipArchive;
  /** Index of the "log" entry in the archive. */
  logEntry: number;
  /** The file as read, written back unchanged while there are no edits. */
  original: Uint8Array;
}

/** The roots dict and rollback log, or null if the pickle isn't shaped like a Ren'Py save. */
export function renpyParts(root: PNode): { roots: PNode; log: PNode } | null {
  if (root.kind !== 'tuple' || root.items.length !== 2) return null;
  const [roots, log] = root.items;
  return roots.kind === 'dict' ? { roots, log } : null;
}

export async function parseRenpySave(bytes: Uint8Array): Promise<RenpySave> {
  let archive: ZipArchive;
  try {
    archive = readZip(bytes);
  } catch {
    throw new Error("Not a Ren'Py save: the file isn't a zip archive");
  }
  const logEntry = archive.entries.findIndex((entry) => entry.name === 'log');
  if (logEntry < 0) throw new Error("Not a Ren'Py save: no \"log\" entry in the archive");
  const pickle = parsePickle(await entryData(archive.entries[logEntry]));
  if (!renpyParts(pickle.root)) throw new Error("Not a Ren'Py save: unexpected save data layout");
  return { archive, logEntry, pickle, edits: new Map(), original: bytes };
}

/**
 * The file to write. Only the "log" entry changes; the screenshot, metadata
 * and signatures are kept as they were (Ren'Py 8.1+ then asks the player once
 * whether to trust the edited save).
 */
export async function serializeRenpySave(save: RenpySave): Promise<Uint8Array> {
  if (save.edits.size === 0) return save.original;
  const log = writePickle(save.pickle, save.edits);
  const entries = [...save.archive.entries];
  entries[save.logEntry] = await withData(entries[save.logEntry], log);
  return writeZip({ ...save.archive, entries });
}
