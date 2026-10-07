import React, { useCallback, useMemo } from 'react';
import { QuantityInput, Truncate } from '../styles/ItemsContentStyles';
import Tooltip from './Tooltip';
import DataTable, { Column, QuickFilter } from './DataTable';
import { EditorCell, gapColumn, oldColumn } from './tableCells';
import { useSaveEditor } from '../hooks/useSaveEditor';
import { InventoryKind } from '../formats';
import { CHANGED_HELP } from './columnHelp';

interface Row {
  id: number;
  name: string;
  description: string;
  quantity: number;
  /** Quantity when the file was opened. */
  origin: number;
  /** Quantity in the previously opened save of this game; null when there is none. */
  old: number | null;
  gap: number | null;
}

interface InventoryContentProps {
  kind: InventoryKind;
  /** Name shown for entries missing from the database, e.g. "Weapon" -> "Weapon#12". */
  label: string;
}

/** Items, weapons or armors held by the party. */
const InventoryContent: React.FC<InventoryContentProps> = ({ kind, label }) => {
  const { editor, save, origin, old, database, update } = useSaveEditor();

  const rows = useMemo((): Row[] => {
    if (!editor || !save) return [];
    const current = editor.getInventory(save, kind);
    const loaded = origin ? editor.getInventory(origin, kind) : {};
    const previous = old ? editor.getInventory(old, kind) : null;

    const row = (id: number, name: string, description = ''): Row => {
      const originQty = loaded[id] ?? 0;
      const oldQty = previous ? previous[id] ?? 0 : null;
      return {
        id,
        name,
        description,
        quantity: current[id] ?? 0,
        origin: originQty,
        old: oldQty,
        gap: oldQty === null ? null : originQty - oldQty,
      };
    };

    const entries = database?.[kind];
    if (!entries?.length) {
      return Object.keys(current).map((key) => row(Number(key), `${label}#${key}`));
    }
    return entries
      .filter((entry): entry is NonNullable<typeof entry> => !!entry && !!entry.name?.trim())
      .map((entry) => row(entry.id, entry.name, entry.description));
  }, [editor, save, origin, old, database, kind, label]);

  const onQuantityChange = useCallback(
    (id: number, value: number) => update((ed, s) => ed.setInventoryCount(s, kind, id, value)),
    [update, kind],
  );

  const columns = useMemo((): Column<Row>[] => [
    { key: 'id', label: 'ID', width: '7%', placeholder: '#', value: (r) => r.id },
    {
      key: 'name',
      label: 'Name',
      width: '43%',
      align: 'left',
      value: (r) => r.name,
      render: (r, index, visible) => (
        <Tooltip text={r.description} placement={index === visible.length - 1 ? 'top' : 'right'}>
          <Truncate title={r.name}>{r.name}</Truncate>
        </Tooltip>
      ),
    },
    {
      key: 'quantity',
      label: 'Quantity',
      width: '18%',
      title: CHANGED_HELP,
      value: (r) => r.quantity,
      render: (r) => (
        <EditorCell
          label={`${r.name} quantity`}
          original={String(r.origin)}
          onRevert={r.quantity !== r.origin ? () => onQuantityChange(r.id, r.origin) : undefined}
        >
          <QuantityInput
            type="number"
            min="0"
            value={r.quantity}
            $changed={r.quantity !== r.origin}
            aria-label={`${r.name} quantity`}
            onChange={(e) => onQuantityChange(r.id, Number(e.target.value))}
          />
        </EditorCell>
      ),
    },
    oldColumn('Old Qty', (r) => r.old, '16%'),
    gapColumn((r) => r.gap, '16%'),
  ], [onQuantityChange]);

  const filters = useMemo((): QuickFilter<Row>[] => [
    { key: 'owned', label: 'Owned only', title: 'Quantity above 0', test: (r) => r.quantity > 0 },
    { key: 'changed', label: 'Changed only', title: 'Edited since the file was opened', test: (r) => r.quantity !== r.origin },
    {
      key: 'differs',
      label: 'Different from old save',
      title: old ? 'Quantity differs from the previously opened save of this game' : 'Open an earlier save of this game first',
      test: (r) => r.gap !== null && r.gap !== 0,
      disabled: !old,
    },
  ], [old]);

  return (
    <DataTable
      stateKey={kind}
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      filters={filters}
      itemName={kind}
      rowChanged={(r) => r.quantity !== r.origin}
    />
  );
};

export default InventoryContent;
