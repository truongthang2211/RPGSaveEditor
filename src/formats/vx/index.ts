import { readBinary, writeBinary } from '../../utils/fileUtils';
import { readMarshalStream } from '../marshal/reader';
import { writeMarshalStream } from '../marshal/writer';
import { fromDumps, materialize } from '../rgss/patches';
import { locateByClass, RgssSave } from '../rgss/editor';
import { loadRgssDatabase } from '../rgss/loadDatabase';
import { isRgssSavePath, rgssGameName } from '../rgss/paths';
import { SaveFormat } from '../types';
import { vxEditor } from './editor';
import { rgssTree } from '../rgss/tree';

export const vxFormat: SaveFormat<RgssSave> = {
  id: 'vx',
  label: 'RPG Maker VX',
  extensions: ['rvdata'],
  matches: (filePath) => isRgssSavePath(filePath, 'rvdata'),

  async read(filePath) {
    const dumps = readMarshalStream(await readBinary(filePath));
    if (!locateByClass(dumps, 'party')) throw new Error('Not an RPG Maker VX save: no Game_Party found');
    return { data: fromDumps(dumps) };
  },

  async write(filePath, { data }) {
    await writeBinary(filePath, writeMarshalStream(materialize(data)));
  },

  loadDatabase: (savePath) => loadRgssDatabase(savePath, { extension: 'rvdata', archive: 'Game.rgss2a' }),
  gameName: rgssGameName,
  editor: vxEditor,
  tree: rgssTree,
};
