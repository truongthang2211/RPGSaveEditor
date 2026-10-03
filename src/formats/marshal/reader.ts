import {
  MARSHAL_MAJOR,
  MARSHAL_MINOR,
  MIvars,
  MNode,
  MSymbol,
  MValue,
  TYPE,
} from './types';

const latin1 = new TextDecoder('latin1');

/**
 * Reads one Marshal dump starting at `offset`. Mirrors Ruby 1.9's marshal.c so
 * object/symbol table indices (used by "@" and ";" links) line up exactly.
 */
class Reader {
  private pos: number;
  private readonly symbols: MSymbol[] = [];
  private readonly objects: MValue[] = [];

  constructor(private readonly buf: Uint8Array, offset: number) {
    this.pos = offset;
  }

  get offset(): number {
    return this.pos;
  }

  readDump(): MValue {
    const major = this.byte();
    const minor = this.byte();
    if (major !== MARSHAL_MAJOR || minor > MARSHAL_MINOR) {
      throw new Error(`Unsupported Marshal version ${major}.${minor} at offset ${this.pos - 2}`);
    }
    return this.value(false);
  }

  private byte(): number {
    if (this.pos >= this.buf.length) throw new Error('Unexpected end of Marshal data');
    return this.buf[this.pos++];
  }

  /** Ruby's r_long: compact signed integer encoding. */
  private long(): number {
    const c = (this.byte() << 24) >> 24; // signed byte
    if (c === 0) return 0;
    if (c > 4) return c - 5;
    if (c < -4) return c + 5;
    let x = 0;
    if (c > 0) {
      for (let i = 0; i < c; i++) x += this.byte() * 2 ** (8 * i);
      return x;
    }
    const n = -c;
    for (let i = 0; i < n; i++) x += this.byte() * 2 ** (8 * i);
    return x - 2 ** (8 * n);
  }

  private bytes(): Uint8Array {
    const len = this.long();
    if (len < 0 || this.pos + len > this.buf.length) throw new Error('Invalid Marshal byte length');
    const out = this.buf.slice(this.pos, this.pos + len);
    this.pos += len;
    return out;
  }

  private register<T extends MValue>(value: T): T {
    this.objects.push(value);
    return value;
  }

  private symbol(): MSymbol {
    const type = this.byte();
    if (type === TYPE.SYMBOL) return this.symbolBody(false);
    if (type === TYPE.SYMLINK) return this.symlink();
    if (type === TYPE.IVAR && this.buf[this.pos] === TYPE.SYMBOL) {
      this.pos++;
      return this.symbolBody(true);
    }
    throw new Error(`Expected symbol at offset ${this.pos - 1}, got 0x${type.toString(16)}`);
  }

  private symlink(): MSymbol {
    const sym = this.symbols[this.long()];
    if (!sym) throw new Error('Invalid symbol link');
    return sym;
  }

  /** The symbol's table slot is reserved before its encoding ivars are read (like r_symreal). */
  private symbolBody(hasIvars: boolean): MSymbol {
    const sym: MSymbol = { kind: 'symbol', name: latin1.decode(this.bytes()) };
    this.symbols.push(sym);
    if (hasIvars) sym.ivars = this.ivars();
    return sym;
  }

  private ivars(): MIvars {
    const count = this.long();
    const result: MIvars = [];
    for (let i = 0; i < count; i++) {
      result.push([this.symbol(), this.value(false)]);
    }
    return result;
  }

