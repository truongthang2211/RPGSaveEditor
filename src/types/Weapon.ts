export type Trait = {
  code: number;
  dataId: number;
  value: number;
};
export interface WeaponData {
  id: number;
  animationId: number;
  description: string;
  etypeId: number;
  traits: Trait[];
  iconIndex: number;
  name: string;
  note: string;
  params: number[]; // Array of 8 numbers representing parameters
  price: number;
  wtypeId: number;

}