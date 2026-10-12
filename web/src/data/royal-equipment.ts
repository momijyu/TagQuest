import definition from './royal-equipment.json';
import { findItem } from './items';
import type { EquipmentSlot } from './items';

function gearId(id: number, slot: EquipmentSlot): number {
  if (findItem(id)?.equipment?.slot !== slot) throw new Error('王の装備セットのIDと部位が一致しません。');
  return id;
}
const head = gearId(definition.headItemId, 'head');
const armor = gearId(definition.armorItemId, 'armor');
const weapons = definition.weaponItemIds.map(id => gearId(id, 'weapon'));
if (!weapons.includes(definition.autoWeaponItemId)) throw new Error('王の自動装備の武器がセットにありません。');
export const royalAutoEquipIds = [head, armor, definition.autoWeaponItemId] as const;
export function isRoyalEquipment(id: number): boolean {
  return [head, armor, ...weapons].includes(id);
}
export function wearsRoyalSet(equipment: Readonly<Record<EquipmentSlot, number | null>>): boolean {
  return equipment.head === head && equipment.armor === armor && equipment.weapon !== null && weapons.includes(equipment.weapon);
}

export function wearsAnyRoyalEquipment(equipment: Readonly<Record<EquipmentSlot, number | null>>): boolean {
  return Object.values(equipment).some(id => id !== null && isRoyalEquipment(id));
}