  /**
   * @param ivarPending true when inside an "I" wrapper: the ivars follow the
   * object. A few types (symbols, _dump data) consume them themselves.
   */
  private value(ivarPending: boolean): MValue {
    const start = this.pos;
    const type = this.byte();
    switch (type) {
      case TYPE.NIL:
        return null;
      case TYPE.TRUE:
        return true;
      case TYPE.FALSE:
        return false;
      case TYPE.FIXNUM:
        return this.long();
      case TYPE.LINK: {
        const index = this.long();
        if (index >= this.objects.length) throw new Error(`Invalid object link ${index} at offset ${start}`);
        return this.objects[index];
      }
      case TYPE.SYMBOL:
        return this.symbolBody(ivarPending);
      case TYPE.SYMLINK:
        return this.symlink();
      case TYPE.IVAR: {
        const inner = this.value(true);
        if (inner && typeof inner === 'object' && inner.kind !== 'symbol' && inner.kind !== 'userdef') {
          inner.ivars = this.ivars();
        }
        return inner;
      }
      case TYPE.EXTENDED: {
        const mod = this.symbol();
        const inner = this.node(this.value(ivarPending), start);
        inner.extends = [mod, ...(inner.extends ?? [])];
        return inner;
      }
      case TYPE.UCLASS: {
        const userClass = this.symbol();
        const inner = this.node(this.value(ivarPending), start);
        inner.userClass = userClass;
        return inner;
      }
      case TYPE.STRING:
        return this.register({ kind: 'string', bytes: this.bytes() });
      case TYPE.FLOAT:
        return this.register({ kind: 'float', text: latin1.decode(this.bytes()) });
      case TYPE.BIGNUM: {
        const sign = String.fromCharCode(this.byte());
        if (sign !== '+' && sign !== '-') throw new Error(`Invalid bignum sign at offset ${start}`);
        const words = this.long();
        const bytes = this.buf.slice(this.pos, this.pos + words * 2);
        this.pos += words * 2;
        return this.register({ kind: 'bignum', sign, bytes });
      }
      case TYPE.REGEXP: {
        const source = this.bytes();
        const options = this.byte();
        return this.register({ kind: 'regexp', source, options });
      }
      case TYPE.ARRAY: {
        const length = this.long();
        const node = this.register({ kind: 'array' as const, items: [] as MValue[] });
        for (let i = 0; i < length; i++) node.items.push(this.value(false));
        return node;
      }
      case TYPE.HASH:
      case TYPE.HASH_DEF: {
        const length = this.long();
        const node = this.register({
          kind: 'hash' as const,
          entries: [] as [MValue, MValue][],
          hasDefault: type === TYPE.HASH_DEF,
        });
        for (let i = 0; i < length; i++) node.entries.push([this.value(false), this.value(false)]);
        if (node.hasDefault) (node as { defaultValue?: MValue }).defaultValue = this.value(false);
        return node;
      }
      case TYPE.OBJECT: {
        const className = this.symbol();
        const node = this.register({ kind: 'object' as const, className, fields: [] as MIvars });
        node.fields = this.ivars();
        return node;
      }
      case TYPE.STRUCT: {
        const className = this.symbol();
        const node = this.register({ kind: 'struct' as const, className, members: [] as MIvars });
        node.members = this.ivars();
        return node;
      }
      case TYPE.USERDEF: {
        // Registered after its payload (and the payload's ivars), like Ruby.
        const className = this.symbol();
        const data = this.bytes();
        const ivars = ivarPending ? this.ivars() : undefined;
        return this.register({ kind: 'userdef', className, data, ...(ivars ? { ivars } : {}) });
      }
      case TYPE.USRMARSHAL: {
        const className = this.symbol();
        const node = this.register({ kind: 'usermarshal' as const, className, data: null as MValue });
        node.data = this.value(false);
        return node;
      }
      case TYPE.DATA: {
        const className = this.symbol();
        const node = this.register({ kind: 'data' as const, className, data: null as MValue });
        node.data = this.value(false);
        return node;
      }
      case TYPE.CLASS:
        return this.register({ kind: 'class', name: this.bytes() });
      case TYPE.MODULE:
        return this.register({ kind: 'module', name: this.bytes() });
      case TYPE.MODULE_OLD:
        return this.register({ kind: 'oldmodule', name: this.bytes() });
      default:
        throw new Error(`Unknown Marshal type 0x${type.toString(16)} at offset ${start}`);
    }
  }

  private node(value: MValue, offset: number): Exclude<MNode, MSymbol> {
    if (value === null || typeof value !== 'object' || value.kind === 'symbol') {
      throw new Error(`Invalid wrapped value at offset ${offset}`);
    }
    return value;
  }
}

/** Reads a single Marshal dump; throws if bytes are left over. */
export function readMarshal(bytes: Uint8Array): MValue {
  const reader = new Reader(bytes, 0);
  const value = reader.readDump();
  if (reader.offset !== bytes.length) {
    throw new Error(`Trailing data after Marshal dump at offset ${reader.offset}`);
  }
  return value;
}

/** Reads consecutive Marshal dumps (RGSS saves write several back to back). */
export function readMarshalStream(bytes: Uint8Array): MValue[] {
  const values: MValue[] = [];
  let offset = 0;
  while (offset < bytes.length) {
    const reader = new Reader(bytes, offset);
    values.push(reader.readDump());
    offset = reader.offset;
  }
  return values;
}
