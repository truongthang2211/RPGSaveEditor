/** localStorage that never throws: it can be unavailable, and these are only conveniences. */
export function readSetting(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeSetting(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not persisted; applies for this session only.
  }
}

export function removeSetting(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to remove.
  }
}
