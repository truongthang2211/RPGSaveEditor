import React, { useCallback, useMemo } from 'react';
import { SwitchInput } from '../styles/ItemsContentStyles';
import DataTable, { Column, QuickFilter } from './DataTable';
import { EditorCell, gapColumn, matchesBoolean, oldColumn } from './tableCells';
import { useSaveEditor } from '../hooks/useSaveEditor';
import { CHANGED_HELP } from './columnHelp';

interface Row {
  id: number;
  name: string;
  state: boolean;
  /** State when the file was opened. */
  origin: boolean;
  /** State in the previously opened save of this game; null when there is none. */
  old: boolean | null;
  /** Whether the state changed since that previous save; null when there is none. */
  gap: boolean | null;
}

const SwitchesContent: React.FC = () => {
  const { editor, save, origin, old, database, update } = useSaveEditor();

  const rows = useMemo((): Row[] => {
    if (!editor || !save) return [];
    const current = editor.getSwitches(save);
    const loaded = origin ? editor.getSwitches(origin) : [];
    const previous = old ? editor.getSwitches(old) : null;

    const row = (id: number, name: string): Row => {
      const originState = !!loaded[id];
      const oldState = previous ? !!previous[id] : null;
      return {
        id,
        name,
        state: !!current[id],
        origin: originState,
        old: oldState,
        gap: oldState === null ? null : originState !== oldState,
      };
    };

    // Slot 0 is never used by RPG Maker. With a database, unnamed switches are skipped.
    const names = database?.system?.switches;
    if (names?.length) {
      return names.flatMap((name, id) => (id > 0 && name ? [row(id, name)] : []));
    }
    return current.flatMap((_, id) => (id > 0 ? [row(id, `Switch#${id}`)] : []));
  }, [editor, save, origin, old, database]);

  const onToggle = useCallback(
    (id: number, value: boolean) => update((ed, s) => ed.setSwitch(s, id, value)),
    [update],
  );

  const columns = useMemo((): Column<Row>[] => [
    { key: 'id', label: 'ID', width: '7%', placeholder: '#', value: (r) => r.id },
    { key: 'name', label: 'Name', width: '51%', align: 'left', value: (r) => r.name },
    {
      key: 'state',
      label: 'Value',
      width: '14%',
      title: CHANGED_HELP,
      placeholder: 'on / off',
      value: (r) => r.state,
      matches: (r, q) => matchesBoolean(r.state, q, ['ON', 'OFF']),
      render: (r) => (
        <EditorCell
          label={r.name}
          original={r.origin ? 'ON' : 'OFF'}
          onRevert={r.state !== r.origin ? () => onToggle(r.id, r.origin) : undefined}
        >
          <SwitchInput
            type="checkbox"
            checked={r.state}
            $changed={r.state !== r.origin}
            aria-label={`${r.name}`}
            onChange={() => onToggle(r.id, !r.state)}
          />
        </EditorCell>
      ),
    },
    oldColumn('Old Value', (r) => r.old, '14%', true),
    gapColumn((r) => r.gap, '14%', true),
  ], [onToggle]);

  const filters = useMemo((): QuickFilter<Row>[] => [
    { key: 'on', label: 'ON only', test: (r) => r.state },
    { key: 'changed', label: 'Changed only', title: 'Edited since the file was opened', test: (r) => r.state !== r.origin },
    {
      key: 'differs',
      label: 'Different from old save',
      title: old ? 'Differs from the previously opened save of this game' : 'Open an earlier save of this game first',
      test: (r) => r.gap === true,
      disabled: !old,
    },
  ], [old]);

  return (
    <DataTable
      stateKey="switches"
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      filters={filters}
      itemName="switches"
      rowChanged={(r) => r.state !== r.origin}
    />
  );
};

export default SwitchesContent;
