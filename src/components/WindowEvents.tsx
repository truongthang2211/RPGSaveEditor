import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { useContent } from '../context/ContentContext';
import { confirmDiscard, useOpenPath } from '../hooks/useActions';
import { supportedExtensionsText } from '../formats';

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  background-color: rgba(0, 0, 0, 0.35);
`;

const DropBox = styled.div`
  padding: 32px 48px;
  border: 3px dashed ${({ theme }) => theme.primaryColor};
  border-radius: 16px;
  background-color: ${({ theme }) => theme.contentBackground};
  color: ${({ theme }) => theme.color};
  text-align: center;
  font-size: 18px;
  font-weight: 600;
`;

const Hint = styled.div`
  margin-top: 8px;
  font-size: 13px;
  font-weight: 400;
  opacity: 0.7;
`;

const isTauri = () => '__TAURI_INTERNALS__' in window;

/**
 * Window-level behaviour: ask before closing with unsaved changes, and open a
 * save file dropped onto the window.
 */
const WindowEvents: React.FC = () => {
  const { content } = useContent();
  const openPath = useOpenPath();
  const [dragging, setDragging] = useState(false);

  // Listeners are registered once; refs give them the latest state.
  const dirtyRef = useRef(content.dirty);
  const openPathRef = useRef(openPath);
  dirtyRef.current = content.dirty;
  openPathRef.current = openPath;

  useEffect(() => {
    if (!isTauri()) return;
    const unlisten = getCurrentWindow().onCloseRequested(async (event) => {
      if (!(await confirmDiscard(dirtyRef.current, 'Close'))) event.preventDefault();
    });
    return () => {
      unlisten.then((stop) => stop());
    };
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      const { type } = event.payload;
      if (type === 'enter' || type === 'over') setDragging(true);
      else if (type === 'leave') setDragging(false);
      else if (type === 'drop') {
        setDragging(false);
        const [path] = event.payload.paths;
        if (path) openPathRef.current(path);
      }
    });
    return () => {
      unlisten.then((stop) => stop());
    };
  }, []);

  if (!dragging) return null;
  return (
    <Overlay>
      <DropBox>
        Drop the save file to open it
        <Hint>{supportedExtensionsText()}</Hint>
      </DropBox>
    </Overlay>
  );
};

export default WindowEvents;
