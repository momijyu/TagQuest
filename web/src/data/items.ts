import definitions from './item-catalog.json';
import { record, whole, label } from './catalog-validation';

// Web側の一覧。NFCは名前を保存せず、0〜255のIDで指定する。
export type ItemId = number;

export interface ItemDefinition {
  readonly id: ItemId;
  readonly name: string;
  readonly description: string;
  readonly price: number;
  readonly sellPrice: number;
  readonly effect?: { readonly type: 'heal-hp' | 'heal-mp'; readonly amount: number } | { readonly type: 'cure-poison' };
  readonly equipment?: { readonly slot: EquipmentSlot; readonly hp?: number; readonly mp?: number; readonly attack: number; readonly defense: number; readonly requiredLevel?: number };
}
export const equipmentSlots = ['weapon', 'armor', 'shield', 'accessory', 'head'] as const;
export type EquipmentSlot = typeof equipmentSlots[number];
export const slotNames: Record<EquipmentSlot, string> = { weapon: '武器', armor: '鎧', shield: '盾', accessory: '装飾品', head: '頭' };
export function parseItemCatalog(value: unknown): readonly ItemDefinition[] {
  if (!Array.isArray(value) || !value.length) throw new Error('アイテム一覧を設定してください。');
  const seen = new Set<number>();
  return value.map(entry => {
    const data = record(entry), id = whole(data.id, 0, 255);
    if (seen.has(id)) throw new Error('アイテムIDが重複しています。');
    seen.add(id);
    const item: { id: number; name: string; description: string; price: number; sellPrice: number; effect?: ItemDefinition['effect']; equipment?: ItemDefinition['equipment'] } = {
      id, name: label(data.name), description: label(data.description), price: whole(data.price), sellPrice: whole(data.sellPrice),
    };
    if (item.sellPrice > item.price) throw new Error('売値は買値以下にしてください。');
    if (data.effect !== undefined && data.equipment !== undefined) throw new Error('使用効果と装備は同時に設定できません。');
    if (data.effect !== undefined) {
      const effect = record(data.effect);
      if (effect.type === 'heal-hp' || effect.type === 'heal-mp') item.effect = { type: effect.type, amount: whole(effect.amount, 1, 9999) };
      else if (effect.type === 'cure-poison') item.effect = { type: 'cure-poison' };
      else throw new Error('アイテムの効果が不明です。');
    }
    if (data.equipment !== undefined) {
      const gear = record(data.equipment);
      if (!equipmentSlots.includes(gear.slot as EquipmentSlot)) throw new Error('装備部位が不明です。');
      item.equipment = { slot: gear.slot as EquipmentSlot, hp: whole(gear.hp ?? 0, 0, 9999), mp: whole(gear.mp ?? 0, 0, 9999), attack: whole(gear.attack, 0, 9999), defense: whole(gear.defense, 0, 9999), requiredLevel: whole(gear.requiredLevel ?? 1, 1, 99) };
    }
    return item;
  });
}
export const itemCatalog = parseItemCatalog(definitions);
export const findItem = (id: number): ItemDefinition | undefined => itemCatalog.find(item => item.id === id);
