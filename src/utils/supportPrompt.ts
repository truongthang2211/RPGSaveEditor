import { readSetting, writeSetting } from './storage';

/** Ask only people who have used the app for a while... */
export const PROMPT_AFTER_SAVES = 10;
/** ...and at most once a week. */
export const PROMPT_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

const SAVE_COUNT_KEY = 'support.saveCount';
const LAST_SHOWN_KEY = 'support.lastShown';

/** Counts a successful save; true when it's time to ask for support. */
export function recordSuccessfulSave(now = Date.now()): boolean {
  const count = (Number(readSetting(SAVE_COUNT_KEY)) || 0) + 1;
  writeSetting(SAVE_COUNT_KEY, String(count));
  if (count < PROMPT_AFTER_SAVES) return false;
  const lastShown = Number(readSetting(LAST_SHOWN_KEY)) || 0;
  return now - lastShown >= PROMPT_INTERVAL_MS;
}

export const markSupportPromptShown = (now = Date.now()) => writeSetting(LAST_SHOWN_KEY, String(now));
