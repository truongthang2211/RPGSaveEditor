// ItemsContentStyles.ts
import styled from 'styled-components';
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
export const SearchInput = styled(BonusInput)`
  width: 100%;
  padding: 6px;
  border: 1px solid ${({ theme }) => theme.borderColor};
  box-sizing: border-box;
  text-align: left;
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
