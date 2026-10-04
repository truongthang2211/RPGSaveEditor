import { readBinary, writeBinary } from '../../utils/fileUtils';
import { readMarshalStream } from '../marshal/reader';
import { writeMarshalStream } from '../marshal/writer';
import { fromDumps, materialize } from '../rgss/patches';
import { locateByClass, RgssSave } from '../rgss/editor';
import { loadRgssDatabase } from '../rgss/loadDatabase';
import { isRgssSavePath, rgssGameName } from '../rgss/paths';
import { SaveFormat } from '../types';
import { xpEditor } from './editor';
import { rgssTree } from '../rgss/tree';

export const xpFormat: SaveFormat<RgssSave> = {
  id: 'xp',
  label: 'RPG Maker XP',
  extensions: ['rxdata'],
  matches: (filePath) => isRgssSavePath(filePath, 'rxdata'),

  async read(filePath) {
    const dumps = readMarshalStream(await readBinary(filePath));
    if (!locateByClass(dumps, 'party')) throw new Error('Not an RPG Maker XP save: no Game_Party found');
    return { data: fromDumps(dumps) };
  },

  async write(filePath, { data }) {
    await writeBinary(filePath, writeMarshalStream(materialize(data)));
  },

  loadDatabase: (savePath) => loadRgssDatabase(savePath, { extension: 'rxdata', archive: 'Game.rgssad' }),
  gameName: rgssGameName,
  editor: xpEditor,
  tree: rgssTree,
};
