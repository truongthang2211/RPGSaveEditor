import { ReactNode } from 'react';

/** A release-notes style dialog shown by <DialogHost /> (Markdown body, optional footer). */
export interface NotesDialog {
  title: string;
  /** Markdown (release notes). */
  body: string;
  okLabel: string;
  /** Omit for a single-button dialog. */
  cancelLabel?: string;
  footer?: ReactNode;
}

/** Asks for a text (a password); shown by <DialogHost /> instead of a Markdown body. */
export interface PasswordDialog {
  title: string;
  message: string;
  okLabel: string;
  cancelLabel: string;
  /** A third button, for another way to get the password. */
  extraLabel?: string;
}

/** What closing a password dialog gives: the password typed, the extra button, or null for cancel. */
export type PasswordAnswer = { password: string } | { extra: true } | null;

const EXTRA = '\0extra';

interface Open {
  title: string;
  body: string;
  okLabel: string;
  cancelLabel?: string;
  footer?: ReactNode;
  /** Set for a dialog that asks for a text. */
  input?: { message: string; extraLabel?: string };
  /** Set for a dialog that shows a task going on, with a button to stop it (no OK button). */
  progress?: { message: string };
  resolve: (ok: boolean, value?: string) => void;
}

let current: Open | null = null;
const queue: Open[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

/** Shows the dialog (after any already open); resolves true for OK, false for cancel/Esc. */
export function showNotesDialog(dialog: NotesDialog): Promise<boolean> {
  return new Promise((resolve) => {
    const open: Open = { ...dialog, resolve };
    if (current) queue.push(open);
    else current = open;
    emit();
  });
}

/** Asks for a password. */
export function askPassword({ message, extraLabel, ...dialog }: PasswordDialog): Promise<PasswordAnswer> {
  return new Promise((resolve) => {
    const open: Open = {
      ...dialog,
      body: '',
      input: { message, extraLabel },
      resolve: (ok, value) => resolve(!ok ? null : value === EXTRA ? { extra: true } : { password: value ?? '' }),
    };
    if (current) queue.push(open);
    else current = open;
    emit();
  });
}

export function closeNotesDialog(ok: boolean, value?: string) {
  if (!current) return;
  const { resolve } = current;
  current = queue.shift() ?? null;
  emit();
  resolve(ok, value);
}

/** Closes the open password dialog with its extra button. */
export const chooseExtra = () => closeNotesDialog(true, EXTRA);

/**
 * Shows a task going on, with a Stop button; stays open until `close()` is
 * called (unlike the other dialogs, closing it is not up to the user alone).
 * `signal` aborts when the user stops it.
 */
export function showProgress(title: string, stopLabel: string, message: string) {
  let open: Open = { title, body: '', okLabel: '', cancelLabel: stopLabel, progress: { message }, resolve: () => abort.abort() };
  const abort = new AbortController();
  open.resolve = () => abort.abort();
  if (current) queue.push(open);
  else current = open;
  emit();

  return {
    signal: abort.signal,
    update(next: string) {
      if (abort.signal.aborted || current !== open) return;
      open = { ...open, progress: { message: next } };
      current = open;
      emit();
    },
    close() {
      if (current === open) {
        current = queue.shift() ?? null;
        emit();
      } else {
        const index = queue.indexOf(open);
        if (index !== -1) queue.splice(index, 1);
      }
    },
  };
}

export const currentNotesDialog = () => current;
export const isNotesDialogOpen = () => current !== null;

export function subscribeNotesDialog(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
