/**
 * MV's JsonEx wraps arrays as { "@a": [...], "@c": n }; MZ stores plain arrays.
 * These helpers read/write either shape.
 */

/** Returns the underlying array (empty when missing). */
export function unwrapArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.['@a'])) return value['@a'];
  return [];
}

/** Extra path segment to reach the underlying array: ['@a'] for MV, [] for MZ. */
export function arrayKeys(value: any): string[] {
  return Array.isArray(value?.['@a']) ? ['@a'] : [];
}

export function isArrayLike(value: any): boolean {
  return Array.isArray(value) || Array.isArray(value?.['@a']);
}
