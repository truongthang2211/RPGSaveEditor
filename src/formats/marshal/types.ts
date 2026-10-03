/**
 * Lossless model of Ruby Marshal 4.8 data (what RGSS XP/VX/VX Ace use).
 *
 * Everything needed to write the exact same bytes back is kept: string encoding
 * ivars, float text, bignum bytes, _dump payloads, extended modules, etc.
 * Shared/cyclic references are kept as shared JS objects (object identity), so
 * the writer emits "@" links where Ruby did. Nodes are plain objects so the tree
 * survives structuredClone (which also preserves sharing).
 */

/** nil, true/false and Fixnum map to JS primitives; everything else is a node. */
export type MValue = null | boolean | number | MNode;

/** Symbol name is the raw bytes as a latin1 string (byte-for-byte). */
export interface MSymbol {
  kind: 'symbol';
  name: string;
  /** Encoding ivars of a non-ASCII symbol (written as "I:..."). */
  ivars?: MIvars;
}

export type MIvars = [MSymbol, MValue][];

interface Wrappers {
  /** Instance variables from an "I" wrapper (e.g. string encoding: E => true). */
  ivars?: MIvars;
  /** Modules from "e" wrappers (object.extend(Mod)), outermost first. */
  extends?: MSymbol[];
  /** Subclass of String/Array/Hash/Regexp from a "C" wrapper. */
  userClass?: MSymbol;
}

export interface MString extends Wrappers { kind: 'string'; bytes: Uint8Array }
export interface MFloat extends Wrappers { kind: 'float'; text: string }
export interface MBignum extends Wrappers { kind: 'bignum'; sign: '+' | '-'; bytes: Uint8Array }
export interface MRegexp extends Wrappers { kind: 'regexp'; source: Uint8Array; options: number }
export interface MArray extends Wrappers { kind: 'array'; items: MValue[] }
export interface MHash extends Wrappers {
  kind: 'hash';
  entries: [MValue, MValue][];
  /** Present when the hash has a default value ("}" type). */
  defaultValue?: MValue;
  hasDefault: boolean;
}
export interface MObject extends Wrappers { kind: 'object'; className: MSymbol; fields: MIvars }
export interface MStruct extends Wrappers { kind: 'struct'; className: MSymbol; members: MIvars }
/** Object with a custom _dump (e.g. RGSS Table, Color, Tone): raw payload bytes. */
export interface MUserDef extends Wrappers { kind: 'userdef'; className: MSymbol; data: Uint8Array }
/** Object with marshal_dump/marshal_load. */
export interface MUserMarshal extends Wrappers { kind: 'usermarshal'; className: MSymbol; data: MValue }
export interface MData extends Wrappers { kind: 'data'; className: MSymbol; data: MValue }
export interface MClassRef extends Wrappers { kind: 'class' | 'module' | 'oldmodule'; name: Uint8Array }

export type MNode =
  | MSymbol
  | MString
  | MFloat
  | MBignum
  | MRegexp
  | MArray
  | MHash
  | MObject
  | MStruct
  | MUserDef
  | MUserMarshal
  | MData
  | MClassRef;

export const TYPE = {
  NIL: 0x30, // '0'
  TRUE: 0x54, // 'T'
  FALSE: 0x46, // 'F'
  FIXNUM: 0x69, // 'i'
  EXTENDED: 0x65, // 'e'
  UCLASS: 0x43, // 'C'
  OBJECT: 0x6f, // 'o'
  DATA: 0x64, // 'd'
  USERDEF: 0x75, // 'u'
  USRMARSHAL: 0x55, // 'U'
  FLOAT: 0x66, // 'f'
  BIGNUM: 0x6c, // 'l'
  STRING: 0x22, // '"'
  REGEXP: 0x2f, // '/'
  ARRAY: 0x5b, // '['
  HASH: 0x7b, // '{'
  HASH_DEF: 0x7d, // '}'
  STRUCT: 0x53, // 'S'
  MODULE_OLD: 0x4d, // 'M'
  CLASS: 0x63, // 'c'
  MODULE: 0x6d, // 'm'
  SYMBOL: 0x3a, // ':'
  SYMLINK: 0x3b, // ';'
  IVAR: 0x49, // 'I'
  LINK: 0x40, // '@'
} as const;

export const MARSHAL_MAJOR = 4;
export const MARSHAL_MINOR = 8;
