// ItemsContentStyles.ts
import styled, { css } from 'styled-components';
import { BonusInput } from './PartyContentStyles';

// Data tables (DataTable).
export const TableContainer = styled.div`
  background-color: ${({ theme }) => theme.contentBackground};
  border-radius: 8px;
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
  /* Clips to the rounded corners without becoming a scroll box, so the header can stick. */
  overflow: clip;
  max-width: 100%;
`;

export const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  /* Column widths stay as declared, so a very long name can't push other columns off screen. */
  table-layout: fixed;
`;

export const TableHeader = styled.thead`
  color: ${({ theme }) => theme.headerTextColor};
  font-weight: bold;
`;

const softBorder = css`
  color-mix(in srgb, ${({ theme }) => theme.borderColor} 55%, transparent)
`;

export const TableRow = styled.tr<{ $changed?: boolean }>`
  &:nth-child(even) {
    background-color: ${({ theme }) => theme.rowEvenBackground};
  }

  &:nth-child(odd) {
    background-color: ${({ theme }) => theme.rowOddBackground};
  }

  &:hover {
    background-color: ${({ theme }) => theme.hoverBackground};
  }

  /* Edited since the file was opened: a marker on the row's left edge. */
  & > td:first-child {
    box-shadow: ${({ theme, $changed }) => ($changed ? `inset 3px 0 0 ${theme.changedBorder}` : 'none')};
  }
`;

export const TableCell = styled.td<{ $align?: 'left' | 'center' | 'right' }>`
  padding: 4px 8px;
  border-left: 1px solid ${softBorder};
  border-right: 1px solid ${softBorder};
  text-align: ${({ $align }) => $align ?? 'center'};
  font-size: 14px;
  font-variant-numeric: tabular-nums;

  /* Moving down/up with the keyboard keeps the focused editor clear of the sticky header. */
  input {
    scroll-margin-top: 90px;
    scroll-margin-bottom: 16px;
  }
`;

export const TableHeaderCell = styled.th<{ width: string }>`
  /* Stays at the top while the page scrolls, with the column searches. */
  position: sticky;
  top: -12px; /* the page's top padding */
  z-index: 2;
  padding: 12px 6px 6px 6px;
  background-color: ${({ theme }) => theme.headerBackground};
  box-shadow: inset 0 -1px 0 ${({ theme }) => theme.borderColor};
  text-align: center;
  font-size: 14px;
  width: ${({ width }) => width};
`;

/** One-line text cut with "…" when it doesn't fit; pair with a title showing the full text. */
export const Truncate = styled.span`
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

// Định nghĩa các style cho các input
/** A search box that holds a query (so the list below is filtered): accent border and tint. */
export const activeSearch = css`
  border-color: ${({ theme }) => theme.primaryColor};
  background-color: color-mix(in srgb, ${({ theme }) => theme.primaryColor} 18%, ${({ theme }) => theme.inputBackground});
  box-shadow: 0 0 0 1px ${({ theme }) => theme.primaryColor};
  font-weight: 600;
`;

export const SearchInput = styled(BonusInput)<{ $active?: boolean }>`
  width: 100%;
  padding: 6px;
  border: 1px solid ${({ theme }) => theme.borderColor};
  box-sizing: border-box;
  text-align: left;
  ${({ $active }) => $active && activeSearch}
  ${({ $active }) => $active && 'padding-right: 22px;'}
`;

/** Wraps a SearchInput so a clear button can sit inside it. */
export const SearchField = styled.div`
  position: relative;
`;

export const ClearSearchButton = styled.button`
  all: unset;
  position: absolute;
  top: 50%;
  right: 6px;
  transform: translateY(-50%);
  padding: 0 2px;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  opacity: 0.7;
  &:hover,
  &:focus-visible {
    opacity: 1;
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.primaryColor};
    border-radius: 2px;
  }
`;

export const QuantityInput = styled(BonusInput)`
  width: 100px;
  padding: 5px;
`;
export const SwitchInput = styled(BonusInput)`
  width: 50px;
  accent-color: #509fd7;
  margin: 0px;
`;
