import { SaveTree, TreeNode, TreeValue } from '../../formats';
import { matches, Term } from './query';

/** Compare each value with the same path in the previous save of the game. */
export type CompareMode = 'none' | 'changed' | 'unchanged' | 'increased' | 'decreased';

export interface SearchResult {
  /** Nodes from a root to the match. */
  chain: TreeNode[];
  /** Index of each chain node among its parent's children (to page the tree far enough). */
  indices: number[];
  /** Value in the previous save, when comparing. */
  oldValue?: TreeValue;
}

export interface SearchSpec {
  tree: SaveTree;
  save: unknown;
  /** Previous save of the same game, for compare mode and old: terms. */
  old?: unknown;
  terms: Term[];
  compare: CompareMode;
  editableOnly: boolean;
  /** Search only inside this node (a result chain from the root). */
  scope?: Pick<SearchResult, 'chain' | 'indices'>;
  maxResults?: number;
}

const DEFAULT_MAX_RESULTS = 500;

const isLeaf = (node: TreeNode) => !node.hasChildren && node.value !== undefined;

function compareOk(mode: CompareMode, node: TreeNode, oldValue: TreeValue | undefined, hasOld: boolean): boolean {
  if (mode === 'none') return true;
  if (!hasOld || !isLeaf(node)) return false;
  const value = node.value;
  switch (mode) {
    case 'changed': return oldValue !== value;
    case 'unchanged': return oldValue === value;
    case 'increased': return typeof value === 'number' && typeof oldValue === 'number' && value > oldValue;
    case 'decreased': return typeof value === 'number' && typeof oldValue === 'number' && value < oldValue;
  }
}

/** Whether a node passes the query, the compare mode and the editable-only filter. */
function accept(spec: SearchSpec, node: TreeNode, path: string[], oldNode: TreeNode | null | undefined): boolean {
  if (spec.editableOnly && !node.editable) return false;
  const hasOld = spec.old !== undefined;
  const oldValue = oldNode && isLeaf(oldNode) ? oldNode.value : undefined;
  if (!compareOk(spec.compare, node, oldValue, hasOld)) return false;
  if (spec.terms.length === 0) return spec.compare !== 'none' || spec.editableOnly;
  return matches(spec.terms, { key: node.key, type: node.type, value: node.value, oldValue, path });
}

interface Entry {
  node: TreeNode;
  index: number;
  parent: Entry | null;
  /** The node with the same id in the previous save (null: not there; undefined: not comparing). */
  old?: TreeNode | null;
}

const pathOf = (entry: Entry): Entry[] => {
  const entries: Entry[] = [];
  for (let e: Entry | null = entry; e; e = e.parent) entries.unshift(e);
  return entries;
};

/** Children of `node` in `save`, matched by id to `parentOld`'s children in the old save. */
function childEntries(spec: SearchSpec, entry: Entry): Entry[] {
  const children = spec.tree.children(spec.save, entry.node);
  let oldById: Map<string, TreeNode> | undefined;
  if (entry.old !== undefined) {
    oldById = new Map(
      entry.old && entry.old.hasChildren ? spec.tree.children(spec.old, entry.old).map((n) => [n.id, n]) : [],
    );
  }
  return children.map((node, index) => ({
    node,
    index,
    parent: entry,
    ...(oldById ? { old: oldById.get(node.id) ?? null } : {}),
  }));
}

/** Finds nodes by their id path from the roots (works across saves of the same game). */
export function resolveChain(tree: SaveTree, save: unknown, ids: string[]): Pick<SearchResult, 'chain' | 'indices'> | null {
  let level = tree.roots(save);
  const chain: TreeNode[] = [];
  const indices: number[] = [];
  for (const id of ids) {
    const index = level.findIndex((n) => n.id === id);
    if (index === -1) return null;
    chain.push(level[index]);
    indices.push(index);
    level = level[index].hasChildren ? tree.children(save, level[index]) : [];
  }
  return { chain, indices };
}

