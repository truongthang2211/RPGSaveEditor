/**
 * Python pickle (protocols 0-5) as a list of opcodes. Each op keeps its byte
 * range, so the file can be written back exactly, op by op, with only the
 * edited values re-encoded.
 */

/** How an opcode's argument is encoded. */
type ArgKind =
  | 'none'
  | 'u1' // 1-byte unsigned
  | 'u2' // 2-byte unsigned LE
  | 'i4' // 4-byte signed LE
  | 'u4' // 4-byte unsigned LE
  | 'f8' // 8-byte big-endian double
  | 'len1' // 1-byte length + bytes
  | 'len4' // 4-byte length + bytes
  | 'len8' // 8-byte length + bytes
  | 'line' // text up to "\n"
  | 'line2'; // two "\n"-terminated lines (module, name)

export const OP = {
  MARK: 0x28, // (
  STOP: 0x2e, // .
  POP: 0x30, // 0
  POP_MARK: 0x31, // 1
  DUP: 0x32, // 2
  FLOAT: 0x46, // F
  INT: 0x49, // I
  BININT: 0x4a, // J
  BININT1: 0x4b, // K
  LONG: 0x4c, // L
  BININT2: 0x4d, // M
  NONE: 0x4e, // N
  PERSID: 0x50, // P
  BINPERSID: 0x51, // Q
  REDUCE: 0x52, // R
  STRING: 0x53, // S
  BINSTRING: 0x54, // T
  SHORT_BINSTRING: 0x55, // U
  UNICODE: 0x56, // V
  BINUNICODE: 0x58, // X
  APPEND: 0x61, // a
  BUILD: 0x62, // b
  GLOBAL: 0x63, // c
  DICT: 0x64, // d
  EMPTY_DICT: 0x7d, // }
  APPENDS: 0x65, // e
  GET: 0x67, // g
  BINGET: 0x68, // h
  INST: 0x69, // i
  LONG_BINGET: 0x6a, // j
  LIST: 0x6c, // l
  EMPTY_LIST: 0x5d, // ]
  OBJ: 0x6f, // o
  PUT: 0x70, // p
  BINPUT: 0x71, // q
  LONG_BINPUT: 0x72, // r
  SETITEM: 0x73, // s
  TUPLE: 0x74, // t
  EMPTY_TUPLE: 0x29, // )
  SETITEMS: 0x75, // u
  BINFLOAT: 0x47, // G
  PROTO: 0x80,
  NEWOBJ: 0x81,
  EXT1: 0x82,
  EXT2: 0x83,
  EXT4: 0x84,
  TUPLE1: 0x85,
  TUPLE2: 0x86,
  TUPLE3: 0x87,
  NEWTRUE: 0x88,
  NEWFALSE: 0x89,
  LONG1: 0x8a,
  LONG4: 0x8b,
  BINBYTES: 0x42, // B
  SHORT_BINBYTES: 0x43, // C
  SHORT_BINUNICODE: 0x8c,
  BINUNICODE8: 0x8d,
  BINBYTES8: 0x8e,
  EMPTY_SET: 0x8f,
  ADDITEMS: 0x90,
  FROZENSET: 0x91,
  NEWOBJ_EX: 0x92,
  STACK_GLOBAL: 0x93,
  MEMOIZE: 0x94,
  FRAME: 0x95,
  BYTEARRAY8: 0x96,
  NEXT_BUFFER: 0x97,
  READONLY_BUFFER: 0x98,
} as const;

const ARGS: Record<number, ArgKind> = {
  [OP.MARK]: 'none',
  [OP.STOP]: 'none',
  [OP.POP]: 'none',
  [OP.POP_MARK]: 'none',
  [OP.DUP]: 'none',
  [OP.FLOAT]: 'line',
  [OP.INT]: 'line',
  [OP.BININT]: 'i4',
  [OP.BININT1]: 'u1',
  [OP.LONG]: 'line',
  [OP.BININT2]: 'u2',
  [OP.NONE]: 'none',
  [OP.PERSID]: 'line',
  [OP.BINPERSID]: 'none',
  [OP.REDUCE]: 'none',
  [OP.STRING]: 'line',
  [OP.BINSTRING]: 'len4',
  [OP.SHORT_BINSTRING]: 'len1',
  [OP.UNICODE]: 'line',
  [OP.BINUNICODE]: 'len4',
  [OP.APPEND]: 'none',
  [OP.BUILD]: 'none',
  [OP.GLOBAL]: 'line2',
  [OP.DICT]: 'none',
  [OP.EMPTY_DICT]: 'none',
  [OP.APPENDS]: 'none',
  [OP.GET]: 'line',
  [OP.BINGET]: 'u1',
  [OP.INST]: 'line2',
  [OP.LONG_BINGET]: 'u4',
  [OP.LIST]: 'none',
  [OP.EMPTY_LIST]: 'none',
  [OP.OBJ]: 'none',
  [OP.PUT]: 'line',
  [OP.BINPUT]: 'u1',
  [OP.LONG_BINPUT]: 'u4',
  [OP.SETITEM]: 'none',
  [OP.TUPLE]: 'none',
  [OP.EMPTY_TUPLE]: 'none',
  [OP.SETITEMS]: 'none',
  [OP.BINFLOAT]: 'f8',
  [OP.PROTO]: 'u1',
  [OP.NEWOBJ]: 'none',
  [OP.EXT1]: 'u1',
  [OP.EXT2]: 'u2',
  [OP.EXT4]: 'i4',
  [OP.TUPLE1]: 'none',
  [OP.TUPLE2]: 'none',
  [OP.TUPLE3]: 'none',
  [OP.NEWTRUE]: 'none',
  [OP.NEWFALSE]: 'none',
  [OP.LONG1]: 'len1',
  [OP.LONG4]: 'len4',
  [OP.BINBYTES]: 'len4',
  [OP.SHORT_BINBYTES]: 'len1',
  [OP.SHORT_BINUNICODE]: 'len1',
  [OP.BINUNICODE8]: 'len8',
  [OP.BINBYTES8]: 'len8',
  [OP.EMPTY_SET]: 'none',
  [OP.ADDITEMS]: 'none',
  [OP.FROZENSET]: 'none',
  [OP.NEWOBJ_EX]: 'none',
  [OP.STACK_GLOBAL]: 'none',
  [OP.MEMOIZE]: 'none',
  [OP.FRAME]: 'len8',
  [OP.BYTEARRAY8]: 'len8',
  [OP.NEXT_BUFFER]: 'none',
  [OP.READONLY_BUFFER]: 'none',
};

