import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { useSaveEditor } from '../hooks/useSaveEditor';
import { TreeNode, TreeValue } from '../formats';
import { SwitchInput } from '../styles/ItemsContentStyles';
import ValueInput from './ValueInput';
import { parseQuery } from './advanced/query';
import { CompareMode, refine, SearchResult, SearchSpec, TreeSearch } from './advanced/searchEngine';

/** Children shown per node before "Show more" (map data arrays can be huge). */
const PAGE_SIZE = 200;
/** Nodes searched per slice before yielding to the UI. */
const SEARCH_SLICE = 4_000;

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  color: ${({ theme }) => theme.color};
`;

const Notice = styled.div`
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  background-color: ${({ theme }) => theme.changedBackground};
  border: 1px solid ${({ theme }) => theme.changedBorder};
`;

const Toolbar = styled.form`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
`;

const SearchBox = styled.input`
  flex: 1;
  min-width: 260px;
  max-width: 460px;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid ${({ theme }) => theme.borderColor};
  background-color: ${({ theme }) => theme.inputBackground};
  color: ${({ theme }) => theme.inputTextColor};
`;

const Select = styled.select`
  padding: 5px 6px;
  border-radius: 6px;
  border: 1px solid ${({ theme }) => theme.borderColor};
  background-color: ${({ theme }) => theme.inputBackground};
  color: ${({ theme }) => theme.inputTextColor};
`;

const Check = styled.label`
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  white-space: nowrap;
`;

const Button = styled.button`
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid ${({ theme }) => theme.borderColor};
  background-color: ${({ theme }) => theme.itemBackground};
  color: ${({ theme }) => theme.color};
  cursor: pointer;
  &:hover:not(:disabled) {
    background-color: ${({ theme }) => theme.hoverBackground};
  }
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`;

const Chip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 4px 2px 10px;
  border-radius: 12px;
  font-size: 12px;
  border: 1px solid ${({ theme }) => theme.primaryColor};
`;

const ChipClose = styled.button`
  all: unset;
  cursor: pointer;
  padding: 0 6px;
`;

const Help = styled.div`
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  border: 1px solid ${({ theme }) => theme.borderColor};
  table {
    border-collapse: collapse;
  }
  td {
    padding: 2px 12px 2px 0;
    vertical-align: top;
  }
  code {
    font-family: Consolas, Menlo, monospace;
    font-weight: 600;
  }
`;

const Status = styled.div`
  font-size: 12px;
  opacity: 0.75;
`;

const ErrorText = styled.div`
  font-size: 13px;
  color: #d9534f;
`;

const Results = styled.ul`
  margin: 0;
  padding: 6px;
  max-height: 200px;
  overflow: auto;
  list-style: none;
  border: 1px solid ${({ theme }) => theme.borderColor};
  border-radius: 6px;
  font-size: 13px;
`;

const ResultItem = styled.li`
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  &:hover {
    background-color: ${({ theme }) => theme.hoverBackground};
  }
`;

const TreeBox = styled.div`
  border: 1px solid ${({ theme }) => theme.borderColor};
  border-radius: 8px;
  background-color: ${({ theme }) => theme.contentBackground};
  padding: 6px 0;
  font-size: 13px;
`;

const Row = styled.div<{ $depth: number; $highlight: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  padding: 1px 8px 1px ${({ $depth }) => 8 + $depth * 18}px;
  background-color: ${({ theme, $highlight }) => ($highlight ? theme.hoverBackground : 'transparent')};
  &:hover {
    background-color: ${({ theme }) => theme.hoverBackground};
  }
  &:hover .scope-button {
    visibility: visible;
  }
`;

const Toggle = styled.button`
  all: unset;
  width: 16px;
  text-align: center;
  cursor: pointer;
  opacity: 0.8;
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.primaryColor};
  }
`;

const ScopeButton = styled.button`
  all: unset;
  visibility: hidden;
  cursor: pointer;
  padding: 0 4px;
  opacity: 0.7;
  &:focus-visible {
    visibility: visible;
    outline: 2px solid ${({ theme }) => theme.primaryColor};
  }
`;

const Key = styled.span`
  font-family: Consolas, Menlo, monospace;
  font-weight: 600;
  white-space: nowrap;
