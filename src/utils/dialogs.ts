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

interface Open extends NotesDialog {
  resolve: (ok: boolean) => void;
}

let current: Open | null = null;
const queue: Open[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

/** Shows the dialog (after any already open); resolves true for OK, false for cancel/Esc. */
export function showNotesDialog(dialog: NotesDialog): Promise<boolean> {
  return new Promise((resolve) => {
    const open = { ...dialog, resolve };
    if (current) queue.push(open);
    else current = open;
    emit();
  });
}

export function closeNotesDialog(ok: boolean) {
  if (!current) return;
  const { resolve } = current;
  current = queue.shift() ?? null;
  emit();
  resolve(ok);
}

export const currentNotesDialog = () => current;
export const isNotesDialogOpen = () => current !== null;

export function subscribeNotesDialog(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
