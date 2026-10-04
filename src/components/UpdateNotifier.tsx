import React, { useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { getVersion } from '@tauri-apps/api/app';
import { useContent } from '../context/ContentContext';
import { showNotesDialog } from '../utils/dialogs';
import {
  checkForUpdate,
  errorMessage,
  getCheckOnStartup,
  getSkippedVersion,
  installUpdate,
  skipVersion,
  takeWhatsNew,
  Update,
} from '../utils/updater';
import ExternalLink from './ExternalLink';
import { BUY_ME_A_COFFEE, PAYPAL } from './SupportPrompt';
import { Actions, ActionButton, UPDATE_PROGRESS_TOAST_ID, UPDATE_TOAST_ID } from './ToastActions';

interface UpdateToastProps {
  update: Update;
  onUpdate: () => void;
  closeToast?: () => void;
}

const UpdateToast: React.FC<UpdateToastProps> = ({ update, onUpdate, closeToast }) => (
  <div>
    <strong>Version {update.version} is available</strong>
    <Actions>
      <ActionButton
        $primary
        onClick={() => {
          closeToast?.();
          onUpdate();
        }}
      >
        Update
      </ActionButton>
      <ActionButton onClick={closeToast}>Later</ActionButton>
      <ActionButton
        title="Don't remind me about this version"
        onClick={() => {
          skipVersion(update.version);
          closeToast?.();
        }}
      >
        Skip this version
      </ActionButton>
    </Actions>
  </div>
);

const SupportLine: React.FC = () => (
  <>
    Enjoying RPG Save Editor? You can support its development:{' '}
    <ExternalLink href={BUY_ME_A_COFFEE}>Buy me a coffee</ExternalLink> ·{' '}
    <ExternalLink href={PAYPAL}>PayPal</ExternalLink>
  </>
);

/** Downloads and installs with a progress toast. */
async function runInstall(update: Update, dirty: boolean | undefined) {
  try {
    await installUpdate(update, dirty, {
      onProgress: (downloaded, total) => {
        const text = `Downloading update… ${total ? Math.round((downloaded / total) * 100) : 0}%`;
        if (toast.isActive(UPDATE_PROGRESS_TOAST_ID)) toast.update(UPDATE_PROGRESS_TOAST_ID, { render: text });
        else toast.loading(text, { toastId: UPDATE_PROGRESS_TOAST_ID, position: 'top-center' });
      },
      onInstalling: () => toast.update(UPDATE_PROGRESS_TOAST_ID, { render: 'Installing update…' }),
    });
  } catch (error) {
    toast.dismiss(UPDATE_PROGRESS_TOAST_ID);
    toast.error(`Update failed: ${errorMessage(error)}`, { position: 'top-center', autoClose: 6000 });
  }
}

/** After an update: the new version's release notes, once. */
async function showWhatsNew() {
  const notes = takeWhatsNew(await getVersion());
  if (!notes) return;
  await showNotesDialog({
    title: `What's new in ${notes.version}`,
    body: notes.body,
    okLabel: 'Close',
    footer: <SupportLine />,
  });
}

/** Looks for a new version and offers it in a toast; quiet when offline, turned off, in dev or skipped. */
async function checkOnStartup(dirty: () => boolean | undefined) {
  if (import.meta.env.DEV || !getCheckOnStartup()) return;
  const update = await checkForUpdate();
  if (!update || update.version === getSkippedVersion()) return;
  toast.info(
    ({ closeToast }) => <UpdateToast update={update} closeToast={closeToast} onUpdate={() => runInstall(update, dirty())} />,
    { toastId: UPDATE_TOAST_ID, position: 'top-center', autoClose: false, closeOnClick: false, draggable: false },
  );
}

/** Startup: "What's new" after an update, then the update check. */
const UpdateNotifier: React.FC = () => {
  const { content } = useContent();
  const dirty = useRef(content.dirty);
  dirty.current = content.dirty;
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // once per app run (StrictMode runs effects twice in dev)
    started.current = true;
    showWhatsNew()
      .catch((error) => console.warn('Showing release notes failed:', error))
      .then(() => checkOnStartup(() => dirty.current))
      .catch((error) => console.warn('Startup update check failed:', error));
  }, []);

  return null;
};

export default UpdateNotifier;