`;

const Type = styled.span`
  padding: 0 6px;
  border-radius: 8px;
  font-size: 11px;
  white-space: nowrap;
  border: 1px solid ${({ theme }) => theme.borderColor};
  opacity: 0.85;
`;

const Muted = styled.span`
  opacity: 0.65;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const ValueEditor = styled(ValueInput)`
  width: 220px;
  text-align: left;
`;

const MoreButton = styled(Button)`
  margin: 2px 0;
  padding: 2px 10px;
  font-size: 12px;
`;

const formatValue = (value: TreeValue | undefined) =>
  value === null ? 'nil/null' : typeof value === 'string' ? JSON.stringify(value) : String(value);

const pathText = (chain: TreeNode[]) => chain.map((n) => n.key).join(' › ');

const COMPARE_LABELS: Record<CompareMode, string> = {
  none: 'No comparison',
  changed: 'Changed since previous save',
  increased: 'Increased',
  decreased: 'Decreased',
  unchanged: 'Unchanged',
};

const SYNTAX: [string, string][] = [
  ['gold', 'key, type or value contains "gold"'],
  ['"Lona"', 'key or value is exactly Lona'],
  ['/^@stat_/', 'regular expression'],
  ['key:@hp  type:Game_Party  value:99', 'look only at the key, type or value'],
  ['>1000  <=0  =99  !=0  100..200', 'compare numbers (range with ..)'],
  ['party.@gold   actors.**.@hp', 'path ending in these keys (* one level, ** any)'],
  ['old:120 =125', 'was 120 in the previous save, is 125 now'],
  ['key:@hp >500', 'combine terms: all must match'],
];

interface SearchState {
  results: SearchResult[];
  visited: number;
  running: boolean;
  hitLimit: boolean;
  /** "search" or "refine", for the status line. */
  mode: 'search' | 'refine';
}

