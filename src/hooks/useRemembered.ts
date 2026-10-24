import { useEffect, useState } from 'react';

/**
 * Tab state kept while the app runs (searches, sorting, expanded sections),
 * so switching to another tab and back doesn't reset it. Lost on restart,
 * and cleared when a (different) file is opened (see clearRemembered): much
 * of it is node references into that file's own tree (a search result's
 * chain, an expanded node's id...), which don't make sense, and can even
 * crash a page trying to resolve them, against a save they weren't found in.
 */
const remembered = new Map<string, unknown>();

/** useState whose value survives the component unmounting; `key` must be unique app-wide. */
export function useRemembered<T>(key: string, initial: T, restore: (value: T) => T = (v) => v) {
  const [value, setValue] = useState<T>(() => (remembered.has(key) ? restore(remembered.get(key) as T) : initial));
  useEffect(() => {
    remembered.set(key, value);
  }, [key, value]);
  return [value, setValue] as const;
}

/** Forgets all remembered tab state: call when a file is opened, so none of it is carried over from a previous one. */
export function clearRemembered() {
  remembered.clear();
}
