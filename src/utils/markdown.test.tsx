import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Markdown, parseBlocks } from './markdown';

const html = (text: string) => renderToStaticMarkup(<Markdown text={text} />);
const link = (href: string, text: string) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;

describe('release notes markdown', () => {
  it('renders a real release body', () => {
    const notes = [
      '## What\'s new',
      '- Support RPG Maker VX Ace (.rvdata2) saves',
      '- Names come from **Game.rgss3a**',
      '',
      '## Fixes',
      '- Level is limited to 1–99',
      '',
      '**Full Changelog**: https://github.com/o/r/compare/v1.3.0...v1.4.0',
    ].join('\r\n');
    expect(html(notes)).toBe(
      '<div>' +
        '<h4>What&#x27;s new</h4>' +
        '<ul><li>Support RPG Maker VX Ace (.rvdata2) saves</li><li>Names come from <strong>Game.rgss3a</strong></li></ul>' +
        '<h4>Fixes</h4>' +
        '<ul><li>Level is limited to 1–99</li></ul>' +
        `<p><strong>Full Changelog</strong>: ${link('https://github.com/o/r/compare/v1.3.0...v1.4.0', 'https://github.com/o/r/compare/v1.3.0...v1.4.0')}</p>` +
        '</div>',
    );
  });

  it('handles links, code, wrapped lines and lists without blank lines', () => {
    expect(html('See [the docs](https://x.dev/a). Run `npm ci`.')).toBe(
      `<div><p>See ${link('https://x.dev/a', 'the docs')}. Run <code>npm ci</code>.</p></div>`,
    );
    expect(parseBlocks('Intro line\nsecond line\n- a\n  continued\n* b')).toEqual([
      { kind: 'paragraph', lines: ['Intro line', 'second line'] },
      { kind: 'list', items: ['a continued', 'b'] },
    ]);
  });

  it('never injects HTML from the notes', () => {
    expect(html('<img src=x onerror=alert(1)> **<b>x</b>**')).toBe(
      '<div><p>&lt;img src=x onerror=alert(1)&gt; <strong>&lt;b&gt;x&lt;/b&gt;</strong></p></div>',
    );
  });
});
