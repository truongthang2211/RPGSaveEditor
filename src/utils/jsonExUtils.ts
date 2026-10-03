/**
 * MV's JsonEx wraps arrays as { "@a": [...], "@c": n }; MZ stores plain arrays.
 * These helpers read/write either shape.
 */

/** Returns the underlying array (same reference, so it can be mutated in place). */
export function unwrapArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.['@a'])) return value['@a'];
  return [];
}

/** Lodash path to the underlying array: `${basePath}.@a` for MV, `basePath` for MZ. */
export function arrayPath(value: any, basePath: string): string {
  return Array.isArray(value?.['@a']) ? `${basePath}.@a` : basePath;
}
