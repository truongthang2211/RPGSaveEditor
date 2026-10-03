import React, { useCallback, useMemo } from 'react';
import { QuantityInput, Truncate } from '../styles/ItemsContentStyles';
import Tooltip from './Tooltip';
import DataTable, { Column } from './DataTable';
import { useSaveEditor } from '../hooks/useSaveEditor';
import { InventoryKind } from '../formats';
import { CHANGED_HELP, GAP_COLUMN_HELP, OLD_COLUMN_HELP } from './columnHelp';

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
      width: '30%',
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
      width: '20%',
      title: CHANGED_HELP,
      value: (r) => r.quantity,
      render: (r) => (
        <QuantityInput
          type="number"
          min="0"
          value={r.quantity}
          $changed={r.quantity !== r.origin}
          aria-label={`${r.name} quantity`}
          onChange={(e) => onQuantityChange(r.id, Number(e.target.value))}
        />
      ),
    },
    { key: 'old', label: 'Old Qty', width: '10%', title: OLD_COLUMN_HELP, value: (r) => r.old },
    { key: 'gap', label: 'GAP', width: '10%', title: GAP_COLUMN_HELP, value: (r) => r.gap },
  ], [onQuantityChange]);

  return <DataTable rows={rows} columns={columns} rowKey={(r) => r.id} />;
};

export default InventoryContent;
