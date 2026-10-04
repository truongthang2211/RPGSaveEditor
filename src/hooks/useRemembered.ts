import { useEffect, useState } from 'react';

/**
 * Tab state kept while the app runs (searches, sorting, expanded sections),
 * so switching to another tab and back doesn't reset it. Lost on restart.
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
