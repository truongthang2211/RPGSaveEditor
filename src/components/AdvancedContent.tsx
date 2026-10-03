import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { useSaveEditor } from '../hooks/useSaveEditor';
import { SaveTree, TreeNode, TreeValue } from '../formats';
import { SwitchInput } from '../styles/ItemsContentStyles';
import ValueInput from './ValueInput';

/** Children shown per node before "Show more" (map data arrays can be huge). */
const PAGE_SIZE = 200;
/** Search limits: the tree can be large and (in RGSS) cyclic. */
const SEARCH_MAX_NODES = 60_000;
const SEARCH_MAX_RESULTS = 200;

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
  gap: 8px;
  align-items: center;
`;

const SearchBox = styled.input`
  flex: 1;
  max-width: 420px;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid ${({ theme }) => theme.borderColor};
  background-color: ${({ theme }) => theme.inputBackground};
  color: ${({ theme }) => theme.inputTextColor};
`;

const Button = styled.button`
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid ${({ theme }) => theme.borderColor};
  background-color: ${({ theme }) => theme.itemBackground};
  color: ${({ theme }) => theme.color};
  cursor: pointer;
  &:hover {
    background-color: ${({ theme }) => theme.hoverBackground};
  }
`;

const Results = styled.ul`
  margin: 0;
  padding: 6px;
  max-height: 180px;
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

interface SearchResult {
  /** Path from a root to the match. */
  chain: TreeNode[];
  /** Index of each chain node within its parent's children (to page far enough). */
  indices: number[];
}

interface SearchOutcome {
  results: SearchResult[];
  /** Values looked at, and whether the save had more (search stopped at the limit). */
  visited: number;
  incomplete: boolean;
}

/** Breadth-first search over keys, types and values, bounded for large/cyclic saves. */
function searchTree(tree: SaveTree, save: any, query: string): SearchOutcome {
  interface Entry { node: TreeNode; index: number; parent: Entry | null }
  const q = query.toLowerCase();
  const results: SearchResult[] = [];
  const queue: Entry[] = tree.roots(save).map((node, index) => ({ node, index, parent: null }));
  let head = 0;
  const toResult = (entry: Entry): SearchResult => {
    const chain: TreeNode[] = [];
    const indices: number[] = [];
    for (let e: Entry | null = entry; e; e = e.parent) {
      chain.unshift(e.node);
      indices.unshift(e.index);
    }
    return { chain, indices };
  };
  while (head < queue.length && results.length < SEARCH_MAX_RESULTS && head < SEARCH_MAX_NODES) {
    const entry = queue[head++];
    const { node } = entry;
    if (node.key.toLowerCase().includes(q) || node.type.toLowerCase().includes(q) ||
        (node.value !== undefined && String(node.value).toLowerCase().includes(q))) {
      results.push(toResult(entry));
    }
    if (node.hasChildren) {
      tree.children(save, node).forEach((child, index) => queue.push({ node: child, index, parent: entry }));
    }
  }
  return { results, visited: head, incomplete: head < queue.length };
}

const AdvancedContent: React.FC = () => {
  const { tree, save, origin, updateSave } = useSaveEditor();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pageSizes, setPageSizes] = useState<Record<string, number>>({});
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<SearchOutcome | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);

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

  const reveal = (result: SearchResult) => {
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

  const renderNodes = (nodes: TreeNode[], depth: number, parentId: string | null): React.ReactNode => {
    const limit = parentId ? pageSizes[parentId] ?? PAGE_SIZE : nodes.length;
    const visible = nodes.slice(0, limit);
    return (
      <>
        {visible.map((node) => {
          const open = expanded.has(node.id);
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
              </Row>
              {open && renderNodes(tree.children(save, node), depth + 1, node.id)}
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

  return (
    <Wrapper>
      <Notice>
        Advanced: every value in the save. Editing values you don't understand can break the game — keep a backup.
        Highlighted values differ from the file as opened.
      </Notice>
      <Toolbar
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(query.trim() ? searchTree(tree, save, query.trim()) : null);
        }}
      >
        <SearchBox
          placeholder="Search keys, types or values (e.g. @gold, Game_Party, 9999)"
          aria-label="Search the save"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button type="submit">Search</Button>
        <Button type="button" onClick={() => { setExpanded(new Set()); setHighlight(null); }}>
          Collapse all
        </Button>
      </Toolbar>
      {search && (
        <Results aria-label="Search results">
          {search.results.length === 0 && <li>No matches.</li>}
          {search.results.map((result) => {
            const last = result.chain[result.chain.length - 1];
            return (
              <ResultItem key={last.id} onClick={() => reveal(result)} title={result.chain.map((n) => n.key).join(' › ')}>
                {result.chain.map((n) => n.key).join(' › ')}
                {last.value !== undefined && <Muted> = {formatValue(last.value)}</Muted>}
              </ResultItem>
            );
          })}
          {search.results.length >= SEARCH_MAX_RESULTS && (
            <li><Muted>Showing the first {SEARCH_MAX_RESULTS} matches; refine the search to see others.</Muted></li>
          )}
          {search.incomplete && search.results.length < SEARCH_MAX_RESULTS && (
            <li>
              <Muted>
                Searched the first {search.visited.toLocaleString()} values (closest to the top); deeper values were
                not searched. Open a section to browse it.
              </Muted>
            </li>
          )}
        </Results>
      )}
      <TreeBox role="tree">{renderNodes(roots, 0, null)}</TreeBox>
    </Wrapper>
  );
};

export default AdvancedContent;
