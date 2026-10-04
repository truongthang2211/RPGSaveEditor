import React from 'react';
import { toast } from 'react-toastify';
import { isNotesDialogOpen } from '../utils/dialogs';
import { markSupportPromptShown, recordSuccessfulSave } from '../utils/supportPrompt';
import { Actions, ActionButton, ActionLink, UPDATE_TOAST_IDS } from './ToastActions';

export const BUY_ME_A_COFFEE = 'https://www.buymeacoffee.com/truongthang2211';
export const PAYPAL = 'https://www.paypal.me/truongthang2211';

const TOAST_ID = 'support-prompt';
/** Let the "File Saved!" toast go first. */
const DELAY_MS = 1500;

const SupportToast: React.FC<{ closeToast?: () => void }> = ({ closeToast }) => (
  <div>
    <strong>Enjoying RPG Save Editor?</strong>
    <div>It's free and made in my spare time. A coffee helps keep it going ☕</div>
    <Actions>
      <ActionLink $primary href={BUY_ME_A_COFFEE} onClick={closeToast}>
        Buy me a coffee
      </ActionLink>
      <ActionLink href={PAYPAL} onClick={closeToast}>
        PayPal
      </ActionLink>
      <ActionButton onClick={closeToast}>Later</ActionButton>
    </Actions>
  </div>
);

/** Call after a successful save: now and then, a small toast asks for support. */
export function maybeAskForSupport() {
  if (!recordSuccessfulSave()) return;
  window.setTimeout(() => {
    // Never on top of an update offer, a release-notes dialog or an error.
    const busy =
      isNotesDialogOpen() || UPDATE_TOAST_IDS.some((id) => toast.isActive(id)) || document.querySelector('.Toastify__toast--error');
    if (busy || toast.isActive(TOAST_ID)) return;
    markSupportPromptShown();
    toast(({ closeToast }) => <SupportToast closeToast={closeToast} />, {
      toastId: TOAST_ID,
      position: 'bottom-right',
      autoClose: false,
      closeOnClick: false,
      draggable: false,
    });
  }, DELAY_MS);
}
