import React, { useCallback, useMemo } from 'react';
import { SwitchInput } from '../styles/ItemsContentStyles';
import DataTable, { Column } from './DataTable';
import { useSaveEditor } from '../hooks/useSaveEditor';
import { CHANGED_HELP, GAP_COLUMN_HELP, OLD_COLUMN_HELP } from './columnHelp';

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
    { key: 'name', label: 'Name', width: '30%', value: (r) => r.name },
    {
      key: 'state',
      label: 'Value',
      width: '20%',
      title: CHANGED_HELP,
      placeholder: '0 or 1',
      value: (r) => r.state,
      matches: (r, q) => q === '' || (q === '1' ? r.state : q === '0' ? !r.state : false),
      render: (r) => (
        <SwitchInput
          type="checkbox"
          checked={r.state}
          $changed={r.state !== r.origin}
          aria-label={`${r.name}`}
          onChange={() => onToggle(r.id, !r.state)}
        />
      ),
    },
    { key: 'old', label: 'Old Value', width: '10%', title: OLD_COLUMN_HELP, value: (r) => r.old },
    { key: 'gap', label: 'GAP', width: '10%', title: GAP_COLUMN_HELP, value: (r) => r.gap },
  ], [onToggle]);

  return <DataTable stateKey="switches" rows={rows} columns={columns} rowKey={(r) => r.id} />;
};

export default SwitchesContent;