const AdvancedContent: React.FC = () => {
  const { tree, save, origin, old, updateSave } = useSaveEditor();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pageSizes, setPageSizes] = useState<Record<string, number>>({});
  const [highlight, setHighlight] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [compare, setCompare] = useState<CompareMode>('none');
  const [editableOnly, setEditableOnly] = useState(false);
  const [scope, setScope] = useState<Pick<SearchResult, 'chain' | 'indices'> | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<SearchState | null>(null);
  const runner = useRef<{ search: TreeSearch; timer?: number } | null>(null);

  const stop = useCallback(() => {
    if (runner.current?.timer) window.clearTimeout(runner.current.timer);
    runner.current = null;
    setSearch((s) => (s ? { ...s, running: false } : s));
  }, []);

  useEffect(() => stop, [stop]);

  const toggle = useCallback((id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const setValue = useCallback(
    (node: TreeNode, value: TreeValue) => {
      if (!tree) return;
      updateSave((s) => tree.setValue(s, node, value));
    },
    [tree, updateSave],
  );

  const makeSpec = (): SearchSpec | null => {
    if (!tree || !save) return null;
    try {
      const terms = parseQuery(query.trim());
      setError(null);
      if (terms.length === 0 && compare === 'none' && !editableOnly) {
        setError('Type something to search, or pick a comparison.');
        return null;
      }
      if (compare !== 'none' && !old) {
        setError('No previous save to compare with: open an earlier save of this game first, then this one.');
        return null;
      }
      return { tree, save, old: compare !== 'none' || /\bold:/i.test(query) ? old : undefined, terms, compare, editableOnly, scope: scope ?? undefined };
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  };

  const runSearch = () => {
    stop();
    const spec = makeSpec();
    if (!spec) return;
    const treeSearch = new TreeSearch(spec);
    const tick = () => {
      if (!runner.current || runner.current.search !== treeSearch) return;
      const done = treeSearch.step(SEARCH_SLICE);
      setSearch({
        results: [...treeSearch.results],
        visited: treeSearch.visited,
        running: !done,
        hitLimit: treeSearch.hitResultLimit,
        mode: 'search',
      });
      if (!done) runner.current.timer = window.setTimeout(tick, 0);
      else runner.current = null;
    };
    runner.current = { search: treeSearch };
    tick();
  };

  const runRefine = () => {
    if (!search?.results.length) return;
    stop();
    const spec = makeSpec();
    if (!spec) return;
    const results = refine(spec, search.results);
    setSearch({ results, visited: search.results.length, running: false, hitLimit: false, mode: 'refine' });
  };

  const reveal = (result: Pick<SearchResult, 'chain' | 'indices'>) => {
    const ancestors = result.chain.slice(0, -1);
    setExpanded((current) => new Set([...current, ...ancestors.map((n) => n.id)]));
    setPageSizes((current) => {
      const next = { ...current };
      // Make sure each node on the path is within its parent's visible page.
      ancestors.forEach((parent, i) => {
        const needed = result.indices[i + 1] + 1;
        next[parent.id] = Math.max(next[parent.id] ?? PAGE_SIZE, Math.ceil(needed / PAGE_SIZE) * PAGE_SIZE);
      });
      return next;
    });
    setHighlight(result.chain[result.chain.length - 1].id);
  };

  useEffect(() => {
    if (!highlight) return;
    const frame = requestAnimationFrame(() =>
      document.querySelector(`[data-node-id="${CSS.escape(highlight)}"]`)?.scrollIntoView({ block: 'center' }),
    );
    return () => cancelAnimationFrame(frame);
  }, [highlight, expanded, pageSizes]);

  const roots = useMemo(() => (tree && save ? tree.roots(save) : []), [tree, save]);

  if (!tree || !save) return null;

  const renderEditor = (node: TreeNode) => {
    const loaded = origin ? tree.valueOf(origin, node) : node.value;
    const changed = loaded !== node.value;
    const label = `${node.key} value`;
    if (node.editable === 'boolean') {
      return (
        <SwitchInput
          type="checkbox"
          checked={node.value === true}
          $changed={changed}
          aria-label={label}
          onChange={() => setValue(node, node.value !== true)}
        />
      );
    }
    if (node.editable === 'number' || node.editable === 'string') {
      return (
        <ValueEditor
          value={node.value as string | number}
          mode={node.editable === 'number' ? 'number' : 'text'}
          changed={changed}
          label={label}
          onCommit={(value) => setValue(node, value)}
        />
      );
    }
    return node.value !== undefined ? <Muted>{formatValue(node.value)}</Muted> : null;
  };

  const renderNodes = (
    nodes: TreeNode[],
    depth: number,
    parent: Pick<SearchResult, 'chain' | 'indices'> | null,
  ): React.ReactNode => {
    const parentId = parent ? parent.chain[parent.chain.length - 1].id : null;
    const limit = parentId ? pageSizes[parentId] ?? PAGE_SIZE : nodes.length;
    const visible = nodes.slice(0, limit);
    return (
      <>
        {visible.map((node, index) => {
          const open = expanded.has(node.id);
          const here = {
            chain: [...(parent?.chain ?? []), node],
            indices: [...(parent?.indices ?? []), index],
          };
          return (
            <React.Fragment key={node.id}>
              <Row $depth={depth} $highlight={highlight === node.id} data-node-id={node.id}>
                {node.hasChildren ? (
                  <Toggle onClick={() => toggle(node.id)} aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${node.key}`}>
                    {open ? '▾' : '▸'}
                  </Toggle>
                ) : (
                  <Toggle as="span" aria-hidden />
                )}
                <Key title={node.id}>{node.key}</Key>
                <Type>{node.type}</Type>
                {renderEditor(node)}
                {node.summary && <Muted>{node.summary}</Muted>}
                {node.hasChildren && (
                  <ScopeButton
                    className="scope-button"
                    title={`Search inside ${node.key}`}
                    aria-label={`Search inside ${node.key}`}
                    onClick={() => setScope(here)}
                  >
                    🔍
                  </ScopeButton>
                )}
              </Row>
              {open && renderNodes(tree.children(save, node), depth + 1, here)}
            </React.Fragment>
          );
        })}
        {nodes.length > limit && parentId && (
          <Row $depth={depth} $highlight={false}>
            <MoreButton
              type="button"
              onClick={() => setPageSizes((s) => ({ ...s, [parentId]: limit + PAGE_SIZE }))}
            >
              Show {Math.min(PAGE_SIZE, nodes.length - limit)} more ({(nodes.length - limit).toLocaleString()} left)
            </MoreButton>
          </Row>
        )}
      </>
    );
  };

  const comparing = search?.results.some((r) => r.oldValue !== undefined);

  return (
    <Wrapper>
      <Notice>
        Advanced: every value in the save. Editing values you don't understand can break the game — keep a backup.
        Highlighted values differ from the file as opened.
      </Notice>
      <Toolbar
        onSubmit={(e) => {
          e.preventDefault();
          runSearch();
        }}
      >
        <SearchBox
          placeholder='Search: gold, key:@hp >500, party.@gold, "Lona", /^@stat_/'
          aria-label="Search the save"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button type="button" onClick={() => setShowHelp((v) => !v)} aria-expanded={showHelp} title="Search syntax">
          ?
        </Button>
        <Select
          value={compare}
          onChange={(e) => setCompare(e.target.value as CompareMode)}
          aria-label="Compare with previous save"
          title={old ? 'Compare each value with the previously opened save of this game' : 'Open an earlier save of this game first, then this one'}
        >
          {(Object.keys(COMPARE_LABELS) as CompareMode[]).map((mode) => (
            <option key={mode} value={mode} disabled={mode !== 'none' && !old}>
              {COMPARE_LABELS[mode]}
            </option>
          ))}
        </Select>
        <Check>
          <input type="checkbox" checked={editableOnly} onChange={(e) => setEditableOnly(e.target.checked)} />
          Editable only
        </Check>
        <Button type="submit">Search</Button>
        <Button
          type="button"
          onClick={runRefine}
          disabled={!search?.results.length || search.running}
          title="Apply the current search and comparison to the results below only (e.g. after opening a newer save)"
        >
          Refine
        </Button>
        {search?.running && (
          <Button type="button" onClick={stop}>
            Stop
          </Button>
        )}
        <Button type="button" onClick={() => { setExpanded(new Set()); setHighlight(null); }}>
          Collapse all
        </Button>
      </Toolbar>

      {scope && (
        <div>
          <Chip>
            Searching inside: {pathText(scope.chain)}
            <ChipClose onClick={() => setScope(null)} aria-label="Search the whole save">✕</ChipClose>
          </Chip>
        </div>
      )}

      {showHelp && (
        <Help>
          <table>
            <tbody>
              {SYNTAX.map(([example, meaning]) => (
                <tr key={example}>
                  <td><code>{example}</code></td>
                  <td>{meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ margin: '6px 0 0' }}>
            Finding an unknown value: open a save, then a later save of the same game, search with “Changed since
            previous save” (or <code>old:120 =125</code>), and use <b>Refine</b> after opening the next save to narrow
            it down. Hover a section and click 🔍 to search inside it only.
          </p>
        </Help>
      )}

      {error && <ErrorText role="alert">{error}</ErrorText>}

      {search && (
        <>
          <Status aria-live="polite">
            {search.running
              ? `Searching… ${search.visited.toLocaleString()} values checked, ${search.results.length} found`
              : search.mode === 'refine'
                ? `${search.results.length} of ${search.visited} previous results still match`
                : `${search.results.length} found in ${search.visited.toLocaleString()} values` +
                  (search.hitLimit ? ' (stopped at the result limit — narrow the search)' : '')}
          </Status>
          <Results aria-label="Search results">
            {search.results.length === 0 && !search.running && <li>No matches.</li>}
            {search.results.map((result) => {
              const last = result.chain[result.chain.length - 1];
              return (
                <ResultItem key={last.id} onClick={() => reveal(result)} title={pathText(result.chain)}>
                  {pathText(result.chain)}
                  {last.value !== undefined && (
                    <Muted>
                      {' = '}
                      {comparing && result.oldValue !== undefined ? `${formatValue(result.oldValue)} → ` : ''}
                      {formatValue(last.value)}
                    </Muted>
                  )}
                </ResultItem>
              );
            })}
          </Results>
        </>
      )}

      <TreeBox role="tree">{renderNodes(roots, 0, null)}</TreeBox>
    </Wrapper>
  );
};

export default AdvancedContent;
