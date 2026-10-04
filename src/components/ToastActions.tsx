import styled, { css } from 'styled-components';
import ExternalLink from './ExternalLink';

/** Button row inside a toast. */
export const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
`;

const action = css<{ $primary?: boolean }>`
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  text-decoration: none;
  border: 1px solid ${({ theme, $primary }) => ($primary ? theme.selectedBackground : theme.borderColor)};
  background-color: ${({ theme, $primary }) => ($primary ? theme.selectedBackground : 'transparent')};
  color: ${({ theme, $primary }) => ($primary ? theme.selectedColor : 'inherit')};
`;

export const ActionButton = styled.button<{ $primary?: boolean }>`
  ${action}
`;

export const ActionLink = styled(ExternalLink)<{ $primary?: boolean }>`
  ${action}
`;

/** Toasts of the update flow; other prompts stay away while one is showing. */
export const UPDATE_TOAST_ID = 'update-available';
export const UPDATE_PROGRESS_TOAST_ID = 'update-progress';
export const UPDATE_TOAST_IDS = [UPDATE_TOAST_ID, UPDATE_PROGRESS_TOAST_ID];
