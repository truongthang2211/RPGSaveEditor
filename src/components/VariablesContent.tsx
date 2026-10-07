import React, { useCallback, useMemo } from 'react';
import ValueInput from './ValueInput';
import { getDifferences } from '../utils/textUtils';
import DataTable, { CellValue, Column, QuickFilter } from './DataTable';
import { EditorCell, gapColumn, oldColumn } from './tableCells';
import { useSaveEditor } from '../hooks/useSaveEditor';
import { CHANGED_HELP } from './columnHelp';

type VariableValue = number | string | boolean | null;

interface Row {
  id: number;
  name: string;
  value: VariableValue;
  /** Value when the file was opened. */
  origin: VariableValue;
  /** Value in the previously opened save of this game; null when there is none. */
  old: CellValue;
  gap: CellValue;
}

const asCell = (value: VariableValue): CellValue => value ?? 0;

/** Numeric difference, or the differing characters for text values. */
function gapOf(origin: VariableValue, old: VariableValue): CellValue {
  const a = asCell(origin);
  const b = asCell(old);
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return getDifferences(String(a), String(b));
}

const VariablesContent: React.FC = () => {
  const { editor, save, origin, old, database, update } = useSaveEditor();

  const rows = useMemo((): Row[] => {
    if (!editor || !save) return [];
    const current = editor.getVariables(save);
    const loaded = origin ? editor.getVariables(origin) : {};
    const previous = old ? editor.getVariables(old) : null;

    const row = (id: number, name: string): Row => {
      const originValue = loaded[id] ?? null;
      const oldValue = previous ? previous[id] ?? null : undefined;
      return {
        id,
        name,
        value: current[id] ?? null,
        origin: originValue,
        old: oldValue === undefined ? null : asCell(oldValue),
        gap: oldValue === undefined ? null : gapOf(originValue, oldValue),
      };
    };

    // Slot 0 is never used by RPG Maker. With a database, unnamed variables are skipped.
    const names = database?.system?.variables;
    if (names?.length) {
      return names.flatMap((name, id) => (id > 0 && name ? [row(id, name)] : []));
    }
    return Object.keys(current)
      .map(Number)
      .filter((id) => id > 0)
      .map((id) => row(id, `Variable#${id}`));
  }, [editor, save, origin, old, database]);

  const onCommit = useCallback(
    (id: number, value: number | string) => update((ed, s) => ed.setVariable(s, id, value)),
    [update],
  );

  const columns = useMemo((): Column<Row>[] => [
    { key: 'id', label: 'ID', width: '7%', placeholder: '#', value: (r) => r.id },
    { key: 'name', label: 'Name', width: '41%', align: 'left', value: (r) => r.name },
    {
      key: 'value',
      label: 'Value',
      width: '24%',
      title: CHANGED_HELP,
      value: (r) => asCell(r.value),
      render: (r) => {
        const changed = asCell(r.value) !== asCell(r.origin);
        // Only numbers and text can be put back (others aren't edited here).
        const original = r.origin === null ? 0 : r.origin;
        const revertable = changed && (typeof original === 'number' || typeof original === 'string');
        return (
          <EditorCell
            label={`${r.name} value`}
            original={String(original)}
            onRevert={revertable ? () => onCommit(r.id, original as number | string) : undefined}
          >
            <ValueInput
              value={r.value === null || typeof r.value === 'boolean' ? String(r.value ?? 0) : r.value}
              mode={typeof r.value === 'string' ? 'text' : 'number'}
              changed={changed}
              label={`${r.name} value`}
              onCommit={(value) => onCommit(r.id, value)}
            />
          </EditorCell>
        );
      },
    },
    oldColumn('Old Value', (r) => r.old, '14%'),
    gapColumn((r) => r.gap, '14%'),
  ], [onCommit]);

  const filters = useMemo((): QuickFilter<Row>[] => [
    { key: 'set', label: 'Non-zero only', title: 'Hide variables that are 0 or empty', test: (r) => asCell(r.value) !== 0 && r.value !== '' },
    { key: 'changed', label: 'Changed only', title: 'Edited since the file was opened', test: (r) => asCell(r.value) !== asCell(r.origin) },
    {
      key: 'differs',
      label: 'Different from old save',
      title: old ? 'Differs from the previously opened save of this game' : 'Open an earlier save of this game first',
      test: (r) => r.old !== null && asCell(r.origin) !== r.old,
      disabled: !old,
    },
  ], [old]);

  return (
    <DataTable
      stateKey="variables"
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      filters={filters}
      itemName="variables"
      rowChanged={(r) => asCell(r.value) !== asCell(r.origin)}
    />
  );
};

export default VariablesContent;
