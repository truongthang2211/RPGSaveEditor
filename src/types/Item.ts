type Damage = {
  critical: boolean;
  elementId: number;
  formula: string;
  type: number;
  variance: number;
};

type Effect = {
  code: number;
  dataId: number;
  value1: number;
  value2: number;
};

export interface ItemData {
  id: number;
  animationId: number;
  consumable: boolean;
  damage: Damage;
  description: string;
  effects: Effect[];
  hitType: number;
  iconIndex: number;
  itypeId: number;
  name: string;
  note: string;
  occasion: number;
  price: number;
  repeats: number;
  scope: number;
  speed: number;
  successRate: number;
  tpGain: number;
}