export interface Op {
  code: number;
  /** Byte range of the whole op (code + argument) in the pickle. */
  start: number;
  end: number;
  /** Decoded argument: number for fixed-size ints/floats, bytes for length-prefixed data, text for lines. */
  arg?: number | Uint8Array | string | [string, string];
  /** For ops inside a FRAME: index of that FRAME op. */
  frame?: number;
}

const latin1 = (bytes: Uint8Array) => {
  let text = '';
  for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
  return text;
};

/** Splits a pickle into ops, up to and including STOP. */
export function parseOps(bytes: Uint8Array): Op[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ops: Op[] = [];
  let pos = 0;
  let frameIndex = -1;
  let frameEnd = -1;

  const need = (n: number) => {
    if (pos + n > bytes.length) throw new Error('Pickle data ends unexpectedly');
  };
  const line = () => {
    const nl = bytes.indexOf(0x0a, pos);
    if (nl < 0) throw new Error('Pickle data ends unexpectedly');
    const text = latin1(bytes.subarray(pos, nl));
    pos = nl + 1;
    return text;
  };
  const sized = (length: number) => {
    need(length);
    const data = bytes.subarray(pos, pos + length);
    pos += length;
    return data;
  };
  const u64 = () => {
    need(8);
    const value = view.getBigUint64(pos, true);
    pos += 8;
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Pickle item too large');
    return Number(value);
  };

  for (;;) {
    need(1);
    const start = pos;
    const code = bytes[pos++];
    const kind = ARGS[code];
    if (kind === undefined) throw new Error(`Unknown pickle opcode 0x${code.toString(16)} at byte ${start}`);
    let arg: Op['arg'];
    switch (kind) {
      case 'none':
        break;
      case 'u1':
        need(1);
        arg = bytes[pos++];
        break;
      case 'u2':
        need(2);
        arg = view.getUint16(pos, true);
        pos += 2;
        break;
      case 'i4':
        need(4);
        arg = view.getInt32(pos, true);
        pos += 4;
        break;
      case 'u4':
        need(4);
        arg = view.getUint32(pos, true);
        pos += 4;
        break;
      case 'f8':
        need(8);
        arg = view.getFloat64(pos, false);
        pos += 8;
        break;
      case 'len1':
        need(1);
        arg = sized(bytes[pos++]);
        break;
      case 'len4': {
        need(4);
        const length = view.getUint32(pos, true);
        pos += 4;
        arg = sized(length);
        break;
      }
      case 'len8':
        if (code === OP.FRAME) {
          arg = u64(); // frame length, not followed by data of its own
        } else {
          arg = sized(u64());
        }
        break;
      case 'line':
        arg = line();
        break;
      case 'line2':
        arg = [line(), line()];
        break;
    }

    const op: Op = { code, start, end: pos, arg };
    if (start < frameEnd) op.frame = frameIndex;
    if (code === OP.FRAME) {
      frameIndex = ops.length;
      frameEnd = pos + (arg as number);
    }
    ops.push(op);
    if (code === OP.STOP) return ops;
  }
}

/** The protocol from a leading PROTO op (0 when absent). */
export const protocolOf = (ops: Op[]) => (ops[0]?.code === OP.PROTO ? (ops[0].arg as number) : 0);

export const isGetOp = (code: number) => code === OP.GET || code === OP.BINGET || code === OP.LONG_BINGET;
export const isPutOp = (code: number) =>
  code === OP.PUT || code === OP.BINPUT || code === OP.LONG_BINPUT || code === OP.MEMOIZE;
