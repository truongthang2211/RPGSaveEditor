/**
 * A JSON text with the position of every value, so a value can be replaced in
 * the text itself: nothing else in the file changes (indentation, key order,
 * `1.0` versus `1`, escapes, numbers too large for a double).
 *
 * Many Unity games (Naninovel...) keep JSON inside JSON strings. A string that
 * holds a JSON object or list is parsed too (`embedded`), and an edit inside it
 * is written back into the string.
 */
export type JNode =
  | { k: 'object'; start: number; end: number; members: { key: string; value: JNode }[] }
  | { k: 'array'; start: number; end: number; items: JNode[] }
  | { k: 'string'; start: number; end: number; value: string; embedded?: JDoc }
  | { k: 'number'; start: number; end: number; value: number }
  | { k: 'boolean'; start: number; end: number; value: boolean }
  | { k: 'null'; start: number; end: number };

export interface JDoc {
  text: string;
  root: JNode;
}

/** A key of an object or an index of an array. */
export type Step = string | number;

/** How many levels of JSON inside JSON strings are looked into. */
const MAX_EMBEDDED_DEPTH = 6;

const WHITESPACE = new Set([0x20, 0x09, 0x0a, 0x0d]);
const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

export function parseDoc(text: string, depth = 0): JDoc {
  let pos = 0;

  const fail = (what: string): never => {
    throw new Error(`Invalid JSON at position ${pos}: ${what}`);
  };
  const skip = () => {
    while (pos < text.length && WHITESPACE.has(text.charCodeAt(pos))) pos++;
  };
  const expect = (char: string) => {
    if (text[pos] !== char) fail(`expected "${char}"`);
    pos++;
  };

  function readString(): string {
    const start = pos;
    pos++; // opening quote
    while (pos < text.length && text[pos] !== '"') pos += text[pos] === '\\' ? 2 : 1;
    if (pos >= text.length) fail('unterminated string');
    pos++; // closing quote
    try {
      return JSON.parse(text.slice(start, pos)) as string;
    } catch {
      pos = start;
      return fail('bad string');
    }
  }

  function value(): JNode {
    skip();
    const start = pos;
    const c = text[pos];
    if (c === '{') {
      pos++;
      const members: { key: string; value: JNode }[] = [];
      skip();
      if (text[pos] === '}') {
        pos++;
        return { k: 'object', start, end: pos, members };
      }
      for (;;) {
        skip();
        if (text[pos] !== '"') fail('expected a key');
        const key = readString();
        skip();
        expect(':');
        members.push({ key, value: value() });
        skip();
        if (text[pos] === ',') {
          pos++;
          continue;
        }
        expect('}');
        return { k: 'object', start, end: pos, members };
      }
    }
    if (c === '[') {
      pos++;
      const items: JNode[] = [];
      skip();
      if (text[pos] === ']') {
        pos++;
        return { k: 'array', start, end: pos, items };
      }
      for (;;) {
        items.push(value());
        skip();
        if (text[pos] === ',') {
          pos++;
          continue;
        }
        expect(']');
        return { k: 'array', start, end: pos, items };
      }
    }
    if (c === '"') {
      const decoded = readString();
      const node: JNode = { k: 'string', start, end: pos, value: decoded };
      if (depth < MAX_EMBEDDED_DEPTH && decoded.length > 1) {
        const first = decoded.trimStart()[0];
        if (first === '{' || first === '[') {
          try {
            node.embedded = parseDoc(decoded, depth + 1);
          } catch {
            // just text
          }
        }
      }
      return node;
    }
    if (text.startsWith('true', pos)) return ((pos += 4), { k: 'boolean', start, end: pos, value: true });
    if (text.startsWith('false', pos)) return ((pos += 5), { k: 'boolean', start, end: pos, value: false });
    if (text.startsWith('null', pos)) return ((pos += 4), { k: 'null', start, end: pos });
    NUMBER.lastIndex = pos;
    const match = NUMBER.exec(text);
    if (!match) return fail('unexpected character');
    pos += match[0].length;
    return { k: 'number', start, end: pos, value: Number(match[0]) };
  }

  const root = value();
  skip();
  if (pos !== text.length) fail('unexpected text after the value');
  return { text, root };
}

/** The container a node's children are in: a string holding JSON is a container of what it holds. */
export function containerOf(node: JNode): JNode {
  return node.k === 'string' && node.embedded ? node.embedded.root : node;
}

export function childOf(node: JNode, step: Step): JNode | undefined {
  const container = containerOf(node);
  if (container.k === 'object') {
    const matches = container.members.filter((member) => member.key === String(step));
    return matches[matches.length - 1]?.value; // like JSON.parse: the last one wins
  }
  if (container.k === 'array') return container.items[Number(step)];
  return undefined;
}

export function nodeAt(doc: JDoc, path: readonly Step[]): JNode | undefined {
  let node: JNode | undefined = doc.root;
  for (const step of path) {
    if (!node) return undefined;
    node = childOf(node, step);
  }
  return node;
}

const replaceSpan = (text: string, start: number, end: number, literal: string) => text.slice(0, start) + literal + text.slice(end);

/**
 * The text of `doc` with the value at `path` replaced by `literal` (JSON text).
 * Inside a string that holds JSON the change is made in that JSON, which is
 * then written back as the string.
 */
export function patchText(doc: JDoc, path: readonly Step[], literal: string): string {
  let node: JNode = doc.root;
  for (let i = 0; i < path.length; i++) {
    if (node.k === 'string' && node.embedded) {
      return replaceSpan(doc.text, node.start, node.end, JSON.stringify(patchText(node.embedded, path.slice(i), literal)));
    }
    const next = childOf(node, path[i]);
    if (!next) throw new Error('No such value');
    node = next;
  }
  return replaceSpan(doc.text, node.start, node.end, literal);
}

/** The JSON text of the value at `path` (inside the string that holds it, when it is in embedded JSON). */
export function literalAt(doc: JDoc, path: readonly Step[]): string | undefined {
  let node: JNode = doc.root;
  for (let i = 0; i < path.length; i++) {
    if (node.k === 'string' && node.embedded) return literalAt(node.embedded, path.slice(i));
    const next = childOf(node, path[i]);
    if (!next) return undefined;
    node = next;
  }
  return doc.text.slice(node.start, node.end);
}

/** Whether two documents hold the same values (`1.0` equals `1`, and JSON inside strings is compared as JSON). */
export function sameNode(a: JNode, b: JNode): boolean {
  if (a.k === 'string' && b.k === 'string') {
    if (a.embedded && b.embedded) return sameNode(a.embedded.root, b.embedded.root);
    return a.value === b.value;
  }
  if (a.k !== b.k) return false;
  if (a.k === 'object' && b.k === 'object') {
    return a.members.length === b.members.length && a.members.every((member, i) => member.key === b.members[i].key && sameNode(member.value, b.members[i].value));
  }
  if (a.k === 'array' && b.k === 'array') return a.items.length === b.items.length && a.items.every((item, i) => sameNode(item, b.items[i]));
  if (a.k === 'number' && b.k === 'number') return a.value === b.value;
  if (a.k === 'boolean' && b.k === 'boolean') return a.value === b.value;
  return true;
}
