import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { useSaveEditor } from '../hooks/useSaveEditor';
import { useRemembered } from '../hooks/useRemembered';
import { TreeNode, TreeValue } from '../formats';
import { activeSearch, SwitchInput } from '../styles/ItemsContentStyles';
import ValueInput from './ValueInput';
import { parseQuery } from './advanced/query';
import { ChildCache, CompareMode, SearchResult, SearchSpec, TreeRefine, TreeSearch } from './advanced/searchEngine';

/** Children shown per node before "Show more" (map data arrays can be huge). */
const PAGE_SIZE = 200;
/** Nodes searched (or results refined) per slice before yielding to the UI. */
const SEARCH_SLICE = 4_000;
const REFINE_SLICE = 50;

/** A search or refine that runs in slices. */
interface Job {
  results: SearchResult[];
  visited: number;
  step(budget: number): boolean;
}

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

const SearchBox = styled.input<{ $active: boolean }>`
  flex: 1;
  min-width: 260px;
  max-width: 460px;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid ${({ theme }) => theme.borderColor};
  background-color: ${({ theme }) => theme.inputBackground};
  color: ${({ theme }) => theme.inputTextColor};
  ${({ $active }) => $active && activeSearch}
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

const ErrorText = styled.div`
  font-size: 13px;
  color: #d9534f;
`;

/** A titled box; the search results and the save tree each get one so they read as separate areas. */
const Panel = styled.section<{ $accent?: boolean }>`
  border: 1px solid ${({ theme }) => theme.borderColor};
  border-left: 3px solid ${({ theme, $accent }) => ($accent ? theme.primaryColor : theme.borderColor)};
  border-radius: 8px;
  overflow: hidden;
  background-color: ${({ theme }) => theme.contentBackground};
`;

const PanelHeader = styled.header`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  background-color: ${({ theme }) => theme.headerBackground};
  border-bottom: 1px solid ${({ theme }) => theme.borderColor};
  font-size: 13px;
`;

const PanelTitle = styled.h3`
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
`;

const PanelMeta = styled.span`
  flex: 1;
  min-width: 0;
  font-size: 12px;
  opacity: 0.75;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const SmallButton = styled.button`
  padding: 2px 10px;
  border-radius: 6px;
  font-size: 12px;
  border: 1px solid ${({ theme }) => theme.borderColor};
  background-color: ${({ theme }) => theme.itemBackground};
  color: ${({ theme }) => theme.color};
  cursor: pointer;
  white-space: nowrap;
  &:hover {
    background-color: ${({ theme }) => theme.hoverBackground};
  }
`;

const Results = styled.ul`
  margin: 0;
  padding: 4px;
  max-height: 240px;
  overflow: auto;
  list-style: none;
  font-size: 13px;
`;

const ResultItem = styled.li<{ $active: boolean }>`
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 3px 8px;
  border-radius: 4px;
  cursor: pointer;
  background-color: ${({ theme, $active }) => ($active ? theme.hoverBackground : 'transparent')};
  box-shadow: ${({ theme, $active }) => ($active ? `inset 3px 0 0 ${theme.primaryColor}` : 'none')};
  &:hover {
    background-color: ${({ theme }) => theme.hoverBackground};
  }
`;

const ResultPath = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ResultParents = styled.span`
  opacity: 0.6;
`;

const ResultValue = styled.span`
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: Consolas, Menlo, monospace;
  text-align: right;
`;

const OldValue = styled.span`
  opacity: 0.6;
  text-decoration: line-through;
`;

const TreeBox = styled.div`
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
  box-shadow: ${({ theme, $highlight }) => ($highlight ? `inset 3px 0 0 ${theme.primaryColor}` : 'none')};
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

const ResultType = styled(Type)`
  justify-self: start;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
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

/** `type` names the empty value in the save's own language: nil (Ruby), None (Python), null (JSON). */
const formatValue = (value: TreeValue | undefined, type?: string) =>
  value === null
    ? type === 'None' || type === 'nil' ? type : 'null'
    : typeof value === 'string' ? JSON.stringify(value) : String(value);

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
  /** Refine: how many results were re-checked. */
  total?: number;
  /** Stopped (or left by switching tabs) before it finished. */
  interrupted?: boolean;
}

/** A search cut off by leaving the tab can't resume; show it as stopped. */
const restoreSearch = (s: SearchState | null) => (s?.running ? { ...s, running: false, interrupted: true } : s);

