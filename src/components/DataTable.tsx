import { KeyboardEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import { useRemembered } from '../hooks/useRemembered';
import styled from 'styled-components';
import { useInView } from 'react-intersection-observer';
import {
  ClearSearchButton,
  SearchField,
  SearchInput,
  Table,
  TableCell,
  TableContainer,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Truncate,
} from '../styles/ItemsContentStyles';

/** A sortable/searchable cell value; null is shown as "-" (e.g. no previous save to compare). */
export type CellValue = string | number | boolean | null;

export type CellAlign = 'left' | 'center' | 'right';

export interface Column<Row> {
  key: string;
  label: string;
  width: string;
  /** Text alignment of the column (default center): names left, numbers right. */
  align?: CellAlign;
  /** Tooltip on the header explaining the column. */
  title?: string;
  placeholder?: string;
  value: (row: Row) => CellValue;
  /** Custom cell content (inputs etc.); defaults to the value. */
  render?: (row: Row, index: number, visibleRows: Row[]) => ReactNode;
  /** Custom search; defaults to "value contains query" (case-insensitive). */
  matches?: (row: Row, query: string) => boolean;
}

/** A toggle above the table that keeps only some rows (e.g. "Owned only"). */
export interface QuickFilter<Row> {
  key: string;
  label: string;
  title?: string;
  test: (row: Row) => boolean;
  /** Greyed out, e.g. "Different from old save" with no previous save open. */
  disabled?: boolean;
}

interface DataTableProps<Row> {
  /** Unique per tab: keeps its searches, filters and sorting when switching tabs. */
  stateKey: string;
  rows: Row[];
  columns: Column<Row>[];
  rowKey: (row: Row) => string | number;
  initialSort?: { key: string; direction: 'asc' | 'desc' };
  filters?: QuickFilter<Row>[];
  /** What a row is, for the counter: "items", "switches"... */
  itemName?: string;
  /** Rows edited since the file was opened get a marker. */
  rowChanged?: (row: Row) => boolean;
}

type SortDirection = 'asc' | 'desc';

const PAGE_SIZE = 500;

/** Label + sort arrow on one line above the search box; cut with "…" if the column is narrow. */
const HeaderButton = styled.button<{ $align: CellAlign }>`
  all: unset;
  display: block;
  box-sizing: border-box;
  width: 100%;
  margin-bottom: 4px;
  text-align: ${({ $align }) => $align};
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.primaryColor};
    border-radius: 2px;
  }
`;

const SortArrow = styled.span<{ $active: boolean }>`
  display: inline-block;
  width: 1em;
  margin-left: 2px;
  color: ${({ theme, $active }) => ($active ? theme.primaryColor : theme.borderColor)};
`;

const Toolbar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
`;

const FilterChip = styled.button<{ $on: boolean }>`
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 12px;
  cursor: pointer;
  border: 1px solid ${({ theme, $on }) => ($on ? theme.selectedBackground : theme.borderColor)};
  background-color: ${({ theme, $on }) => ($on ? theme.selectedBackground : 'transparent')};
  color: ${({ theme, $on }) => ($on ? theme.selectedColor : theme.color)};
  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.selectedBackground};
  }
  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.primaryColor};
    outline-offset: 1px;
  }
`;

const Count = styled.span`
  margin-left: auto;
  opacity: 0.75;
  white-space: nowrap;
`;

const EmptyRow = styled.td`
  padding: 24px 8px;
  text-align: center;
  opacity: 0.7;
