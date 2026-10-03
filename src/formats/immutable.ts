export type Path = readonly (string | number)[];

/**
 * Returns a copy of `obj` with the value at `path` replaced by `update(current)`.
 * Only containers along the path are copied; everything else is shared.
 * Missing containers are created (arrays when the next key is a number).
 */
export function updateIn<T>(obj: T, path: Path, update: (current: any) => any): T {
  if (path.length === 0) return update(obj);
  const [key, ...rest] = path;
  const source: any = obj ?? (typeof key === 'number' ? [] : {});
  const copy: any = Array.isArray(source) ? [...source] : { ...source };
  copy[key] = updateIn(source[key], rest, update);
  return copy;
}

export function setIn<T>(obj: T, path: Path, value: unknown): T {
  return updateIn(obj, path, () => value);
}