const AdvancedContent: React.FC = () => {
  const { tree, save, origin, old, updateSave } = useSaveEditor();
  const [expanded, setExpanded] = useRemembered<Set<string>>('advanced.expanded', new Set());
  const [pageSizes, setPageSizes] = useRemembered<Record<string, number>>('advanced.pageSizes', {});
  const [highlight, setHighlight] = useRemembered<string | null>('advanced.highlight', null);

  const [query, setQuery] = useRemembered('advanced.query', '');
  const [compare, setCompare] = useRemembered<CompareMode>('advanced.compare', 'none');
  const [editableOnly, setEditableOnly] = useRemembered('advanced.editableOnly', false);
  const [scope, setScope] = useRemembered<Pick<SearchResult, 'chain' | 'indices'> | null>('advanced.scope', null);
  const [showHelp, setShowHelp] = useRemembered('advanced.showHelp', false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useRemembered<SearchState | null>('advanced.search', null, restoreSearch);
  const runner = useRef<{ job: Job; timer?: number } | null>(null);

  const stop = useCallback(() => {
    if (runner.current?.timer) window.clearTimeout(runner.current.timer);
    runner.current = null;
    setSearch((s) => (s ? { ...s, running: false, interrupted: s.interrupted || s.running } : s));
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

  /** Runs a job in slices, publishing progress after each one. */
  const run = (job: Job, slice: number, mode: SearchState['mode'], total?: number) => {
    const tick = () => {
      if (!runner.current || runner.current.job !== job) return;
      const done = job.step(slice);
      setSearch({
        results: [...job.results],
        visited: job.visited,
        running: !done,
        hitLimit: job instanceof TreeSearch && job.hitResultLimit,
        mode,
        total,
      });
      if (!done) runner.current.timer = window.setTimeout(tick, 0);
      else runner.current = null;
    };
    runner.current = { job };
    tick();
  };

  const runSearch = () => {
    stop();
    const spec = makeSpec();
    if (spec) run(new TreeSearch(spec), SEARCH_SLICE, 'search');
  };

  const runRefine = () => {
    const previous = search?.results;
    if (!previous?.length) return;
    stop();
    const spec = makeSpec();
    if (spec) run(new TreeRefine(spec, previous), REFINE_SLICE, 'refine', previous.length);
  };

  const clearSearch = () => {
    stop();
    setSearch(null);
    setHighlight(null);
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

  // Children lists are cached per save: containers can hold tens of thousands of
  // entries and would otherwise be rebuilt on every render.
  const childCache = useMemo(() => (tree ? new ChildCache(tree) : null), [tree]);
  const roots = useMemo(() => (childCache && save ? childCache.roots(save).nodes : []), [childCache, save]);

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
          integer={node.integer}
          changed={changed}
          label={label}
          onCommit={(value) => setValue(node, value)}
        />
      );
    }
    return node.value !== undefined ? <Muted>{formatValue(node.value, node.type)}</Muted> : null;
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
              {open && renderNodes(childCache!.children(save, node).nodes, depth + 1, here)}
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
        Advanced: every value in the save. Editing values you don't understand can break the game - keep a backup.
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
          $active={query.trim() !== ''}
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
        <Panel $accent aria-label="Search results">
          <PanelHeader>
            <PanelTitle>Search results</PanelTitle>
            <PanelMeta aria-live="polite">
              {search.running
                ? search.mode === 'refine'
                  ? `Refining… ${search.visited} of ${search.total} results checked, ${search.results.length} still match`
                  : `Searching… ${search.visited.toLocaleString()} values checked, ${search.results.length} found`
                : (search.mode === 'refine'
                  ? `${search.results.length} of ${search.total} previous results still match`
                  : `${search.results.length} found in ${search.visited.toLocaleString()} values` +
                    (search.hitLimit ? ' (stopped at the result limit — narrow the search)' : '')) +
                  (search.interrupted ? ' — stopped before finishing, search again to complete' : '')}
            </PanelMeta>
            <SmallButton type="button" onClick={clearSearch} title="Close the results">
              Clear
            </SmallButton>
          </PanelHeader>
          <Results>
            {search.results.length === 0 && !search.running && <li style={{ padding: '3px 8px' }}>No matches.</li>}
            {search.results.map((result) => {
              const last = result.chain[result.chain.length - 1];
              const parents = result.chain.slice(0, -1);
              return (
                <ResultItem
                  key={last.id}
                  $active={highlight === last.id}
                  onClick={() => reveal(result)}
                  title={`${pathText(result.chain)} (${last.type}) — click to show it in the save data`}
                >
                  <ResultType>{last.type}</ResultType>
                  <ResultPath>
                    {parents.length > 0 && <ResultParents>{pathText(parents)} › </ResultParents>}
                    <Key>{last.key}</Key>
                  </ResultPath>
                  <ResultValue>
                    {last.value !== undefined && (
                      <>
                        {comparing && result.oldValue !== undefined && (
                          <>
                            <OldValue>{formatValue(result.oldValue, last.type)}</OldValue>
                            {' → '}
                          </>
                        )}
                        {formatValue(last.value, last.type)}
                      </>
                    )}
                  </ResultValue>
                </ResultItem>
              );
            })}
          </Results>
        </Panel>
      )}

      <Panel aria-label="Save data">
        <PanelHeader>
          <PanelTitle>Save data</PanelTitle>
          <PanelMeta>Every value in the save · click a search result to jump to it</PanelMeta>
          <SmallButton type="button" onClick={() => { setExpanded(new Set()); setHighlight(null); }}>
            Collapse all
          </SmallButton>
        </PanelHeader>
        <TreeBox role="tree">{renderNodes(roots, 0, null)}</TreeBox>
      </Panel>
    </Wrapper>
  );
};

export default AdvancedContent;
