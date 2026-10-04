import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * In the Tauri app, the dialog plugin replaces window.alert/confirm with calls
 * to its own commands; since tauri-plugin-dialog 2.8 "plugin:dialog|confirm" is
 * no longer allowed, so window.confirm throws "not allowed by ACL" (this broke
 * the in-app update of 1.4.0). Use confirm()/message() from
 * '@tauri-apps/plugin-dialog', an in-app dialog, or a toast instead.
 */

const SRC = join(process.cwd(), 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** Code without comments and string contents, so only real calls are found. */
const codeOnly = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
    .replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g, '""');

const BROWSER_DIALOG = /\bwindow\s*\.\s*(alert|confirm|prompt)\s*\(|(^|[^.\w$])(alert|prompt)\s*\(/;
const BARE_CONFIRM = /(^|[^.\w$])confirm\s*\(/;
const IMPORTS_PLUGIN_CONFIRM = /import\s*\{[^}]*\bconfirm\b[^}]*\}\s*from\s*['"]@tauri-apps\/plugin-dialog['"]/;

describe('dialogs', () => {
  it('never uses the browser alert/confirm/prompt (blocked by Tauri)', () => {
    const offenders = sourceFiles(SRC).filter((file) => {
      const source = readFileSync(file, 'utf8');
      const code = codeOnly(source);
      return BROWSER_DIALOG.test(code) || (BARE_CONFIRM.test(code) && !IMPORTS_PLUGIN_CONFIRM.test(source));
    });
    expect(offenders.map((file) => relative(process.cwd(), file))).toEqual([]);
  });

  it('catches the 1.4.0 mistake', () => {
    const code = codeOnly("const ok = await window.confirm(`Install ${v}?`); // window.alert('x')");
    expect(BROWSER_DIALOG.test(code)).toBe(true);
    expect(BROWSER_DIALOG.test(codeOnly("toast('alert(1)'); // alert(2)"))).toBe(false);
  });
});
