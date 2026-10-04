import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { confirmDiscard } from '../hooks/useActions';
import { showNotesDialog } from './dialogs';
import { readSetting, removeSetting, writeSetting } from './storage';

export type { Update };

const CHECK_ON_STARTUP_KEY = 'updates.checkOnStartup';
const SKIPPED_VERSION_KEY = 'updates.skippedVersion';
/** Release notes of the version being installed, shown as "What's new" after the restart. */
const WHATS_NEW_KEY = 'updates.whatsNew';

/** Whether to look for a new version when the app starts (on by default). */
export const getCheckOnStartup = () => readSetting(CHECK_ON_STARTUP_KEY) !== 'false';
export const setCheckOnStartup = (on: boolean) => writeSetting(CHECK_ON_STARTUP_KEY, String(on));

/** A version the user chose to skip; the startup check stays quiet about it (a manual check still shows it). */
export const getSkippedVersion = () => readSetting(SKIPPED_VERSION_KEY);
export const skipVersion = (version: string) => writeSetting(SKIPPED_VERSION_KEY, version);

/** The newer version, or null when this is the latest. Throws when offline or the update server fails. */
export const checkForUpdate = (): Promise<Update | null> => check();

/**
 * Release notes to show once after updating to `currentVersion`, or null. Notes
 * for another version (an install that didn't finish) are kept for later.
 */
export function takeWhatsNew(currentVersion: string): { version: string; body: string } | null {
  const saved = readSetting(WHATS_NEW_KEY);
  if (!saved) return null;
  try {
    const notes = JSON.parse(saved) as { version: string; body: string };
    if (notes.version !== currentVersion) return null;
    removeSetting(WHATS_NEW_KEY);
    return notes;
  } catch {
    removeSetting(WHATS_NEW_KEY);
    return null;
  }
}

export interface InstallCallbacks {
  onProgress?: (downloaded: number, total: number) => void;
  onInstalling?: () => void;
}

/**
 * Shows the release notes, then downloads, installs and relaunches. Installing
 * closes the app, so unsaved edits are confirmed first. Returns false if the
 * user declined.
 */
export async function installUpdate(update: Update, dirty: boolean | undefined, callbacks: InstallCallbacks = {}) {
  const wanted = await showNotesDialog({
    title: `Version ${update.version} is available`,
    body: update.body ?? '',
    okLabel: 'Install and restart',
    cancelLabel: 'Not now',
  });
  if (!wanted || !(await confirmDiscard(dirty, 'Install the update'))) return false;

  writeSetting(WHATS_NEW_KEY, JSON.stringify({ version: update.version, body: update.body ?? '' }));
  let downloaded = 0;
  let total = 0;
  await update.downloadAndInstall((event) => {
    if (event.event === 'Started') {
      total = event.data.contentLength ?? 0;
      callbacks.onProgress?.(0, total);
    } else if (event.event === 'Progress') {
      downloaded += event.data.chunkLength;
      callbacks.onProgress?.(downloaded, total || downloaded);
    } else if (event.event === 'Finished') {
      callbacks.onInstalling?.();
    }
  });
  callbacks.onInstalling?.();
  await relaunch();
  return true;
}

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error);
