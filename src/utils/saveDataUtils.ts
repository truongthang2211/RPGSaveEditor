import { RPGSave } from '../types/RPGSave';
import { SaveData } from '../types/SaveData';

/**
 * Converts an RPGSave object to a SaveData object
 */
export function rpgSaveToSaveData(rpgSave: RPGSave): SaveData {
    // Since the structures are identical, we can safely cast
    return { ...rpgSave } as SaveData;
}

/**
 * Converts a SaveData object to an RPGSave object
 */
export function saveDataToRPGSave(saveData: SaveData): RPGSave {
    // Since the structures are identical, we can safely cast
    return { ...saveData } as RPGSave;
} 