import React, { ReactNode } from 'react';
import ExternalLink from '../components/ExternalLink';

/**
 * Renders the small Markdown subset used in release notes: headings, "-"/"*"
 * lists, paragraphs, **bold**, `code`, [links](url) and bare URLs. Builds React
 * elements (no HTML injection), so notes can't run scripts.
 */

const INLINE = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;

export function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push(text.slice(last, index));
    const key = nodes.length;
    const [, bold, code, linkText, linkUrl, bareUrl] = match;
    if (bold !== undefined) nodes.push(<strong key={key}>{renderInline(bold)}</strong>);
    else if (code !== undefined) nodes.push(<code key={key}>{code}</code>);
    else if (linkUrl !== undefined) nodes.push(<ExternalLink key={key} href={linkUrl}>{linkText}</ExternalLink>);
    else nodes.push(<ExternalLink key={key} href={bareUrl}>{bareUrl}</ExternalLink>);
    last = index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'paragraph'; lines: string[] };

export function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  const lastBlock = () => blocks[blocks.length - 1];
  let open = false; // whether the next line may continue the last list/paragraph

  for (const raw of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    const item = /^[-*+]\s+(.*)$/.exec(line);
    if (!line) {
      open = false;
    } else if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2] });
      open = false;
    } else if (item) {
      const prev = lastBlock();
      if (open && prev?.kind === 'list') prev.items.push(item[1]);
      else blocks.push({ kind: 'list', items: [item[1]] });
      open = true;
    } else {
      const prev = lastBlock();
      if (open && prev?.kind === 'paragraph') prev.lines.push(line);
      else if (open && prev?.kind === 'list') prev.items[prev.items.length - 1] += ` ${line}`; // wrapped item
      else blocks.push({ kind: 'paragraph', lines: [line] });
      open = true;
    }
  }
  return blocks;
}

export const Markdown: React.FC<{ text: string; className?: string }> = ({ text, className }) => (
  <div className={className}>
    {parseBlocks(text).map((block, i) => {
      if (block.kind === 'heading') {
        const Tag = `h${Math.min(block.level + 2, 6)}` as 'h3'; // "## What's new" sits under the dialog title
        return <Tag key={i}>{renderInline(block.text)}</Tag>;
      }
      if (block.kind === 'list') {
        return (
          <ul key={i}>
            {block.items.map((item, j) => (
              <li key={j}>{renderInline(item)}</li>
            ))}
          </ul>
        );
      }
      return <p key={i}>{renderInline(block.lines.join(' '))}</p>;
    })}
  </div>
);
