// ItemsContentStyles.ts
import styled, { css } from 'styled-components';
import { BonusInput } from './PartyContentStyles';

// Định nghĩa các style cho các thành phần của bảng
export const TableContainer = styled.div`
  background-color: ${({ theme }) => theme.contentBackground};
  border-radius: 8px;
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
  overflow-x: auto;
  max-width: 100%;
`;

export const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  border-radius: 16px;
  overflow: hidden;
  /* Column widths stay as declared, so a very long name can't push other columns off screen. */
  table-layout: fixed;
`;

export const TableHeader = styled.thead`
  background-color: ${({ theme }) => theme.headerBackground};
  color: ${({ theme }) => theme.headerTextColor};
  font-weight: bold;
`;

export const TableRow = styled.tr`
  &:nth-child(even) {
    background-color: ${({ theme }) => theme.rowEvenBackground};
  }

  &:nth-child(odd) {
    background-color: ${({ theme }) => theme.rowOddBackground};
  }
`;

export const TableCell = styled.td`
  padding: 4px; // Giảm padding để giảm độ cao dòng
  border-left: 1px solid ${({ theme }) => theme.borderColor};
  border-right: 1px solid ${({ theme }) => theme.borderColor};
  text-align: center;
  font-size: 14px;
`;

export const TableHeaderCell = styled.th<{ width: string }>`
  padding: 12px 4px 4px 4px;
  border-bottom: 1px solid ${({ theme }) => theme.borderColor};
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
