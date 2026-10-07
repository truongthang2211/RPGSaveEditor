import { SaveTree, TreeNode } from '../../formats';

/** Keys, types and database names found in a save, for search suggestions. */
export interface Vocabulary {
  keys: string[];
  types: string[];
  names: string[];
}

export type SuggestField = 'key' | 'type' | 'name';

/** Stop collecting after this many values (huge saves): the common keys are found long before. */
const MAX_VISITED = 300_000;
const MAX_KEYS = 20_000;

/**
 * Walks the save tree in steps (call step() until it returns true), like the
 * search, collecting the distinct keys and types. Array indexes ([3]) are left
 * out: they make poor suggestions.
 */
export class VocabularyCollector {
  done = false;
  private readonly keys = new Set<string>();
  private readonly types = new Set<string>();
  private readonly names = new Set<string>();
  private readonly queue: TreeNode[];
  private head = 0;
  private visited = 0;
  private readonly seen = new Set<object>();

  constructor(private readonly tree: SaveTree, private readonly save: unknown) {
    this.queue = tree.roots(save);
  }

  step(budget: number): boolean {
    for (let n = 0; n < budget && !this.done; n++) {
      if (this.head >= this.queue.length || this.visited >= MAX_VISITED) {
        this.done = true;
        break;
      }
      const node = this.queue[this.head++];
      this.visited++;
      if (!/^\[\d+\]$/.test(node.key) && this.keys.size < MAX_KEYS) this.keys.add(node.key);
      this.types.add(node.type);
      if (node.label) this.names.add(node.label);
      if (node.hasChildren && !(node.identity && this.seen.has(node.identity))) {
        if (node.identity) this.seen.add(node.identity);
        this.queue.push(...this.tree.children(this.save, node));
      }
      if (this.head > 50_000) {
        this.queue.splice(0, this.head);
        this.head = 0;
      }
    }
    return this.done;
  }

  get vocabulary(): Vocabulary {
    const sorted = (set: Set<string>) => [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return { keys: sorted(this.keys), types: sorted(this.types), names: sorted(this.names) };
  }
}

/** The field being typed at the end of the query, e.g. "gold key:@he" -> { field: 'key', partial: '@he' }. */
export function fieldAtEnd(query: string): { field: SuggestField; partial: string; start: number } | null {
  // key:@he, or name:"Hi Po (quoted, so names with spaces can be suggested too)
  const match = /(?:^|\s)(key|type|name):(?:"([^"]*)|([^\s"]*))$/i.exec(query);
  if (!match) return null;
  const quoted = match[2] !== undefined;
  const partial = quoted ? match[2] : match[3];
  return { field: match[1].toLowerCase() as SuggestField, partial, start: query.length - partial.length - (quoted ? 1 : 0) };
}

/** Up to `limit` entries: prefix matches first, then other matches (case-insensitive). */
export function suggestions(words: string[], partial: string, limit = 12): string[] {
  const p = partial.toLowerCase();
  const prefix: string[] = [];
  const other: string[] = [];
  for (const word of words) {
    const w = word.toLowerCase();
    if (w === p) continue;
    if (w.startsWith(p)) prefix.push(word);
    else if (p && w.includes(p)) other.push(word);
    if (prefix.length >= limit) break;
  }
  return [...prefix, ...other].slice(0, limit);
}

/** The query with the field's partial text replaced by `word` (quoted when it has spaces), plus a space. */
export function applySuggestion(query: string, start: number, word: string): string {
  const text = /\s|"/.test(word) ? `"${word.replace(/"/g, '')}"` : word;
  return `${query.slice(0, start)}${text} `;
}
