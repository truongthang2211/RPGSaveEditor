import { beforeEach, describe, expect, it, vi } from 'vitest';

const confirm = vi.fn(); // native "unsaved changes" dialog
const showNotesDialog = vi.fn(); // in-app release notes dialog
const relaunch = vi.fn();
vi.mock('@tauri-apps/plugin-dialog', () => ({ confirm }));
vi.mock('./dialogs', () => ({ showNotesDialog }));
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch }));
vi.mock('@tauri-apps/plugin-updater', () => ({ check: vi.fn() }));

const { getCheckOnStartup, getSkippedVersion, installUpdate, setCheckOnStartup, skipVersion, takeWhatsNew } = await import('./updater');

const storage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
});

const fakeUpdate = () => ({
  version: '9.9.9',
  body: 'notes',
  downloadAndInstall: vi.fn(async (onEvent: (event: any) => void) => {
    onEvent({ event: 'Started', data: { contentLength: 100 } });
    onEvent({ event: 'Progress', data: { chunkLength: 40 } });
    onEvent({ event: 'Progress', data: { chunkLength: 60 } });
    onEvent({ event: 'Finished' });
  }),
});

beforeEach(() => {
  storage.clear();
  confirm.mockReset();
  showNotesDialog.mockReset();
  relaunch.mockReset();
});

describe('update preferences', () => {
  it('checks on startup by default and remembers the choice', () => {
    expect(getCheckOnStartup()).toBe(true);
    setCheckOnStartup(false);
    expect(getCheckOnStartup()).toBe(false);
    setCheckOnStartup(true);
    expect(getCheckOnStartup()).toBe(true);
  });

  it('remembers a skipped version', () => {
    expect(getSkippedVersion()).toBeNull();
    skipVersion('1.6.0');
    expect(getSkippedVersion()).toBe('1.6.0');
  });
});

describe('installing an update', () => {
  it('shows the release notes and does nothing when the user declines', async () => {
    showNotesDialog.mockResolvedValueOnce(false);
    const update = fakeUpdate();
    expect(await installUpdate(update as any, false)).toBe(false);
    expect(showNotesDialog).toHaveBeenCalledWith(expect.objectContaining({ title: 'Version 9.9.9 is available', body: 'notes' }));
    expect(update.downloadAndInstall).not.toHaveBeenCalled();
    expect(takeWhatsNew('9.9.9')).toBeNull();
  });

  it('asks before discarding unsaved edits, and stops if the user keeps them', async () => {
    showNotesDialog.mockResolvedValueOnce(true);
    confirm.mockResolvedValueOnce(false);
    const update = fakeUpdate();
    expect(await installUpdate(update as any, true)).toBe(false);
    expect(confirm.mock.calls[0][0]).toMatch(/unsaved changes/);
    expect(update.downloadAndInstall).not.toHaveBeenCalled();
  });

  it('downloads with progress, installs and relaunches', async () => {
    showNotesDialog.mockResolvedValueOnce(true);
    const update = fakeUpdate();
    const progress: [number, number][] = [];
    const onInstalling = vi.fn();
    expect(await installUpdate(update as any, false, { onProgress: (d, t) => progress.push([d, t]), onInstalling })).toBe(true);
    expect(progress).toEqual([[0, 100], [40, 100], [100, 100]]);
    expect(onInstalling).toHaveBeenCalled();
    expect(relaunch).toHaveBeenCalledOnce();
  });

  it(`keeps the notes to show once as "What's new" after the restart`, async () => {
    showNotesDialog.mockResolvedValueOnce(true);
    await installUpdate(fakeUpdate() as any, false);
    expect(takeWhatsNew('1.0.0')).toBeNull(); // still the old version: install didn't finish
    expect(takeWhatsNew('9.9.9')).toEqual({ version: '9.9.9', body: 'notes' });
    expect(takeWhatsNew('9.9.9')).toBeNull(); // only once
  });
});
