import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import styled from 'styled-components';
import { closeNotesDialog, currentNotesDialog, subscribeNotesDialog } from '../utils/dialogs';
import { Markdown } from '../utils/markdown';

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background-color: rgba(0, 0, 0, 0.45);
`;

const Box = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 560px;
  max-height: 85vh;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.borderColor};
  background-color: ${({ theme }) => theme.itemBackground};
  color: ${({ theme }) => theme.color};
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
`;

const Title = styled.h2`
  margin: 0;
  padding: 16px 20px 8px;
  font-size: 18px;
  color: ${({ theme }) => theme.primaryColor};
`;

const Body = styled(Markdown)`
  flex: 1;
  overflow: auto;
  padding: 0 20px;
  font-size: 14px;
  line-height: 1.5;
  h3,
  h4,
  h5,
  h6 {
    margin: 12px 0 4px;
    font-size: 15px;
  }
  ul {
    margin: 4px 0;
    padding-left: 20px;
  }
  p {
    margin: 8px 0;
  }
  code {
    padding: 0 4px;
    border-radius: 4px;
    font-family: Consolas, Menlo, monospace;
    background-color: ${({ theme }) => theme.hoverBackground};
  }
  a {
    color: ${({ theme }) => theme.primaryColor};
    word-break: break-all;
  }
`;

const Footer = styled.div`
  padding: 10px 20px 0;
  font-size: 13px;
  a {
    color: ${({ theme }) => theme.primaryColor};
  }
`;

const Buttons = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 14px 20px 16px;
`;

const Button = styled.button<{ $primary?: boolean }>`
  padding: 7px 16px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  border: 1px solid ${({ theme, $primary }) => ($primary ? theme.selectedBackground : theme.borderColor)};
  background-color: ${({ theme, $primary }) => ($primary ? theme.selectedBackground : 'transparent')};
  color: ${({ theme, $primary }) => ($primary ? theme.selectedColor : theme.color)};
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.primaryColor};
    outline-offset: 2px;
  }
`;

/** Renders the dialogs requested with showNotesDialog(). Mount once inside the ThemeProvider. */
const DialogHost: React.FC = () => {
  const dialog = useSyncExternalStore(subscribeNotesDialog, currentNotesDialog);
  const okButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!dialog) return;
    okButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeNotesDialog(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog]);

  if (!dialog) return null;
  return (
    <Overlay>
      <Box role="dialog" aria-modal="true" aria-labelledby="notes-dialog-title">
        <Title id="notes-dialog-title">{dialog.title}</Title>
        <Body text={dialog.body || 'No release notes available.'} />
        {dialog.footer && <Footer>{dialog.footer}</Footer>}
        <Buttons>
          {dialog.cancelLabel && <Button onClick={() => closeNotesDialog(false)}>{dialog.cancelLabel}</Button>}
          <Button $primary ref={okButton} onClick={() => closeNotesDialog(true)}>
            {dialog.okLabel}
          </Button>
        </Buttons>
      </Box>
    </Overlay>
  );
};

export default DialogHost;
