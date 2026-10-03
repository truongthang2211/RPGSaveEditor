import { binaryStringToBytes } from './binaryString';
import { MARSHAL_MAJOR, MARSHAL_MINOR, MIvars, MNode, MSymbol, MValue, TYPE } from './types';

/** RGSS runs a 32-bit Ruby: integers outside this range are Bignums. */
const FIXNUM_MIN = -(2 ** 30);
const FIXNUM_MAX = 2 ** 30 - 1;


/**
 * Writes one Marshal dump. Mirrors Ruby 1.9's w_object: objects are numbered in
 * the same order the reader numbers them, so a value read with readMarshal is
 * written back byte-for-byte.
 */
class Writer {
  private chunks: number[] = [];
  private readonly symbols = new Map<string, number>();
  private readonly objects = new Map<object, number>();
  private objectCount = 0;

  dump(value: MValue): Uint8Array {
    this.chunks = [MARSHAL_MAJOR, MARSHAL_MINOR];
    this.value(value);
    return Uint8Array.from(this.chunks);
  }

  private byte(b: number) {
    this.chunks.push(b & 0xff);
  }

  /** Ruby's w_long. */
  private long(x: number) {
    if (!Number.isInteger(x)) throw new Error(`Cannot write non-integer length/fixnum ${x}`);
    if (x === 0) return this.byte(0);
    if (x > 0 && x < 123) return this.byte(x + 5);
    if (x < 0 && x > -124) return this.byte(x - 5);
    const buf: number[] = [];
    let rest = x;
    for (let i = 1; i <= 4; i++) {
      buf.push(((rest % 256) + 256) % 256);
      rest = Math.floor(rest / 256);
      if (rest === 0) return this.flushLong(i, buf);
      if (rest === -1) return this.flushLong(-i, buf);
    }
    throw new Error(`Integer out of Marshal long range: ${x}`);
  }

  private flushLong(count: number, buf: number[]) {
    this.byte(count);
    buf.forEach((b) => this.byte(b));
  }

  private rawBytes(bytes: Uint8Array) {
    this.long(bytes.length);
    for (const b of bytes) this.byte(b);
  }

  private register(node: object) {
    this.objects.set(node, this.objectCount++);
  }

  private symbol(sym: MSymbol) {
    const index = this.symbols.get(sym.name);
    if (index !== undefined) {
      this.byte(TYPE.SYMLINK);
      this.long(index);
      return;
    }
    if (sym.ivars) this.byte(TYPE.IVAR);
    this.byte(TYPE.SYMBOL);
    this.rawBytes(binaryStringToBytes(sym.name));
    this.symbols.set(sym.name, this.symbols.size);
    if (sym.ivars) this.ivars(sym.ivars);
  }

  private ivars(ivars: MIvars) {
    this.long(ivars.length);
    for (const [key, value] of ivars) {
      this.symbol(key);
      this.value(value);
    }
  }

  private number(n: number) {
    if (Number.isInteger(n) && n >= FIXNUM_MIN && n <= FIXNUM_MAX) {
      this.byte(TYPE.FIXNUM);
      this.long(n);
    } else if (Number.isInteger(n)) {
      this.node(bignumFrom(n));
    } else {
      this.node({ kind: 'float', text: floatText(n) });
    }
  }

  private value(value: MValue | undefined) {
    if (value === null || value === undefined) return this.byte(TYPE.NIL);
    if (value === true) return this.byte(TYPE.TRUE);
    if (value === false) return this.byte(TYPE.FALSE);
    if (typeof value === 'number') return this.number(value);
    if (value.kind === 'symbol') return this.symbol(value);

    const linked = this.objects.get(value);
    if (linked !== undefined) {
      this.byte(TYPE.LINK);
      this.long(linked);
      return;
    }
    this.node(value);
  }

  private node(node: Exclude<MNode, MSymbol>) {
    // User-defined (_dump) objects are numbered after their payload; all others before.
    if (node.kind !== 'userdef') this.register(node);

    if (node.ivars) this.byte(TYPE.IVAR);
    for (const mod of node.extends ?? []) {
      this.byte(TYPE.EXTENDED);
      this.symbol(mod);
    }
    if (node.userClass) {
      this.byte(TYPE.UCLASS);
      this.symbol(node.userClass);
    }

    switch (node.kind) {
      case 'string':
        this.byte(TYPE.STRING);
        this.rawBytes(node.bytes);
        break;
      case 'float':
        this.byte(TYPE.FLOAT);
        this.rawBytes(binaryStringToBytes(node.text));
        break;
      case 'bignum':
        this.byte(TYPE.BIGNUM);
        this.byte(node.sign.charCodeAt(0));
        this.long(node.bytes.length / 2);
        node.bytes.forEach((b) => this.byte(b));
        break;
      case 'regexp':
        this.byte(TYPE.REGEXP);
        this.rawBytes(node.source);
        this.byte(node.options);
        break;
      case 'array':
        this.byte(TYPE.ARRAY);
        this.long(node.items.length);
        for (let i = 0; i < node.items.length; i++) this.value(node.items[i]);
        break;
      case 'hash':
        this.byte(node.hasDefault ? TYPE.HASH_DEF : TYPE.HASH);
        this.long(node.entries.length);
        for (const [key, value] of node.entries) {
          this.value(key);
          this.value(value);
        }
        if (node.hasDefault) this.value(node.defaultValue ?? null);
        break;
      case 'object':
        this.byte(TYPE.OBJECT);
        this.symbol(node.className);
        this.ivars(node.fields);
        break;
      case 'struct':
        this.byte(TYPE.STRUCT);
        this.symbol(node.className);
        this.ivars(node.members);
        break;
      case 'userdef':
        this.byte(TYPE.USERDEF);
        this.symbol(node.className);
        this.rawBytes(node.data);
        if (node.ivars) this.ivars(node.ivars);
        this.register(node);
        return;
      case 'usermarshal':
        this.byte(TYPE.USRMARSHAL);
        this.symbol(node.className);
        this.value(node.data);
        break;
      case 'data':
        this.byte(TYPE.DATA);
        this.symbol(node.className);
        this.value(node.data);
        break;
      case 'class':
        this.byte(TYPE.CLASS);
        this.rawBytes(node.name);
        break;
      case 'module':
        this.byte(TYPE.MODULE);
        this.rawBytes(node.name);
        break;
      case 'oldmodule':
        this.byte(TYPE.MODULE_OLD);
        this.rawBytes(node.name);
        break;
    }

    if (node.ivars) this.ivars(node.ivars);
  }
}

function bignumFrom(n: number): Exclude<MNode, MSymbol> {
  let rest = BigInt(Math.abs(n));
  const bytes: number[] = [];
  while (rest > 0n) {
    bytes.push(Number(rest & 0xffn));
    rest >>= 8n;
  }
  if (bytes.length % 2) bytes.push(0);
  return { kind: 'bignum', sign: n < 0 ? '-' : '+', bytes: Uint8Array.from(bytes) };
}

function floatText(n: number): string {
  if (Number.isNaN(n)) return 'nan';
  if (n === Infinity) return 'inf';
  if (n === -Infinity) return '-inf';
  return String(n);
}

export function writeMarshal(value: MValue): Uint8Array {
  return new Writer().dump(value);
}

/** Writes consecutive dumps, each with its own link tables (as RGSS saves do). */
export function writeMarshalStream(values: MValue[]): Uint8Array {
  const parts = values.map(writeMarshal);
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
