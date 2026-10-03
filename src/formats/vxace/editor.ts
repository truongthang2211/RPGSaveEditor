import { createRgssEditor, locateInContents, RgssSave } from '../rgss/editor';

/** A VX Ace save file: [header, contents], two consecutive Marshal dumps. */
export type VxAceSave = RgssSave;

export const vxaceEditor = createRgssEditor({
  locate: locateInContents,
  stats: { hp: '@hp', mp: '@mp', tp: '@tp', level: '@level' },
  expPerClass: true,
  params: { field: '@param_plus', labels: ['HP', 'MP', 'ATK', 'DEF', 'MAT', 'MDF', 'AGI', 'LUK'] },
});
