import { TreeValue } from '../../formats';

/**
 * Advanced-tab search syntax. Terms are separated by spaces and must all match:
 *
 *   gold              key, type or value contains "gold"
 *   "Lona"            key or value is exactly "Lona"
 *   /^@stat_/i        key, type or value matches the regex
 *   key:@gold         only the key (also type:, value:, old:)
 *   >1000  <=0  =99   value comparisons; 100..200 is a range; != excludes
 *   old:120           value in the previous save (compare mode)
 *   party.@gold       path ending in these keys; * = one level, ** = any levels
 */
export type Field = 'any' | 'key' | 'type' | 'value' | 'old' | 'path';

type Matcher =
  | { kind: 'contains'; text: string }
  | { kind: 'exact'; text: string }
  | { kind: 'regex'; regex: RegExp }
  | { kind: 'compare'; op: '>' | '>=' | '<' | '<=' | '=' | '!='; operand: string }
  | { kind: 'range'; min: number; max: number }
  | { kind: 'path'; segments: string[] };

export interface Term {
  field: Field;
  matcher: Matcher;
}

export interface MatchContext {
  key: string;
  type: string;
  value: TreeValue | undefined;
  /** Value of the same node in the previous save (undefined: none or missing). */
  oldValue: TreeValue | undefined;
  /** Keys from the root to this node. */
  path: string[];
}

const FIELDS = new Set(['key', 'type', 'value', 'old', 'path']);
const NUMBER = /^-?\d+(\.\d+)?$/;
const RANGE = /^(-?\d+(?:\.\d+)?)\.\.(-?\d+(?:\.\d+)?)$/;
const COMPARE = /^(>=|<=|!=|>|<|=)(.*)$/;

/** Key as typed by users: ":party" -> "party", "\"title\"" -> "title", "[3]" -> "3". */
export const normalizeKey = (key: string) => key.replace(/^:/, '').replace(/^"(.*)"$/, '$1').replace(/^\[(\d+)\]$/, '$1');

function readToken(query: string, start: number): { raw: string; quoted: boolean; regex?: RegExp; end: number } {
  const ch = query[start];
  if (ch === '"') {
    const close = query.indexOf('"', start + 1);
    const end = close === -1 ? query.length : close + 1;
    return { raw: query.slice(start + 1, close === -1 ? query.length : close), quoted: true, end };
  }
  if (ch === '/') {
    let i = start + 1;
    while (i < query.length && query[i] !== '/') i += query[i] === '\\' ? 2 : 1;
    if (i < query.length) {
      const flagsMatch = /^[a-z]*/.exec(query.slice(i + 1))!;
      const end = i + 1 + flagsMatch[0].length;
      const source = query.slice(start + 1, i);
      let flags = flagsMatch[0];
      if (!flags.includes('i')) flags += 'i'; // case-insensitive like the rest of search
      try {
        return { raw: query.slice(start, end), quoted: false, regex: new RegExp(source, flags), end };
      } catch (error) {
        throw new Error(`Invalid regex /${source}/: ${(error as Error).message}`);
      }
    }
  }
  let end = start;
  while (end < query.length && !/\s/.test(query[end])) end++;
  return { raw: query.slice(start, end), quoted: false, end };
}

function matcherFor(raw: string, quoted: boolean, regex: RegExp | undefined, field: Field): Matcher {
  if (regex) return { kind: 'regex', regex };
  if (quoted) return { kind: 'exact', text: raw.toLowerCase() };
  if (field === 'path') return { kind: 'path', segments: raw.split(/[.>›]/).filter(Boolean).map((s) => normalizeKey(s).toLowerCase()) };
  const range = RANGE.exec(raw);
  if (range && (field === 'value' || field === 'old' || field === 'any')) {
    return { kind: 'range', min: Number(range[1]), max: Number(range[2]) };
  }
  const compare = COMPARE.exec(raw);
  if (compare && (field === 'value' || field === 'old' || field === 'any')) {
    return { kind: 'compare', op: compare[1] as '>', operand: compare[2].replace(/^"(.*)"$/, '$1') };
  }
  return { kind: 'contains', text: raw.toLowerCase() };
}

