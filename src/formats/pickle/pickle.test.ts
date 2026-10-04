import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeLong, parsePickle, PDict, PLeaf, PNode, PObject, PTuple } from './model';
import { encodeLong, encodeLiteral, LeafEdit, writePickle } from './writer';

const fixture = (name: string) => new Uint8Array(readFileSync(join(__dirname, '../renpy/__fixtures__', name)));

/** roots dict of a Ren'Py (roots, log) pickle. */
const rootsOf = (root: PNode) => ((root as PTuple).items[0] as PDict).entries;
const keyText = (key: PNode) => (key as PLeaf).value as string;
const variable = (root: PNode, name: string) => rootsOf(root).find(([k]) => keyText(k) === `store.${name}`)![1];
const leafValue = (node: PNode) => (node as PLeaf).value;

describe.each([2, 5])('pickle protocol %i', (protocol) => {
  const bytes = fixture(`p${protocol}.pickle`);
  const parsed = parsePickle(bytes);

  it('reads the (roots, log) structure with values of every kind', () => {
    expect(parsed.protocol).toBe(protocol);
    const root = parsed.root;
    expect(leafValue(variable(root, 'money'))).toBe(120);
    expect(leafValue(variable(root, 'negative'))).toBe(-5);
    expect(leafValue(variable(root, 'big_number'))).toBe(70000);
    expect(leafValue(variable(root, 'huge'))).toBe(2n ** 70n);
    expect(leafValue(variable(root, 'ratio'))).toBe(0.5);
    expect(leafValue(variable(root, 'met_lily'))).toBe(true);
    expect(leafValue(variable(root, 'nothing'))).toBeNull();
    expect(leafValue(variable(root, 'unicode_name'))).toBe('Ånna ✓');
    expect(leafValue(variable(root, 'nickname'))).toBe('Alex');

    const inventory = variable(root, 'inventory') as PObject;
    expect(inventory.cls).toEqual({ kind: 'global', module: 'renpy.revertable', name: 'RevertableList' });
    expect(inventory.items.map(leafValue)).toEqual(['key', 'map']);

    const player = variable(root, 'player') as PObject;
    const state = (player.state as PDict).entries;
    const friends = state.find(([k]) => keyText(k) === 'friends')![1] as PObject;
    expect(friends.items[0]).toBe(player); // the cycle is the same node

    const log = (root as PTuple).items[1] as PObject;
    expect(log.cls).toMatchObject({ module: 'renpy.rollback', name: 'Log' });
  });

  it('writes an unedited pickle back byte for byte', () => {
    expect(writePickle(parsed, new Map())).toEqual(bytes);
  });

  it('edits values in place and keeps everything else', () => {
    const site = (name: string) => (variable(parsed.root, name) as PLeaf).site;
    const edits = new Map<number, LeafEdit>([
      [site('money'), { type: 'int', value: 99999 }],
      [site('negative'), { type: 'int', value: -(2 ** 40) }],
      [site('ratio'), { type: 'float', value: 2 }],
      [site('met_lily'), { type: 'bool', value: false }],
      [site('unicode_name'), { type: 'str', value: 'Zoë '.repeat(100) }],
      [site('nickname'), { type: 'str', value: 'Lex' }], // a memo GET of mc_name's string
    ]);
    const written = writePickle(parsed, edits);
    const again = parsePickle(written);
    expect(leafValue(variable(again.root, 'money'))).toBe(99999);
    expect(leafValue(variable(again.root, 'negative'))).toBe(-(2 ** 40));
    expect(leafValue(variable(again.root, 'ratio'))).toBe(2);
    expect(variable(again.root, 'ratio')).toMatchObject({ type: 'float' });
    expect(leafValue(variable(again.root, 'met_lily'))).toBe(false);
    expect(leafValue(variable(again.root, 'unicode_name'))).toBe('Zoë '.repeat(100));
    expect(leafValue(variable(again.root, 'nickname'))).toBe('Lex');
    expect(leafValue(variable(again.root, 'mc_name'))).toBe('Alex'); // shared in Python, edited in one place only
    expect(((variable(again.root, 'history') as PObject).items.at(-1) as PLeaf).value).toBe('line 8999');
  });

  it('keeps a shared string for its other uses when its first use is edited', () => {
    const mcName = variable(parsed.root, 'mc_name') as PLeaf;
    const written = writePickle(parsed, new Map([[mcName.site, { type: 'str', value: 'Sam' } as LeafEdit]]));
    const again = parsePickle(written);
    expect(leafValue(variable(again.root, 'mc_name'))).toBe('Sam');
    expect(leafValue(variable(again.root, 'nickname'))).toBe('Alex');
    const player = variable(again.root, 'player') as PObject;
    expect(leafValue((player.state as PDict).entries.find(([k]) => keyText(k) === 'name')![1])).toBe('Alex');
  });
});

describe('pickle encoding', () => {
  it('encodes ints like Python', () => {
    for (const n of [0n, 1n, 127n, 128n, 255n, -1n, -128n, -129n, 2n ** 70n, -(2n ** 70n)]) {
      expect(decodeLong(encodeLong(n))).toEqual(n >= -(2n ** 53n) && n <= 2n ** 53n ? Number(n) : n);
    }
    expect([...encodeLong(255n)]).toEqual([0xff, 0x00]); // Python: (255).to_bytes(2, 'little', signed=True)
    expect([...encodeLong(-256n)]).toEqual([0x00, 0xff]);
    expect([...encodeLiteral({ type: 'int', value: 5 }, 2)]).toEqual([0x4b, 5]);
    expect([...encodeLiteral({ type: 'int', value: 300 }, 2)]).toEqual([0x4d, 44, 1]);
    expect([...encodeLiteral({ type: 'bool', value: true }, 2)]).toEqual([0x88]);
  });

  it('reads Python 2 byte strings as text and writes them back as byte strings', () => {
    // pickle.dumps('caf\xc3\xa9', 2) in Python 2: PROTO 2, SHORT_BINSTRING, BINPUT 0, STOP
    const py2 = Uint8Array.of(0x80, 2, 0x55, 5, 0x63, 0x61, 0x66, 0xc3, 0xa9, 0x71, 0, 0x2e);
    const parsed = parsePickle(py2);
    expect(parsed.root).toMatchObject({ type: 'str', value: 'café', byteString: true });
    const written = writePickle(parsed, new Map([[1, { type: 'str', value: 'thé', byteString: true } as LeafEdit]]));
    expect([...written]).toEqual([0x80, 2, 0x55, 4, 0x74, 0x68, 0xc3, 0xa9, 0x71, 0, 0x2e]);
  });
});