`;

export const display = (value: CellValue): ReactNode =>
  value === null ? '-' : typeof value === 'boolean' ? (value ? '1' : '0') : value;

/**
 * Keyboard moves between the editors of one column: Enter / Shift+Enter go to
 * the next / previous row; ↑ / ↓ too, except in number inputs, where they
 * still step the value.
 */
function moveBetweenRows(event: KeyboardEvent<HTMLTableSectionElement>) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || event.altKey || event.ctrlKey || event.metaKey) return;
  let step = 0;
  if (event.key === 'Enter') step = event.shiftKey ? -1 : 1;
  else if (input.type !== 'number' && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) step = event.key === 'ArrowDown' ? 1 : -1;
  if (!step) return;

  const cell = input.closest('td');
  let row = cell?.parentElement as HTMLTableRowElement | null;
  if (!cell || !row) return;
  event.preventDefault();
  while ((row = (step > 0 ? row.nextElementSibling : row.previousElementSibling) as HTMLTableRowElement | null)) {
    const next = row.cells[cell.cellIndex]?.querySelector('input');
    if (next) {
      next.focus();
      if (next.type !== 'checkbox') next.select();
      return;
    }
  }
}

/** null sorts first, numbers numerically, everything else as text. */
function compare(a: CellValue, b: CellValue): number {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

function DataTable<Row>({
  stateKey,
  rows,
  columns,
  rowKey,
  initialSort,
  filters = [],
  itemName = 'rows',
  rowChanged,
}: DataTableProps<Row>) {
  const [queries, setQueries] = useRemembered<Record<string, string>>(`${stateKey}.queries`, {});
  const [activeFilters, setActiveFilters] = useRemembered<string[]>(`${stateKey}.filters`, []);
  const [sort, setSort] = useRemembered<{ key: string; direction: SortDirection }>(
    `${stateKey}.sort`,
    initialSort ?? { key: columns[0].key, direction: 'asc' },
  );
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const { ref, inView } = useInView({ threshold: 0.1, rootMargin: '100px' });
  useEffect(() => {
    if (inView) setVisibleCount((count) => count + PAGE_SIZE);
  }, [inView]);

  const sortedRows = useMemo(() => {
    const active = columns.filter((column) => queries[column.key]);
    const toggles = filters.filter((filter) => !filter.disabled && activeFilters.includes(filter.key));
    const filtered = rows.filter(
      (row) =>
        toggles.every((filter) => filter.test(row)) &&
        active.every((column) => {
          const query = queries[column.key].trim();
          return column.matches
            ? column.matches(row, query)
            : String(display(column.value(row))).toLowerCase().includes(query.toLowerCase());
        }),
    );
    const sortColumn = columns.find((column) => column.key === sort.key) ?? columns[0];
    const sign = sort.direction === 'asc' ? 1 : -1;
    return filtered.sort((a, b) => sign * compare(sortColumn.value(a), sortColumn.value(b)));
  }, [rows, columns, queries, filters, activeFilters, sort]);

  const onSort = (key: string) =>
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' },
    );

  const toggleFilter = (key: string) =>
    setActiveFilters((current) => (current.includes(key) ? current.filter((k) => k !== key) : [...current, key]));

  const visibleRows = sortedRows.slice(0, visibleCount);
  const narrowed = sortedRows.length !== rows.length;

  return (
    <>
      <Toolbar>
        {filters.map((filter) => {
          const on = !filter.disabled && activeFilters.includes(filter.key);
          return (
            <FilterChip
              key={filter.key}
              type="button"
              $on={on}
              aria-pressed={on}
              disabled={filter.disabled}
              title={filter.title}
              onClick={() => toggleFilter(filter.key)}
            >
              {on ? '✓ ' : ''}
              {filter.label}
            </FilterChip>
          );
        })}
        <Count aria-live="polite">
          {narrowed
            ? `Showing ${sortedRows.length.toLocaleString()} of ${rows.length.toLocaleString()} ${itemName}`
            : `${rows.length.toLocaleString()} ${itemName}`}
        </Count>
      </Toolbar>
      <TableContainer>
        <Table>
          <TableHeader>
            <tr>
              {columns.map((column) => {
                const active = sort.key === column.key;
                const query = queries[column.key] ?? '';
                const align = column.align ?? 'center';
                return (
                  <TableHeaderCell key={column.key} width={column.width} title={column.title}>
                    <HeaderButton
                      $align={align}
                      onClick={() => onSort(column.key)}
                      aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      {column.label}
                      <SortArrow $active={active} aria-hidden>
                        {active ? (sort.direction === 'asc' ? '▲' : '▼') : '↕'}
                      </SortArrow>
                    </HeaderButton>
                    <SearchField>
                      <SearchInput
                        type="text"
                        placeholder={column.placeholder ?? 'Search'}
                        aria-label={`Search ${column.label}`}
                        value={query}
                        $active={query !== ''}
                        title={query ? `Filtering ${column.label}: "${query}"` : undefined}
                        onChange={(e) => setQueries((q) => ({ ...q, [column.key]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') setQueries((q) => ({ ...q, [column.key]: '' }));
                        }}
                      />
                      {query && (
                        <ClearSearchButton
                          type="button"
                          aria-label={`Clear the ${column.label} search`}
                          title="Clear (Esc)"
                          onClick={() => setQueries((q) => ({ ...q, [column.key]: '' }))}
                        >
                          ✕
                        </ClearSearchButton>
                      )}
                    </SearchField>
                  </TableHeaderCell>
                );
              })}
            </tr>
          </TableHeader>
          <tbody onKeyDown={moveBetweenRows}>
            {visibleRows.length === 0 && (
              <tr>
                <EmptyRow colSpan={columns.length}>
                  {rows.length === 0 ? `No ${itemName} in this save.` : 'No matches. Clear a search or filter to see more.'}
                </EmptyRow>
              </tr>
            )}
            {visibleRows.map((row, index) => (
              <TableRow
                key={rowKey(row)}
                ref={index === visibleRows.length - 1 ? ref : null}
                $changed={rowChanged?.(row) ?? false}
              >
                {columns.map((column) => (
                  <TableCell key={column.key} $align={column.align ?? 'center'}>
                    {column.render ? (
                      column.render(row, index, visibleRows)
                    ) : (
                      <Truncate title={String(display(column.value(row)))}>{display(column.value(row))}</Truncate>
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </tbody>
        </Table>
      </TableContainer>
    </>
  );
}

export default DataTable;
