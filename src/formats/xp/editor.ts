import { createRgssEditor, locateByClass } from '../rgss/editor';

/**
 * RPG Maker XP: Scene_Save#write_save_data dumps 12 objects back to back
 * (characters, frame count, $game_system, $game_switches, $game_variables,
 * $game_self_switches, $game_screen, $game_actors, $game_party, $game_troop,
 * $game_map, $game_player). Game_Party#@actors holds copies of the actors,
 * but Scene_Load replaces them with $game_actors entries ($game_party.refresh),
 * so actors are edited in Game_Actors only.
 */
export const xpEditor = createRgssEditor({
  locate: locateByClass,
  stats: { hp: '@hp', mp: '@sp', level: '@level' },
  statLabels: { mp: 'SP' },
  expPerClass: false,
  params: {
    fields: ['@maxhp_plus', '@maxsp_plus', '@str_plus', '@dex_plus', '@agi_plus', '@int_plus'],
    labels: ['MaxHP', 'MaxSP', 'STR', 'DEX', 'AGI', 'INT'],
  },
});