/**
 * Breadth-first search run in small steps (call step() until done) so the UI
 * stays responsive on large saves. Shared containers are expanded once.
 */
export class TreeSearch {
  readonly results: SearchResult[] = [];
  visited = 0;
  done = false;
  private readonly queue: Entry[] = [];
  private head = 0;
  private readonly seen = new Set<object>();
  private readonly comparing: boolean;
  private readonly maxResults: number;

  constructor(private readonly spec: SearchSpec) {
    this.comparing = spec.old !== undefined;
    this.maxResults = spec.maxResults ?? DEFAULT_MAX_RESULTS;

    if (spec.scope && spec.scope.chain.length) {
      // Rebuild the scope's entries (and old counterparts) and start from its children.
      let parent: Entry | null = null;
      const oldScope = this.comparing ? resolveChain(spec.tree, spec.old, spec.scope.chain.map((n) => n.id)) : null;
      spec.scope.chain.forEach((node, i) => {
        parent = {
          node,
          index: spec.scope!.indices[i],
          parent,
          ...(this.comparing ? { old: oldScope?.chain[i] ?? null } : {}),
        };
      });
      this.queue.push(...childEntries(spec, parent!));
    } else {
      const oldRoots = this.comparing ? new Map(spec.tree.roots(spec.old).map((n) => [n.id, n])) : undefined;
      spec.tree.roots(spec.save).forEach((node, index) =>
        this.queue.push({ node, index, parent: null, ...(oldRoots ? { old: oldRoots.get(node.id) ?? null } : {}) }),
      );
    }
  }

  /** Processes up to `budget` nodes; returns true when finished. */
  step(budget: number): boolean {
    let processed = 0;
    while (!this.done && processed < budget) {
      if (this.head >= this.queue.length || this.results.length >= this.maxResults) {
        this.done = true;
        break;
      }
      const entry = this.queue[this.head++];
      processed++;
      this.visited++;
      const entries = pathOf(entry);
      const path = entries.map((e) => e.node.key);
      if (accept(this.spec, entry.node, path, entry.old)) {
        this.results.push({
          chain: entries.map((e) => e.node),
          indices: entries.map((e) => e.index),
          ...(this.comparing && entry.old && isLeaf(entry.old) ? { oldValue: entry.old.value } : {}),
        });
      }
      const { node } = entry;
      if (node.hasChildren && !(node.identity && this.seen.has(node.identity))) {
        if (node.identity) this.seen.add(node.identity);
        this.queue.push(...childEntries(this.spec, entry));
      }
      // Drop processed entries now and then so long searches don't keep the whole queue alive.
      if (this.head > 50_000) {
        this.queue.splice(0, this.head);
        this.head = 0;
      }
    }
    return this.done;
  }

  /** True when the search stopped because it found enough results, not because it finished. */
  get hitResultLimit(): boolean {
    return this.results.length >= this.maxResults;
  }
}

/** Runs a whole search synchronously (tests, small saves). */
export function searchAll(spec: SearchSpec): SearchResult[] {
  const search = new TreeSearch(spec);
  while (!search.step(10_000));
  return search.results;
}

/**
 * Keeps the previous results that still match (after editing values, or after
 * opening another save of the same game), re-reading them by path.
 */
export function refine(spec: SearchSpec, previous: SearchResult[]): SearchResult[] {
  const results: SearchResult[] = [];
  for (const result of previous) {
    const ids = result.chain.map((n) => n.id);
    const found = resolveChain(spec.tree, spec.save, ids);
    if (!found) continue;
    const node = found.chain[found.chain.length - 1];
    const oldFound = spec.old !== undefined ? resolveChain(spec.tree, spec.old, ids) : null;
    const oldNode = oldFound ? oldFound.chain[oldFound.chain.length - 1] : spec.old !== undefined ? null : undefined;
    if (accept(spec, node, found.chain.map((n) => n.key), oldNode)) {
      results.push({ ...found, ...(oldNode && isLeaf(oldNode) ? { oldValue: oldNode.value } : {}) });
    }
  }
  return results;
}
