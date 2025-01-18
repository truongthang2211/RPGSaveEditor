import { Trait } from "./Weapon";

export interface ArmorData {
  id: number;
  atypeId: number;
  description: string;
  etypeId: number;
  traits: Trait[];
  iconIndex: number;
  name: string;
  note: string;
  params: number[]; // Array of 8 numbers representing parameters
  price: number;
}