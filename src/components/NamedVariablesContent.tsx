import React, { useCallback, useMemo } from 'react';
import ValueInput from './ValueInput';
import { SwitchInput } from '../styles/ItemsContentStyles';
import { getDifferences } from '../utils/textUtils';
import DataTable, { CellValue, Column, display } from './DataTable';
import { useSaveEditor } from '../hooks/useSaveEditor';
import { TreeNode, TreeValue } from '../formats';
import { CHANGED_HELP, GAP_COLUMN_HELP, OLD_COLUMN_HELP } from './columnHelp';

interface Row {
  name: string;
  type: string;
  node: TreeNode;
  value: TreeValue;
  /** Value when the file was opened. */
  origin: TreeValue | undefined;
  /** Value in the previously opened save of this game; null when there is none. */
  old: CellValue;
  gap: CellValue;
}

const asCell = (value: TreeValue | undefined): CellValue => (value === undefined ? null : value);

/** Numeric difference, "changed" for true/false, or the differing characters for text. */
function gapOf(value: TreeValue | undefined, old: TreeValue | undefined): CellValue {
  if (value === undefined || old === undefined) return null;
  if (typeof value === 'number' && typeof old === 'number') return value - old;
  if (typeof value === 'boolean' || typeof old === 'boolean') return value !== old;
  return getDifferences(String(value ?? ''), String(old ?? ''));
}

/** Variables known by name (Ren'Py store variables), edited through the format's tree. */
const NamedVariablesContent: React.FC = () => {
  const { format, tree, save, origin, old, updateSave } = useSaveEditor();

  const rows = useMemo((): Row[] => {
    if (!format?.namedVariables || !tree || !save) return [];
    const byName = (s: unknown) => new Map(format.namedVariables!(s).map((v) => [v.name, v.node]));
    const loaded = origin ? byName(origin) : null;
    const previous = old ? byName(old) : null;

    return format.namedVariables(save).map(({ name, node }) => {
      const originNode = loaded?.get(name);
      const originValue = originNode ? tree.valueOf(origin, originNode) : undefined;
      const oldNode = previous?.get(name);
      const oldValue = oldNode ? tree.valueOf(old, oldNode) : undefined;
      return {
        name,
        type: node.type,
        node,
        value: node.value ?? null,
        origin: originValue,
        old: previous ? asCell(oldValue) : null,
        gap: previous ? gapOf(originValue, oldValue) : null,
      };
    });
  }, [format, tree, save, origin, old]);

  const onCommit = useCallback(
    (node: TreeNode, value: TreeValue) => updateSave((s) => tree!.setValue(s, node, value)),
    [tree, updateSave],
  );

  const columns = useMemo((): Column<Row>[] => [
    { key: 'name', label: 'Name', width: '30%', value: (r) => r.name },
    { key: 'type', label: 'Type', width: '8%', value: (r) => r.type },
    {
      key: 'value',
      label: 'Value',
      width: '24%',
      title: CHANGED_HELP,
      value: (r) => asCell(r.value),
      render: (r) => {
        const changed = r.origin !== undefined && r.value !== r.origin;
        if (r.node.editable === 'boolean') {
          return (
            <SwitchInput
              type="checkbox"
              checked={r.value === true}
              $changed={changed}
              aria-label={`${r.name} value`}
              onChange={() => onCommit(r.node, !r.value)}
            />
          );
        }
        if (r.node.editable) {
          return (
            <ValueInput
              value={r.value as string | number}
              mode={r.node.editable === 'number' ? 'number' : 'text'}
              integer={r.node.integer}
              changed={changed}
              label={`${r.name} value`}
              onCommit={(value) => onCommit(r.node, value)}
            />
          );
        }
        return <span title="Read-only">{r.value === null ? 'None' : String(display(r.value))}</span>;
      },
    },
    { key: 'old', label: 'Old Value', width: '12%', title: OLD_COLUMN_HELP, value: (r) => r.old },
    { key: 'gap', label: 'GAP', width: '12%', title: GAP_COLUMN_HELP, value: (r) => r.gap },
  ], [onCommit]);

  return <DataTable stateKey="named-variables" rows={rows} columns={columns} rowKey={(r) => r.name} />;
};

export default NamedVariablesContent;