/** Parses a query into terms (all must match). Throws on an invalid regex. */
export function parseQuery(query: string): Term[] {
  const terms: Term[] = [];
  let i = 0;
  while (i < query.length) {
    if (/\s/.test(query[i])) {
      i++;
      continue;
    }
    let field: Field = 'any';
    const prefix = /^(\w+):(?=\S)/.exec(query.slice(i));
    if (prefix && FIELDS.has(prefix[1].toLowerCase())) {
      field = prefix[1].toLowerCase() as Field;
      i += prefix[0].length;
    }
    const token = readToken(query, i);
    i = token.end;
    if (!token.raw && !token.quoted) continue;

    let matcher = matcherFor(token.raw, token.quoted, token.regex, field);
    // A bare dotted word (not a number) is a path: party.@gold, actors.**.@hp
    if (field === 'any' && matcher.kind === 'contains' && /[.>›]/.test(token.raw) && !NUMBER.test(token.raw)) {
      field = 'path';
      matcher = matcherFor(token.raw, false, undefined, 'path');
    }
    // Bare comparisons/ranges are about the value: >1000, 100..200
    if (field === 'any' && (matcher.kind === 'compare' || matcher.kind === 'range')) field = 'value';
    terms.push({ field, matcher });
  }
  return terms;
}

const asNumber = (value: TreeValue | undefined) =>
  typeof value === 'number' ? value : typeof value === 'string' && NUMBER.test(value.trim()) ? Number(value) : undefined;

function matchText(matcher: Matcher, text: string | undefined): boolean {
  if (text === undefined) return false;
  const lower = text.toLowerCase();
  switch (matcher.kind) {
    case 'contains': return lower.includes(matcher.text);
    case 'exact': return lower === matcher.text;
    case 'regex': return matcher.regex.test(text);
    default: return false;
  }
}

function matchValue(matcher: Matcher, value: TreeValue | undefined): boolean {
  if (value === undefined) return false;
  if (matcher.kind === 'range') {
    const n = asNumber(value);
    return n !== undefined && n >= matcher.min && n <= matcher.max;
  }
  if (matcher.kind === 'compare') {
    const { op, operand } = matcher;
    const n = asNumber(value);
    const target = NUMBER.test(operand.trim()) ? Number(operand) : undefined;
    if (op === '=' || op === '!=') {
      const equal = n !== undefined && target !== undefined
        ? n === target
        : String(value).toLowerCase() === operand.toLowerCase();
      return op === '=' ? equal : !equal;
    }
    if (n === undefined || target === undefined) return false;
    return op === '>' ? n > target : op === '>=' ? n >= target : op === '<' ? n < target : n <= target;
  }
  return matchText(matcher, value === null ? 'null' : String(value));
}

/** "**" matches any number of segments, "*" exactly one; the pattern must match the end of the path. */
function matchPath(segments: string[], path: string[]): boolean {
  const keys = path.map((k) => normalizeKey(k).toLowerCase());
  const match = (si: number, pi: number): boolean => {
    if (si < 0) return true; // pattern consumed: matches as a suffix
    const seg = segments[si];
    if (seg === '**') {
      for (let p = pi; p >= -1; p--) if (match(si - 1, p)) return true;
      return false;
    }
    if (pi < 0) return false;
    return (seg === '*' || seg === keys[pi]) && match(si - 1, pi - 1);
  };
  return match(segments.length - 1, keys.length - 1);
}

export function matches(terms: Term[], ctx: MatchContext): boolean {
  return terms.every(({ field, matcher }) => {
    switch (field) {
      case 'key': return matchText(matcher, ctx.key) || matchText(matcher, normalizeKey(ctx.key));
      case 'type': return matchText(matcher, ctx.type);
      case 'value': return matchValue(matcher, ctx.value);
      case 'old': return matchValue(matcher, ctx.oldValue);
      case 'path': return matcher.kind === 'path' ? matchPath(matcher.segments, ctx.path) : matchText(matcher, ctx.path.join('.'));
      case 'any':
        return matchText(matcher, ctx.key) || matchText(matcher, normalizeKey(ctx.key)) ||
          matchText(matcher, ctx.type) || matchValue(matcher, ctx.value);
    }
  });
}

/** Whether a query uses old: terms (needs a previous save). */
export const usesOld = (terms: Term[]) => terms.some((t) => t.field === 'old');
