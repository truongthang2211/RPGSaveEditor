/**
 * Minimal zip reader/writer for Ren'Py saves (small archives, store or
 * deflate, no ZIP64). Entries keep their stored bytes, so rewriting an archive
 * only recompresses the entries that changed.
 */

export interface ZipEntry {
  name: string;
  /** 0 = stored, 8 = deflated. */
  method: number;
  crc32: number;
  uncompressedSize: number;
  /** Data as stored in the archive. */
  compressed: Uint8Array;
  /** Header fields copied when writing back. */
  versionMadeBy: number;
  versionNeeded: number;
  flags: number;
  time: number;
  date: number;
  internalAttributes: number;
  externalAttributes: number;
  localExtra: Uint8Array;
  centralExtra: Uint8Array;
  comment: Uint8Array;
}

export interface ZipArchive {
  entries: ZipEntry[];
  comment: Uint8Array;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

async function transform(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([data as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

const inflateRaw = (data: Uint8Array) => transform(data, new DecompressionStream('deflate-raw'));
const deflateRaw = (data: Uint8Array) => transform(data, new CompressionStream('deflate-raw'));

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const decoder = new TextDecoder();
const encoder = new TextEncoder();

export function readZip(bytes: Uint8Array): ZipArchive {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The end-of-central-directory record is at the end, before an optional comment.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a zip file');

  const count = view.getUint16(eocd + 10, true);
  const directoryOffset = view.getUint32(eocd + 16, true);
  const commentLength = view.getUint16(eocd + 20, true);
  if (count === 0xffff || directoryOffset === 0xffffffff) throw new Error('ZIP64 archives are not supported');

  const entries: ZipEntry[] = [];
  let pos = directoryOffset;
  for (let n = 0; n < count; n++) {
    if (view.getUint32(pos, true) !== 0x02014b50) throw new Error('Corrupt zip directory');
    const nameLength = view.getUint16(pos + 28, true);
    const extraLength = view.getUint16(pos + 30, true);
    const entryCommentLength = view.getUint16(pos + 32, true);
    const compressedSize = view.getUint32(pos + 20, true);
    const localOffset = view.getUint32(pos + 42, true);
    const nameBytes = bytes.subarray(pos + 46, pos + 46 + nameLength);
    if (compressedSize === 0xffffffff || localOffset === 0xffffffff) throw new Error('ZIP64 archives are not supported');

    if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error('Corrupt zip entry');
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;

    entries.push({
      name: decoder.decode(nameBytes),
      versionMadeBy: view.getUint16(pos + 4, true),
      versionNeeded: view.getUint16(pos + 6, true),
      flags: view.getUint16(pos + 8, true),
      method: view.getUint16(pos + 10, true),
      time: view.getUint16(pos + 12, true),
      date: view.getUint16(pos + 14, true),
      crc32: view.getUint32(pos + 16, true),
      uncompressedSize: view.getUint32(pos + 24, true),
      internalAttributes: view.getUint16(pos + 36, true),
      externalAttributes: view.getUint32(pos + 38, true),
      compressed: bytes.slice(dataStart, dataStart + compressedSize),
      localExtra: bytes.slice(localOffset + 30 + localNameLength, dataStart),
      centralExtra: bytes.slice(pos + 46 + nameLength, pos + 46 + nameLength + extraLength),
      comment: bytes.slice(pos + 46 + nameLength + extraLength, pos + 46 + nameLength + extraLength + entryCommentLength),
    });
    pos += 46 + nameLength + extraLength + entryCommentLength;
  }
  return { entries, comment: bytes.slice(eocd + 22, eocd + 22 + commentLength) };
}

export async function entryData(entry: ZipEntry): Promise<Uint8Array> {
  let data: Uint8Array;
  if (entry.method === 0) data = entry.compressed;
  else if (entry.method === 8) data = await inflateRaw(entry.compressed);
  else throw new Error(`Unsupported zip compression method ${entry.method} for ${entry.name}`);
  if (crc32(data) !== entry.crc32) throw new Error(`Zip entry ${entry.name} is corrupt (CRC mismatch)`);
  return data;
}

/** A copy of `entry` holding `data` instead (deflated). */
export async function withData(entry: ZipEntry, data: Uint8Array): Promise<ZipEntry> {
  return {
    ...entry,
    method: 8,
    flags: entry.flags & ~0x08, // sizes go in the local header, no data descriptor
    crc32: crc32(data),
    uncompressedSize: data.length,
    compressed: await deflateRaw(data),
  };
}

export function writeZip(archive: ZipArchive): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of archive.entries) {
    const name = encoder.encode(entry.name);
    const flags = entry.flags & ~0x08;
    const local = new Uint8Array(30 + name.length + entry.localExtra.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, entry.versionNeeded, true);
    lv.setUint16(6, flags, true);
    lv.setUint16(8, entry.method, true);
    lv.setUint16(10, entry.time, true);
    lv.setUint16(12, entry.date, true);
    lv.setUint32(14, entry.crc32, true);
    lv.setUint32(18, entry.compressed.length, true);
    lv.setUint32(22, entry.uncompressedSize, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, entry.localExtra.length, true);
    local.set(name, 30);
    local.set(entry.localExtra, 30 + name.length);

    const dir = new Uint8Array(46 + name.length + entry.centralExtra.length + entry.comment.length);
    const dv = new DataView(dir.buffer);
    dv.setUint32(0, 0x02014b50, true);
    dv.setUint16(4, entry.versionMadeBy, true);
    dv.setUint16(6, entry.versionNeeded, true);
    dv.setUint16(8, flags, true);
    dv.setUint16(10, entry.method, true);
    dv.setUint16(12, entry.time, true);
    dv.setUint16(14, entry.date, true);
    dv.setUint32(16, entry.crc32, true);
    dv.setUint32(20, entry.compressed.length, true);
    dv.setUint32(24, entry.uncompressedSize, true);
    dv.setUint16(28, name.length, true);
    dv.setUint16(30, entry.centralExtra.length, true);
    dv.setUint16(32, entry.comment.length, true);
    dv.setUint16(36, entry.internalAttributes, true);
    dv.setUint32(38, entry.externalAttributes, true);
    dv.setUint32(42, offset, true);
    dir.set(name, 46);
    dir.set(entry.centralExtra, 46 + name.length);
    dir.set(entry.comment, 46 + name.length + entry.centralExtra.length);

    parts.push(local, entry.compressed);
    central.push(dir);
    offset += local.length + entry.compressed.length;
  }

  const directorySize = central.reduce((n, d) => n + d.length, 0);
  const end = new Uint8Array(22 + archive.comment.length);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, archive.entries.length, true);
  ev.setUint16(10, archive.entries.length, true);
  ev.setUint32(12, directorySize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, archive.comment.length, true);
  end.set(archive.comment, 22);

  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of all) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
