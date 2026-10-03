import { createRgssEditor, locateByClass } from '../rgss/editor';

/**
 * RPG Maker VX: Scene_File#write_save_data dumps 14 objects back to back
 * (characters, frame count, BGM, BGS, $game_system, $game_message,
 * $game_switches, $game_variables, $game_self_switches, $game_actors,
 * $game_party, $game_troop, $game_map, $game_player). Objects are found by
 * class name so scripts that add dumps don't break the editor.
 */
export const vxEditor = createRgssEditor({
  locate: locateByClass,
  stats: { hp: '@hp', mp: '@mp', level: '@level' },
  expPerClass: false,
  params: {
    fields: ['@maxhp_plus', '@maxmp_plus', '@atk_plus', '@def_plus', '@spi_plus', '@agi_plus'],
    labels: ['MaxHP', 'MaxMP', 'ATK', 'DEF', 'SPI', 'AGI'],
  },
});
