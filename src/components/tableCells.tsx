import React from 'react';
import styled from 'styled-components';
import { CellValue, Column, display } from './DataTable';
import { Truncate } from '../styles/ItemsContentStyles';
import { GAP_COLUMN_HELP, OLD_COLUMN_HELP } from './columnHelp';

/** "-" (nothing to compare) and zero differences, shown faintly. */
const Faint = styled.span`
  opacity: 0.4;
`;

const Signed = styled.span<{ $up: boolean }>`
  font-weight: 600;
  color: ${({ $up }) => ($up ? '#2e9d57' : '#d9534f')};
`;

const Changed = styled.span`
  font-weight: 600;
  color: ${({ theme }) => theme.changedBorder};
`;

/** +5 / -3 for numbers; anything else as is. */
export const signedText = (value: CellValue) =>
  typeof value === 'number' && value > 0 ? `+${value}` : String(display(value));

const TRUE_WORDS = ['1', 'on', 'true', 'yes', 'y'];
const FALSE_WORDS = ['0', 'off', 'false', 'no', 'n'];

/** Search for a true/false cell: on/off, 1/0, true/false, yes/no (or any part of the shown words). */
export function matchesBoolean(value: boolean | null, query: string, shown: [string, string]): boolean {
  const q = query.toLowerCase();
  if (value === null) return q === '-';
  if (TRUE_WORDS.includes(q)) return value;
  if (FALSE_WORDS.includes(q)) return !value;
  return (value ? shown[0] : shown[1]).toLowerCase().includes(q);
}

/** Search for a number: "5", "+5" and "-3" match the value; other text matches the shown text. */
function matchesSigned(value: CellValue, query: string): boolean {
  if (value === null) return query === '-';
  const q = query.replace(/^\+/, '');
  if (typeof value === 'number' && /^-?\d+(\.\d+)?$/.test(q)) return String(value).includes(q);
  return signedText(value).toLowerCase().includes(query.toLowerCase());
}

/** "Old value" column: the value in the previously opened save of the same game. */
export function oldColumn<Row>(label: string, get: (row: Row) => CellValue, width: string, boolean = false): Column<Row> {
  return {
    key: 'old',
    label,
    width,
    align: boolean ? 'center' : 'right',
    title: OLD_COLUMN_HELP,
    placeholder: boolean ? 'on / off' : 'Search',
    value: get,
    matches: boolean ? (row, q) => matchesBoolean(get(row) as boolean | null, q, ['ON', 'OFF']) : undefined,
    render: (row) => {
      const value = get(row);
      if (value === null) return <Faint title="No previous save of this game">-</Faint>;
      if (typeof value === 'boolean') return value ? 'ON' : <Faint>OFF</Faint>;
      return <Truncate title={String(value)}>{String(value)}</Truncate>;
    },
  };
}

/**
 * "GAP" column: how the file differs from the previous save. Numbers show as
 * +5 (green) / -3 (red) and 0 faintly; true means "changed" (switches).
 */
export function gapColumn<Row>(get: (row: Row) => CellValue, width: string, boolean = false): Column<Row> {
  return {
    key: 'gap',
    label: 'GAP',
    width,
    align: boolean ? 'center' : 'right',
    title: GAP_COLUMN_HELP,
    placeholder: boolean ? 'changed' : '+5, -3…',
    value: get,
    matches: boolean
      ? (row, q) => matchesBoolean(get(row) as boolean | null, q.toLowerCase() === 'same' ? 'no' : q, ['changed', 'same'])
      : (row, q) => matchesSigned(get(row), q),
    render: (row) => {
      const value = get(row);
      if (value === null) return <Faint title="No previous save of this game">-</Faint>;
      if (typeof value === 'boolean') return value ? <Changed>changed</Changed> : <Faint>same</Faint>;
      if (typeof value === 'number') return value === 0 ? <Faint>0</Faint> : <Signed $up={value > 0}>{signedText(value)}</Signed>;
      return value === '' ? <Faint>same</Faint> : <Truncate title={value}>{value}</Truncate>;
    },
  };
}

const EditorWrap = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
`;

const RevertStyled = styled.button<{ $hidden: boolean }>`
  all: unset;
  width: 18px;
  text-align: center;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  border-radius: 4px;
  color: ${({ theme }) => theme.changedBorder};
  visibility: ${({ $hidden }) => ($hidden ? 'hidden' : 'visible')};
  &:hover {
    background-color: ${({ theme }) => theme.hoverBackground};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.primaryColor};
  }
`;

interface EditorCellProps {
  children: React.ReactNode;
  /** Present when the value was edited: puts it back to the value in the file. */
  onRevert?: () => void;
  /** The value in the file, for the tooltip. */
  original?: string;
  label: string;
}

/**
 * An editor (input, checkbox) with an undo button (↺) next to it while the
 * value differs from the file. The button's space is kept when hidden, so the
 * editor doesn't move.
 */
export const EditorCell: React.FC<EditorCellProps> = ({ children, onRevert, original, label }) => (
  <EditorWrap>
    {children}
    <RevertStyled
      type="button"
      $hidden={!onRevert}
      tabIndex={onRevert ? 0 : -1}
      aria-hidden={!onRevert}
      aria-label={`Undo the change to ${label}`}
      title={original !== undefined ? `Undo: back to ${original}, as in the file` : 'Undo: back to the value in the file'}
      onClick={onRevert}
    >
      ↺
    </RevertStyled>
  </EditorWrap>
);
