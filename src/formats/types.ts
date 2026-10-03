import { SystemData } from '../types/System';

export type InventoryKind = 'items' | 'weapons' | 'armors';

/** What the UI needs from an item/weapon/armor database entry (formats may provide more). */
export interface DatabaseEntry {
  id: number;
  name: string;
  description?: string;
}

/** Names/descriptions from the game's database files (null when missing or unreadable). */
export interface GameDatabase {
  items: (DatabaseEntry | null)[] | null;
  weapons: (DatabaseEntry | null)[] | null;
  armors: (DatabaseEntry | null)[] | null;
  system: SystemData | null;
}

export interface ActorView {
  /** Index of the actor in the save's actor list (used to edit it). */
  slot: number;
  name: string;
  /** Bonus params, in the order of `paramLabels` (MV/MZ/VX Ace: HP, MP, ATK, DEF, MAT, MDF, AGI, LUK). */
  paramPlus: number[];
  /** Labels for `paramPlus` when they differ from the MV/MZ order (e.g. XP: MaxHP, MaxSP, STR, DEX, AGI, INT). */
  paramLabels?: string[];
  /** Engine-specific stat names, e.g. XP calls MP "SP". */
  statLabels?: Partial<Record<ActorField, string>>;
  /** Valid ranges; values outside them can crash the game (e.g. RGSS level > 99). */
  limits?: Partial<Record<ActorField, { min: number; max: number }>>;
  hp?: number;
  mp?: number;
  tp?: number;
  level?: number;
  /** EXP for the actor's current class. */
  exp?: number;
}

export type ActorField = 'hp' | 'mp' | 'tp' | 'level' | 'exp';

/**
 * Reads and edits the parts of a save the UI exposes.
 * Setters never mutate their input; they return an updated save. Callers rely
 * on this: the loaded save is shared as the "origin" for change highlighting.
 */
export interface SaveEditor<S = any> {
  getGold(save: S): number;
  setGold(save: S, gold: number): S;

  getInventory(save: S, kind: InventoryKind): Record<number, number>;
  setInventoryCount(save: S, kind: InventoryKind, id: number, count: number): S;

  getActors(save: S): ActorView[];
  setActorField(save: S, slot: number, field: ActorField, value: number): S;
  setActorParamPlus(save: S, slot: number, index: number, value: number): S;

  getSwitches(save: S): (boolean | null)[];
  setSwitch(save: S, id: number, value: boolean): S;

  /** Variable values by id (numbers, or strings/arrays set by plugins). */
  getVariables(save: S): Record<number, any>;
  setVariable(save: S, id: number, value: any): S;
}

export interface LoadedSave<S = any> {
  data: S;
  /** Format-specific details needed to write the file back (e.g. which codec it used). */
  meta?: unknown;
}

export interface DatabaseResult {
  database: GameDatabase;
  warnings: string[];
}

export interface SaveFormat<S = any> {
  id: string;
  label: string;
  extensions: readonly string[];
  matches(filePath: string): boolean;
  read(filePath: string): Promise<LoadedSave<S>>;
  write(filePath: string, save: LoadedSave<S>): Promise<void>;
  loadDatabase(saveFilePath: string): Promise<DatabaseResult>;
  /** Game folder name derived from the save path, or null if it can't be determined. */
  gameName(saveFilePath: string): string | null;
  editor: SaveEditor<S>;
}
