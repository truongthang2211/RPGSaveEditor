import { isGetOp, isPutOp, OP, Op, parseOps, protocolOf } from './ops';

/**
 * The object graph of a pickle, built by running its opcodes (without calling
 * any Python code). Containers keep their identity, so an object referenced
 * from several places is the same node. Leaf values (numbers, text...) are
 * immutable in Python; each place that pushes one gets its own node with the
 * op that pushed it (`site`), which is what an edit replaces.
 */

export type LeafType = 'int' | 'float' | 'bool' | 'none' | 'str' | 'bytes';

export interface PLeaf {
  kind: 'leaf';
  type: LeafType;
  value: number | bigint | string | boolean | null | Uint8Array;
  /** Index of the op that pushed this value (a literal or a memo GET). */
  site: number;
  /** Text from a Python 2 byte string (decoded as UTF-8, as Ren'Py does). */
  byteString?: boolean;
  /** Can't be re-encoded safely (protocol-0 text forms, invalid UTF-8...). */
  readOnly?: boolean;
}

export interface PList {
  kind: 'list';
  items: PNode[];
}

export interface PTuple {
  kind: 'tuple';
  items: PNode[];
}

export interface PDict {
  kind: 'dict';
  entries: [PNode, PNode][];
}

export interface PSet {
  kind: 'set' | 'frozenset';
  items: PNode[];
}

/** A class or function reference (module.name). */
export interface PGlobal {
  kind: 'global';
  module: string;
  name: string;
}

/** An object built by calling a class/function (REDUCE, NEWOBJ...), then filled in. */
export interface PObject {
  kind: 'object';
  /** The class or function (usually a PGlobal). */
  cls: PNode;
  /** Constructor arguments. */
  args: PNode | null;
  kwargs?: PNode;
  /** BUILD state: usually the instance __dict__, or (dict, slots). */
  state?: PNode;
  /** Items appended to a list subclass. */
  items: PNode[];
  /** Entries set on a dict subclass. */
  entries: [PNode, PNode][];
}

/** Something we only show, never look into (persistent ids, extension codes, buffers). */
export interface POpaque {
  kind: 'opaque';
  label: string;
}

export type PNode = PLeaf | PList | PTuple | PDict | PSet | PGlobal | PObject | POpaque;
export type PContainer = Exclude<PNode, PLeaf | PGlobal | POpaque>;

export interface ParsedPickle {
  bytes: Uint8Array;
  ops: Op[];
  protocol: number;
  root: PNode;
  /** Literal op index -> memo slot it was stored in (by the PUT/MEMOIZE right after it). */
  memoOfSite: Map<number, number>;
  /** Memo slot -> index of the PUT/MEMOIZE op that stored it. */
  putOfMemo: Map<number, number>;
  /** Memo slots read back by a GET somewhere. */
  gotMemos: Set<number>;
}

const MARK = Symbol('mark');
type StackItem = PNode | typeof MARK;

const utf8 = new TextDecoder('utf-8', { fatal: true });

function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return utf8.decode(bytes);
  } catch {
    return null;
  }
}

/** Little-endian two's complement (LONG1/LONG4). */
export function decodeLong(bytes: Uint8Array): number | bigint {
  if (bytes.length === 0) return 0;
  let n = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(bytes[i]);
  if (bytes[bytes.length - 1] & 0x80) n -= 1n << BigInt(bytes.length * 8);
  return n >= BigInt(Number.MIN_SAFE_INTEGER) && n <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(n) : n;
}

function parseIntText(text: string): number | bigint {
  const n = BigInt(text.trim().replace(/L$/, ''));
  return n >= BigInt(Number.MIN_SAFE_INTEGER) && n <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(n) : n;
}

