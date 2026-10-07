import { PLeaf, PNode, PObject } from '../pickle/model';
import { keyLabel } from '../pickle/tree';

/**
 * Loading a Ren'Py save rolls the game back to the start of the statement it
 * was saved on: each Rollback entry restores the store variables it recorded
 * (`stores`: store name -> {name: old value}) and the objects it recorded
 * (`objects`: [(object, snapshot)]). An edit to a variable or attribute that
 * one of these recorded would be undone on load, so the same edit is applied
 * to the recorded values as well. All entries are updated, so rolling back
 * further in the game keeps the edited value too.
 */

const attr = (node: PNode | undefined, name: string): PNode | undefined =>
  node?.kind === 'object' && node.state?.kind === 'dict'
    ? node.state.entries.find(([k]) => k.kind === 'leaf' && k.value === name)?.[1]
    : undefined;

/** Items of a list, whether a plain list or a list subclass (RevertableList in Ren'Py 6). */
const listItems = (node: PNode | undefined): PNode[] | undefined =>
  node?.kind === 'list' || node?.kind === 'tuple' ? node.items : node?.kind === 'object' ? node.items : undefined;

const entryValue = (dict: PNode | undefined, key: string): PNode | undefined =>
  dict?.kind === 'dict' ? dict.entries.find(([k]) => keyLabel(k) === key)?.[1] : undefined;

/** The Rollback objects of the save's RollbackLog. */
export function rollbackEntries(log: PNode): PObject[] {
  const entries = new Set<PObject>();
  for (const item of listItems(attr(log, 'log')) ?? []) if (item.kind === 'object') entries.add(item);
  const current = attr(log, 'current');
  if (current?.kind === 'object') entries.add(current);
  return [...entries];
}

/** Recorded values of the store variable `rootKey` ("store.money", "store.mystore.x"...). */
export function recordedVariable(entries: PObject[], rootKey: string): PNode[] {
  const dot = rootKey.lastIndexOf('.');
  const storeName = dot < 0 ? 'store' : rootKey.slice(0, dot);
  const name = rootKey.slice(dot + 1);
  return entries.flatMap((rb) => {
    const value = entryValue(entryValue(attr(rb, 'stores'), storeName), name);
    return value ? [value] : [];
  });
}

/** Recorded values of `leaf`, held by `parent` (an object, or a dict/list subclass), in object snapshots. */
export function recordedMember(entries: PObject[], parent: PObject, leaf: PLeaf): PNode[] {
  // Where the parent holds the leaf: an attribute, a dict entry or a list item.
  const attribute = parent.state?.kind === 'dict' ? parent.state.entries.find(([, v]) => v === leaf)?.[0] : undefined;
  const dictKey = attribute ? undefined : parent.entries.find(([, v]) => v === leaf)?.[0];
  const listIndex = attribute || dictKey ? -1 : parent.items.indexOf(leaf);
  if (!attribute && !dictKey && listIndex < 0) return [];

  const found: PNode[] = [];
  for (const rb of entries) {
    for (const record of listItems(attr(rb, 'objects')) ?? []) {
      const pair = listItems(record);
      if (!pair || pair.length !== 2 || pair[0] !== parent) continue;
      const snapshot = pair[1];
      if (attribute) {
        // RevertableObject: a copy of __dict__.
        const value = entryValue(snapshot, keyLabel(attribute));
        if (value) found.push(value);
      } else if (dictKey) {
        // RevertableDict: [(key, value), ...].
        for (const item of listItems(snapshot) ?? []) {
          const kv = listItems(item);
          if (kv?.length === 2 && keyLabel(kv[0]) === keyLabel(dictKey)) found.push(kv[1]);
        }
      } else {
        // RevertableList: a copy of the list (or a compressed form, left alone).
        const items = listItems(snapshot);
        if (items && items.length === parent.items.length) found.push(items[listIndex]);
      }
    }
  }
  return found;
}

/** Leaves among `nodes` that can take the same kind of value as `leaf`. */
export const sameKindLeaves = (nodes: PNode[], leaf: PLeaf): PLeaf[] =>
  nodes.filter((n): n is PLeaf => n.kind === 'leaf' && n.type === leaf.type && !n.readOnly && n !== leaf);

