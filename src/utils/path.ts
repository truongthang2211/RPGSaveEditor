/** Splits a Windows or POSIX path into its non-empty segments. */
export function pathSegments(filePath: string): string[] {
  return filePath.split(/[/\\]/).filter(Boolean);
}

export function fileNameFromPath(filePath: string): string {
  return pathSegments(filePath).pop() || '';
}

export function hasExtension(filePath: string, extensions: readonly string[]): boolean {
  const lower = filePath.toLowerCase();
  return extensions.some((ext) => lower.endsWith(`.${ext.toLowerCase()}`));
}

/**
 * The folder holding `filePath`, then each one above it, up to `maxLevels`
 * (closest first): used to look for the game a save belongs to without
 * asking, by checking each level for signs of it.
 */
export function ancestorDirs(filePath: string, maxLevels = 6): string[] {
  const parts = pathSegments(filePath);
  parts.pop(); // the file itself
  const prefix = /^[a-zA-Z]:/.test(filePath) ? '' : /^(\\\\|\/\/)/.test(filePath) ? '//' : '/';
  const dirs: string[] = [];
  for (let i = parts.length; i > 0 && dirs.length < maxLevels; i--) {
    dirs.push(prefix + parts.slice(0, i).join('/'));
  }
  return dirs;
}
