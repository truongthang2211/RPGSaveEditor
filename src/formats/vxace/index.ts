import { readBinary, writeBinary } from '../../utils/fileUtils';
import { readMarshalStream } from '../marshal/reader';
import { writeMarshalStream } from '../marshal/writer';
import { loadRgssDatabase } from '../rgss/loadDatabase';
import { isRgssSavePath, rgssGameName } from '../rgss/paths';
import { SaveFormat } from '../types';
import { VxAceSave, vxaceEditor } from './editor';

export const vxaceFormat: SaveFormat<VxAceSave> = {
  id: 'vxace',
  label: 'RPG Maker VX Ace',
  extensions: ['rvdata2'],
  matches: (filePath) => isRgssSavePath(filePath, 'rvdata2'),

  async read(filePath) {
    const dumps = readMarshalStream(await readBinary(filePath));
    if (dumps.length < 2) {
      throw new Error(`Not a VX Ace save: expected header and contents, found ${dumps.length} Marshal dump(s)`);
    }
    return { data: dumps };
  },

  async write(filePath, { data }) {
    await writeBinary(filePath, writeMarshalStream(data));
  },

  loadDatabase: (savePath) => loadRgssDatabase(savePath, { extension: 'rvdata2', archive: 'Game.rgss3a' }),
  gameName: rgssGameName,
  editor: vxaceEditor,
};
