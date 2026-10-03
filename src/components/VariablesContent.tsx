import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { QuantityInput } from '../styles/ItemsContentStyles';
import { getDifferences } from '../utils/textUtils';
import DataTable, { CellValue, Column } from './DataTable';
import { useSaveEditor } from '../hooks/useSaveEditor';
import { CHANGED_HELP, GAP_COLUMN_HELP, OLD_COLUMN_HELP } from './columnHelp';

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

const NUMBER = /^-?\d+(\.\d+)?$/;

const asCell = (value: VariableValue): CellValue => value ?? 0;

/** Numeric difference, or the differing characters for text values. */
function gapOf(origin: VariableValue, old: VariableValue): CellValue {
  const a = asCell(origin);
  const b = asCell(old);
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return getDifferences(String(a), String(b));
}

/**
 * Keeps a variable's type: numeric variables only take valid numbers (an empty
 * or partial entry isn't written and is restored on blur), text variables stay
 * text even when they look like numbers.
 */
const VariableInput: React.FC<{
  value: VariableValue;
  changed: boolean;
  label: string;
  onCommit: (value: number | string) => void;
}> = ({ value, changed, label, onCommit }) => {
  const isText = typeof value === 'string';
  const shown = value === null || typeof value === 'boolean' ? String(value ?? 0) : String(value);
  const [draft, setDraft] = useState(shown);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(shown);
  }, [shown, editing]);

  const invalid = !isText && !NUMBER.test(draft.trim());

  return (
    <QuantityInput
      type="text"
      inputMode={isText ? 'text' : 'numeric'}
      value={draft}
      $changed={changed}
      aria-label={label}
      aria-invalid={invalid}
      title={invalid ? 'Enter a number' : undefined}
      onFocus={() => setEditing(true)}
      onBlur={() => {
        setEditing(false);
        setDraft(shown);
      }}
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        if (isText) onCommit(text);
        else if (NUMBER.test(text.trim())) onCommit(Number(text));
      }}
    />
  );
};

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
    { key: 'name', label: 'Name', width: '30%', value: (r) => r.name },
    {
      key: 'value',
      label: 'Value',
      width: '20%',
      title: CHANGED_HELP,
      value: (r) => asCell(r.value),
      render: (r) => (
        <VariableInput
          value={r.value}
          changed={asCell(r.value) !== asCell(r.origin)}
          label={`${r.name} value`}
          onCommit={(value) => onCommit(r.id, value)}
        />
      ),
    },
    { key: 'old', label: 'Old Value', width: '10%', title: OLD_COLUMN_HELP, value: (r) => r.old },
    { key: 'gap', label: 'GAP', width: '10%', title: GAP_COLUMN_HELP, value: (r) => r.gap },
  ], [onCommit]);

  return <DataTable rows={rows} columns={columns} rowKey={(r) => r.id} />;
};

export default VariablesContent;
