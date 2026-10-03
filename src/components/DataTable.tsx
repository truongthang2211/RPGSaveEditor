import { ReactNode, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { useInView } from 'react-intersection-observer';
import {
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

export interface Column<Row> {
  key: string;
  label: string;
  width: string;
  /** Tooltip on the header explaining the column. */
  title?: string;
  placeholder?: string;
  value: (row: Row) => CellValue;
  /** Custom cell content (inputs etc.); defaults to the value. */
  render?: (row: Row, index: number, visibleRows: Row[]) => ReactNode;
  /** Custom search; defaults to "value contains query" (case-insensitive). */
  matches?: (row: Row, query: string) => boolean;
}

interface DataTableProps<Row> {
  rows: Row[];
  columns: Column<Row>[];
  rowKey: (row: Row) => string | number;
  initialSort?: { key: string; direction: 'asc' | 'desc' };
}

type SortDirection = 'asc' | 'desc';

const PAGE_SIZE = 500;

/** Label + sort arrow on one line above the search box; cut with "…" if the column is narrow. */
const HeaderButton = styled.button`
  all: unset;
  display: block;
  margin-bottom: 4px;
  text-align: center;
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

export const display = (value: CellValue): ReactNode =>
  value === null ? '-' : typeof value === 'boolean' ? (value ? '1' : '0') : value;

/** null sorts first, numbers numerically, everything else as text. */
function compare(a: CellValue, b: CellValue): number {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

function DataTable<Row>({ rows, columns, rowKey, initialSort }: DataTableProps<Row>) {
  const [queries, setQueries] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ key: string; direction: SortDirection }>(
    initialSort ?? { key: columns[0].key, direction: 'asc' },
  );
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const { ref, inView } = useInView({ threshold: 0.1, rootMargin: '100px' });
  useEffect(() => {
    if (inView) setVisibleCount((count) => count + PAGE_SIZE);
  }, [inView]);

  const sortedRows = useMemo(() => {
    const active = columns.filter((column) => queries[column.key]);
    const filtered = rows.filter((row) =>
      active.every((column) => {
        const query = queries[column.key];
        return column.matches
          ? column.matches(row, query)
          : String(display(column.value(row))).toLowerCase().includes(query.toLowerCase());
      }),
    );
    const sortColumn = columns.find((column) => column.key === sort.key) ?? columns[0];
    const sign = sort.direction === 'asc' ? 1 : -1;
    return filtered.sort((a, b) => sign * compare(sortColumn.value(a), sortColumn.value(b)));
  }, [rows, columns, queries, sort]);

  const onSort = (key: string) =>
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' },
    );

  const visibleRows = sortedRows.slice(0, visibleCount);

  return (
    <TableContainer>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => {
              const active = sort.key === column.key;
              return (
                <TableHeaderCell key={column.key} width={column.width} title={column.title}>
                  <HeaderButton
                    onClick={() => onSort(column.key)}
                    aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    {column.label}
                    <SortArrow $active={active} aria-hidden>
                      {active ? (sort.direction === 'asc' ? '▲' : '▼') : '↕'}
                    </SortArrow>
                  </HeaderButton>
                  <SearchInput
                    type="text"
                    placeholder={column.placeholder ?? 'Search'}
                    aria-label={`Search ${column.label}`}
                    value={queries[column.key] ?? ''}
                    onChange={(e) => setQueries((q) => ({ ...q, [column.key]: e.target.value }))}
                  />
                </TableHeaderCell>
              );
            })}
          </TableRow>
        </TableHeader>
        <tbody>
          {visibleRows.map((row, index) => (
            <TableRow key={rowKey(row)} ref={index === visibleRows.length - 1 ? ref : null}>
              {columns.map((column) => (
                <TableCell key={column.key}>
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
  );
}

export default DataTable;
