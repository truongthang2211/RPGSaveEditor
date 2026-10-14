/*
 * Builds SugarCube test saves for src/formats/sugarcube with SugarCube's own
 * code, and decodes saves written by the editor the way the game does.
 *
 *   node scripts/sugarcube_fixtures.mjs <sugarcube-2 checkout> make
 *   node scripts/sugarcube_fixtures.mjs <sugarcube-2 checkout> check FILE.save
 *
 * The checkout is https://github.com/tmedwards/sugarcube-2 (its src/util and
 * src/lib files are loaded as is: Diff, Serial, clone).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import LZString from 'lz-string';

const [source, command, file] = process.argv.slice(2);
if (!source || !['make', 'check'].includes(command)) {
  console.log('usage: node scripts/sugarcube_fixtures.mjs <sugarcube-2 checkout> make | check FILE.save');
  process.exit(1);
}

for (const lib of ['util/gettypeof.js', 'util/clone.js', 'util/enumfrom.js', 'lib/diff.js', 'lib/serial.js']) {
  vm.runInThisContext(readFileSync(join(source, 'src', lib), 'utf8'), { filename: lib });
}
const { Diff, Serial } = globalThis;

/** A story class revived with Serial.createReviver, like SugarCube's documentation shows. */
class Player {
  constructor(data) {
    Object.assign(this, data);
  }
  clone() {
    return new Player(this);
  }
  toJSON() {
    return Serial.createReviver('new Player($ReviveData$)', Object.assign({}, this));
  }
}
globalThis.Player = Player;

const deltaEncode = (history) => history.map((moment, i) => (i === 0 ? moment : Diff.diff(history[i - 1], moment)));
const deltaDecode = (delta) => delta.reduce((history, entry, i) => [...history, i === 0 ? entry : Diff.patch(history[i - 1], entry)], []);

function make() {
  const moments = [];
  const vars = {
    gold: 10,
    name: 'Alex',
    metLily: false,
    inventory: ['key', 'map', 'rope'],
    flags: new Map([['beach', false], ['library', true]]),
    seen: new Set(['intro']),
    started: new Date('2026-01-02T03:04:05.000Z'),
    player: new Player({ money: 5, hp: 10 }),
    nothing: undefined,
    stats: { charm: 3, fitness: 2 },
  };
  moments.push({ title: 'Start', variables: globalThis.clone(vars) });
  vars.gold = 20;
  vars.inventory.splice(1, 2);
  vars.flags.set('beach', true);
  vars.player.money = 50;
  moments.push({ title: 'Beach', variables: globalThis.clone(vars) });
  vars.gold = 35;
  vars.metLily = true;
  vars.player.hp = 7;
  vars.stats.charm = 4;
  vars.route = 'lily';
  moments.push({ title: 'Cafe', variables: globalThis.clone(vars) });

  const save = {
    type: 3,
    title: 'Cafe',
    date: Date.parse('2026-10-14T12:00:00Z'),
    id: 'demo-story',
    state: { index: 2, delta: deltaEncode(moments) },
    metadata: { chapter: 2 },
  };
  const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'formats', 'sugarcube', '__fixtures__');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'Demo Story-20261014-120000.save'), LZString.compressToBase64(Serial.stringify(save)));
  console.log('written to', out);
}

/** Prints what the game would load: every moment's variables, as JSON. */
function check(path) {
  const save = Serial.parse(LZString.decompressFromBase64(readFileSync(path, 'utf8')));
  const history = save.state.delta ? deltaDecode(save.state.delta) : save.state.history;
  const plain = (value) => JSON.parse(Serial.stringify(value));
  console.log(JSON.stringify({ id: save.id, index: save.state.index, moments: history.map((m) => ({ title: m.title, variables: plain(m.variables) })) }, null, 1));
  const player = history[save.state.index].variables.player;
  console.log('player revived as Player:', player instanceof Player, '| flags is Map:', history[save.state.index].variables.flags instanceof Map);
}

if (command === 'make') make();
else check(file);
