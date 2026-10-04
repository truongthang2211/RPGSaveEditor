import { beforeEach, describe, expect, it, vi } from 'vitest';
import { markSupportPromptShown, PROMPT_AFTER_SAVES, PROMPT_INTERVAL_MS, recordSuccessfulSave } from './supportPrompt';

const storage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
});

beforeEach(() => storage.clear());

const DAY = 24 * 60 * 60 * 1000;

describe('support prompt', () => {
  it('waits for some saves, then asks at most once a week', () => {
    const now = 1_000 * DAY;
    for (let i = 1; i < PROMPT_AFTER_SAVES; i++) expect(recordSuccessfulSave(now)).toBe(false);
    expect(recordSuccessfulSave(now)).toBe(true);

    markSupportPromptShown(now);
    expect(recordSuccessfulSave(now + DAY)).toBe(false);
    expect(recordSuccessfulSave(now + PROMPT_INTERVAL_MS - 1)).toBe(false);
    expect(recordSuccessfulSave(now + PROMPT_INTERVAL_MS)).toBe(true);
    expect(PROMPT_INTERVAL_MS).toBe(7 * DAY);
  });

  it('keeps asking later if the prompt could not be shown', () => {
    for (let i = 0; i < PROMPT_AFTER_SAVES; i++) recordSuccessfulSave();
    expect(recordSuccessfulSave()).toBe(true); // not marked as shown yet
  });
});
