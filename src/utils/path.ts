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
