import { readSetting, writeSetting } from './storage';

const RECENT_FILES_KEY = 'recentFiles';
const MAX_RECENT_FILES = 8;

function samePath(left: string, right: string): boolean {
  const isWindowsPath = /^(?:[a-z]:[\\/]|\\\\)/i.test(left) || /^(?:[a-z]:[\\/]|\\\\)/i.test(right);
  return isWindowsPath ? left.toLowerCase() === right.toLowerCase() : left === right;
}

export function getRecentFiles(): string[] {
  const saved = readSetting(RECENT_FILES_KEY);
  if (!saved) return [];

  try {
    const parsed: unknown = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((path): path is string => typeof path === 'string' && path.length > 0).slice(0, MAX_RECENT_FILES);
  } catch {
    return [];
  }
}

export function rememberRecentFile(filePath: string): string[] {
  const recentFiles = [filePath, ...getRecentFiles().filter((path) => !samePath(path, filePath))].slice(0, MAX_RECENT_FILES);
  writeSetting(RECENT_FILES_KEY, JSON.stringify(recentFiles));
  return recentFiles;
}

export function forgetRecentFile(filePath: string): string[] {
  const recentFiles = getRecentFiles().filter((path) => !samePath(path, filePath));
  writeSetting(RECENT_FILES_KEY, JSON.stringify(recentFiles));
  return recentFiles;
}