export function parsePickle(bytes: Uint8Array): ParsedPickle {
  const ops = parseOps(bytes);
  const stack: StackItem[] = [];
  const memo = new Map<number, PNode>();
  const memoOfSite = new Map<number, number>();
  const putOfMemo = new Map<number, number>();
  const gotMemos = new Set<number>();
  let lastPushed = -1; // op index of the last literal pushed (for PUT bookkeeping)

  const pop = (): PNode => {
    const item = stack.pop();
    if (item === undefined || item === MARK) throw new Error('Pickle stack underflow');
    return item;
  };
  const top = (): PNode => {
    const item = stack[stack.length - 1];
    if (item === undefined || item === MARK) throw new Error('Pickle stack underflow');
    return item;
  };
  const popMark = (): PNode[] => {
    const at = stack.lastIndexOf(MARK);
    if (at < 0) throw new Error('Pickle MARK not found');
    const items = stack.splice(at) as StackItem[];
    return items.slice(1) as PNode[];
  };
  const leaf = (site: number, type: LeafType, value: PLeaf['value'], extra: Partial<PLeaf> = {}) => {
    stack.push({ kind: 'leaf', type, value, site, ...extra });
    lastPushed = site;
  };
  const appendTo = (target: PNode, items: PNode[]) => {
    if (target.kind === 'list') target.items.push(...items);
    else if (target.kind === 'object') target.items.push(...items);
    else throw new Error(`Cannot append to ${target.kind}`);
  };
  const setItems = (target: PNode, pairs: PNode[]) => {
    const entries: [PNode, PNode][] = [];
    for (let i = 0; i + 1 < pairs.length; i += 2) entries.push([pairs[i], pairs[i + 1]]);
    if (target.kind === 'dict' || target.kind === 'object') target.entries.push(...entries);
    else throw new Error(`Cannot set items on ${target.kind}`);
  };
  const store = (slot: number, index: number) => {
    memo.set(slot, top());
    putOfMemo.set(slot, index);
    // A PUT/MEMOIZE right after a literal (frame breaks aside) stores that literal.
    if (lastPushed >= 0 && isLiteral(ops[lastPushed].code) && ops.slice(lastPushed + 1, index).every((o) => o.code === OP.FRAME)) {
      memoOfSite.set(lastPushed, slot);
    }
  };
  const get = (slot: number, index: number) => {
    const value = memo.get(slot);
    if (!value) throw new Error(`Pickle memo ${slot} not found`);
    gotMemos.add(slot);
    if (value.kind === 'leaf') leaf(index, value.type, value.value, { byteString: value.byteString, readOnly: value.readOnly });
    else stack.push(value);
  };

  for (let index = 0; index < ops.length; index++) {
    const op = ops[index];
    const arg = op.arg;
    switch (op.code) {
      case OP.PROTO:
      case OP.FRAME:
      case OP.READONLY_BUFFER:
        break;
      case OP.STOP: {
        const root = pop();
        return { bytes, ops, protocol: protocolOf(ops), root, memoOfSite, putOfMemo, gotMemos };
      }
      case OP.MARK:
        stack.push(MARK);
        break;
      case OP.POP:
        stack.pop();
        break;
      case OP.POP_MARK:
        popMark();
        break;
      case OP.DUP:
        stack.push(top());
        break;

      // Literals.
      case OP.NONE:
        leaf(index, 'none', null);
        break;
      case OP.NEWTRUE:
      case OP.NEWFALSE:
        leaf(index, 'bool', op.code === OP.NEWTRUE);
        break;
      case OP.INT: {
        const text = (arg as string).trim();
        if (text === '01' || text === '00') leaf(index, 'bool', text === '01', { readOnly: true });
        else leaf(index, 'int', parseIntText(text), { readOnly: true });
        break;
      }
      case OP.LONG:
        leaf(index, 'int', parseIntText(arg as string), { readOnly: true });
        break;
      case OP.BININT:
      case OP.BININT1:
      case OP.BININT2:
        leaf(index, 'int', arg as number);
        break;
      case OP.LONG1:
      case OP.LONG4:
        leaf(index, 'int', decodeLong(arg as Uint8Array));
        break;
      case OP.FLOAT:
        leaf(index, 'float', Number(arg as string), { readOnly: true });
        break;
      case OP.BINFLOAT:
        leaf(index, 'float', arg as number);
        break;
      case OP.STRING:
        leaf(index, 'str', (arg as string).trim(), { readOnly: true }); // protocol-0 repr, shown as is
        break;
      case OP.BINSTRING:
      case OP.SHORT_BINSTRING: {
        const text = decodeUtf8(arg as Uint8Array);
        if (text === null) leaf(index, 'bytes', arg as Uint8Array, { readOnly: true });
        else leaf(index, 'str', text, { byteString: true });
        break;
      }
      case OP.UNICODE:
        leaf(index, 'str', arg as string, { readOnly: true });
        break;
      case OP.BINUNICODE:
      case OP.SHORT_BINUNICODE:
      case OP.BINUNICODE8: {
        const text = decodeUtf8(arg as Uint8Array);
        // Lone surrogates (surrogatepass) can't round-trip through a JS edit: show, don't edit.
        leaf(index, 'str', text ?? new TextDecoder().decode(arg as Uint8Array), { readOnly: text === null });
        break;
      }
      case OP.BINBYTES:
      case OP.SHORT_BINBYTES:
      case OP.BINBYTES8:
      case OP.BYTEARRAY8:
        leaf(index, 'bytes', arg as Uint8Array, { readOnly: true });
        break;

      // Containers.
      case OP.EMPTY_LIST:
        stack.push({ kind: 'list', items: [] });
        break;
      case OP.LIST:
        stack.push({ kind: 'list', items: popMark() });
        break;
      case OP.EMPTY_TUPLE:
        stack.push({ kind: 'tuple', items: [] });
        break;
      case OP.TUPLE:
        stack.push({ kind: 'tuple', items: popMark() });
        break;
      case OP.TUPLE1:
      case OP.TUPLE2:
      case OP.TUPLE3: {
        const count = op.code - OP.TUPLE1 + 1;
        const items: PNode[] = [];
        for (let i = 0; i < count; i++) items.unshift(pop());
        stack.push({ kind: 'tuple', items });
        break;
      }
      case OP.EMPTY_DICT:
        stack.push({ kind: 'dict', entries: [] });
        break;
      case OP.DICT: {
        const dict: PDict = { kind: 'dict', entries: [] };
        setItems(dict, popMark());
        stack.push(dict);
        break;
      }
      case OP.EMPTY_SET:
        stack.push({ kind: 'set', items: [] });
        break;
      case OP.FROZENSET:
        stack.push({ kind: 'frozenset', items: popMark() });
        break;
      case OP.APPEND: {
        const item = pop();
        appendTo(top(), [item]);
        break;
      }
      case OP.APPENDS: {
        const items = popMark();
        appendTo(top(), items);
        break;
      }
      case OP.SETITEM: {
        const value = pop();
        const key = pop();
        setItems(top(), [key, value]);
        break;
      }
      case OP.SETITEMS: {
        const pairs = popMark();
        setItems(top(), pairs);
        break;
      }
      case OP.ADDITEMS: {
        const items = popMark();
        const target = top();
        if (target.kind === 'set') target.items.push(...items);
        else if (target.kind === 'object') target.items.push(...items);
        else throw new Error(`Cannot add items to ${target.kind}`);
        break;
      }

      // Classes and objects.
      case OP.GLOBAL:
      case OP.INST: {
        const [module, name] = arg as [string, string];
        const global: PGlobal = { kind: 'global', module, name };
        if (op.code === OP.GLOBAL) stack.push(global);
        else stack.push({ kind: 'object', cls: global, args: { kind: 'tuple', items: popMark() }, items: [], entries: [] });
        break;
      }
      case OP.STACK_GLOBAL: {
        const name = pop();
        const module = pop();
        const text = (n: PNode) => (n.kind === 'leaf' && typeof n.value === 'string' ? n.value : '?');
        stack.push({ kind: 'global', module: text(module), name: text(name) });
        break;
      }
      case OP.OBJ: {
        const [cls, ...args] = popMark();
        stack.push({ kind: 'object', cls, args: { kind: 'tuple', items: args }, items: [], entries: [] });
        break;
      }
      case OP.REDUCE:
      case OP.NEWOBJ: {
        const args = pop();
        const cls = pop();
        stack.push({ kind: 'object', cls, args, items: [], entries: [] });
        break;
      }
      case OP.NEWOBJ_EX: {
        const kwargs = pop();
        const args = pop();
        const cls = pop();
        stack.push({ kind: 'object', cls, args, kwargs, items: [], entries: [] });
        break;
      }
      case OP.BUILD: {
        const state = pop();
        const target = top();
        if (target.kind === 'object') target.state = state;
        break;
      }

      // Memo.
      case OP.PUT:
        store(Number(arg), index);
        break;
      case OP.BINPUT:
      case OP.LONG_BINPUT:
        store(arg as number, index);
        break;
      case OP.MEMOIZE:
        store(memo.size, index);
        break;
      case OP.GET:
        get(Number(arg), index);
        break;
      case OP.BINGET:
      case OP.LONG_BINGET:
        get(arg as number, index);
        break;

      // Things we don't look into.
      case OP.PERSID:
        stack.push({ kind: 'opaque', label: `persistent id ${arg as string}` });
        break;
      case OP.BINPERSID:
        pop();
        stack.push({ kind: 'opaque', label: 'persistent id' });
        break;
      case OP.EXT1:
      case OP.EXT2:
      case OP.EXT4:
        stack.push({ kind: 'opaque', label: `extension ${arg as number}` });
        break;
      case OP.NEXT_BUFFER:
        stack.push({ kind: 'opaque', label: 'out-of-band buffer' });
        break;
      default:
        throw new Error(`Unsupported pickle opcode 0x${op.code.toString(16)}`);
    }
    if (!isLiteral(op.code) && !isGetOp(op.code) && !isPutOp(op.code) && op.code !== OP.FRAME) lastPushed = -1;
  }
  throw new Error('Pickle has no STOP');
}

/** Ops that push an editable-kind leaf value. */
export function isLiteral(code: number): boolean {
  switch (code) {
    case OP.NONE:
    case OP.NEWTRUE:
    case OP.NEWFALSE:
    case OP.INT:
    case OP.LONG:
    case OP.BININT:
    case OP.BININT1:
    case OP.BININT2:
    case OP.LONG1:
    case OP.LONG4:
    case OP.FLOAT:
    case OP.BINFLOAT:
    case OP.STRING:
    case OP.BINSTRING:
    case OP.SHORT_BINSTRING:
    case OP.UNICODE:
    case OP.BINUNICODE:
    case OP.SHORT_BINUNICODE:
    case OP.BINUNICODE8:
    case OP.BINBYTES:
    case OP.SHORT_BINBYTES:
    case OP.BINBYTES8:
    case OP.BYTEARRAY8:
      return true;
    default:
      return false;
  }
}
