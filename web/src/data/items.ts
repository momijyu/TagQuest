import definitions from './item-catalog.json';
import { record, whole, label } from './catalog-validation';

// Web側の一覧。NFCは名前を保存せず、0〜255のIDで指定する。
export type ItemId = number;
export type CurseType = 'self-damage' | 'no-escape' | 'high-encounter' | 'slip-damage';
export interface WalkingRegen { readonly steps: number; readonly hp: number; readonly mp: number }
export function parseWalkingRegen(value: unknown): WalkingRegen {
  const data = record(value);
  return { steps: whole(data.steps, 1, 255), hp: whole(data.hp, 0, 9999), mp: whole(data.mp, 0, 9999) };
}

export interface ItemDefinition {
  readonly id: ItemId;
  readonly name: string;
  readonly description: string;
  readonly price: number;
  readonly sellPrice: number;
  readonly sellable?: boolean;
  readonly effect?: { readonly type: 'heal-hp' | 'heal-mp' | 'boost-attack' | 'boost-hp' | 'gain-experience' | 'battle-damage'; readonly amount: number }
    | { readonly type: 'cure-poison' | 'battle-escape' }
    | { readonly type: 'battle-blind'; readonly turns: number; readonly missChance: number }
    | { readonly type: 'battle-buff'; readonly turns: number; readonly power: number };
  readonly equipment?: { readonly cursed?: boolean; readonly curseType?: CurseType; readonly experienceRate?: number; readonly walkExperience?: number; readonly walkRegen?: WalkingRegen; readonly roundExperienceUp?: boolean; readonly goldMultiplier?: number; readonly victoryMpRecovery?: number; readonly selfDamageFraction?: number; readonly cannotEscape?: boolean; readonly experienceMultiplier?: number; readonly encounterMultiplier?: number; readonly curseDamage?: number; readonly slot: EquipmentSlot; readonly hp?: number; readonly mp?: number; readonly magic?: number; readonly mpCostReduction?: number; readonly evasionChance?: number; readonly metalPiercing?: boolean; readonly criticalChance?: number; readonly poisonImmune?: boolean; readonly stunChance?: number; readonly dragonMultiplier?: number; readonly attack: number; readonly defense: number; readonly requiredLevel?: number };
}
export const equipmentSlots = ['weapon', 'armor', 'shield', 'accessory', 'head'] as const;
export type EquipmentSlot = typeof equipmentSlots[number];
export const slotNames: Record<EquipmentSlot, string> = { weapon: '武器', armor: '鎧', shield: '盾', accessory: '装飾品', head: '頭' };
function bounded(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error('アイテム効果の倍率・確率が不正です。');
  return value;
}
export const isBattleItem = (item: ItemDefinition | undefined): boolean => Boolean(item?.effect && ['heal-hp','heal-mp','cure-poison','battle-damage','battle-blind','battle-escape','battle-buff'].includes(item.effect.type));
export const isFieldItem = (item: ItemDefinition): boolean => Boolean(item.effect && !item.effect.type.startsWith('battle-'));
export function parseItemCatalog(value: unknown): readonly ItemDefinition[] {
  if (!Array.isArray(value) || !value.length) throw new Error('アイテム一覧を設定してください。');
  const seen = new Set<number>();
  return value.map(entry => {
    const data = record(entry), id = whole(data.id, 0, 255);
    if (typeof data.name === 'string' && /[()（）]/u.test(data.name)) throw new Error('アイテム名・装備名は併記のない単一名称にしてください。');
    if (seen.has(id)) throw new Error('アイテムIDが重複しています。');
    seen.add(id);
    const item: { id: number; name: string; description: string; price: number; sellPrice: number; sellable?: boolean; effect?: ItemDefinition['effect']; equipment?: ItemDefinition['equipment'] } = {
      id, name: label(data.name), description: label(data.description), price: whole(data.price), sellPrice: whole(data.sellPrice),
    };
    if (data.sellable !== undefined) {
      if (typeof data.sellable !== 'boolean') throw new Error('売却可否はtrue/falseで設定してください。');
      item.sellable = data.sellable;
    }
    if (item.sellPrice > item.price) throw new Error('売値は買値以下にしてください。');
    if (data.effect !== undefined && data.equipment !== undefined) throw new Error('使用効果と装備は同時に設定できません。');
    if (data.effect !== undefined) {
      const effect = record(data.effect);
      if (['heal-hp', 'heal-mp', 'boost-attack', 'boost-hp', 'gain-experience', 'battle-damage'].includes(String(effect.type))) item.effect = { type: effect.type as 'heal-hp' | 'heal-mp' | 'boost-attack' | 'boost-hp' | 'gain-experience' | 'battle-damage', amount: whole(effect.amount, 1, 9999) };
      else if (effect.type === 'cure-poison' || effect.type === 'battle-escape') item.effect = { type: effect.type };
      else if (effect.type === 'battle-blind') item.effect = { type: effect.type, turns: whole(effect.turns, 1, 9), missChance: bounded(effect.missChance, 0, 1) };
      else if (effect.type === 'battle-buff') item.effect = { type: effect.type, turns: whole(effect.turns, 1, 9), power: bounded(effect.power, 1, 10) };
      else throw new Error('アイテムの効果が不明です。');
    }
    if (data.equipment !== undefined) {
      const gear = record(data.equipment);
      if (gear.cursed !== undefined && typeof gear.cursed !== 'boolean') throw new Error('呪い装備はtrue/falseで設定してください。');
      if (gear.cursed === true ? !['self-damage','no-escape','high-encounter','slip-damage'].includes(String(gear.curseType)) : gear.curseType !== undefined) throw new Error('呪い装備の種類が不正です。');
      if (gear.experienceRate !== undefined && gear.experienceMultiplier !== undefined && gear.experienceRate !== gear.experienceMultiplier) throw new Error('経験値倍率の指定が一致しません。');
      if (!equipmentSlots.includes(gear.slot as EquipmentSlot)) throw new Error('装備部位が不明です。');
      if (gear.metalPiercing !== undefined && typeof gear.metalPiercing !== 'boolean') throw new Error('メタル特効はtrue/falseで設定してください。');
      if (gear.poisonImmune !== undefined && typeof gear.poisonImmune !== 'boolean') throw new Error('毒無効はtrue/falseで設定してください。');
      if (gear.cannotEscape !== undefined && typeof gear.cannotEscape !== 'boolean') throw new Error('逃走不可はtrue/falseで設定してください。');
      if (gear.roundExperienceUp !== undefined && typeof gear.roundExperienceUp !== 'boolean') throw new Error('経験値切り上げはtrue/falseで設定してください。');
      for (const [key, min, max] of [['criticalChance',0,1],['evasionChance',0,1],['stunChance',0,1],['dragonMultiplier',1,10]] as const) if (gear[key] !== undefined && (typeof gear[key] !== 'number' || !Number.isFinite(gear[key]) || (gear[key] as number) < min || (gear[key] as number) > max)) throw new Error('装備効果の倍率・確率が不正です。');
      item.equipment = {
        ...(gear.cursed === undefined ? {} : { cursed: gear.cursed as boolean }),
        ...(gear.curseType === undefined ? {} : { curseType: gear.curseType as CurseType }),
        ...(gear.experienceRate === undefined ? {} : { experienceRate: bounded(gear.experienceRate, 1, 10) }),
        ...(gear.walkExperience === undefined ? {} : { walkExperience: whole(gear.walkExperience, 0, 9999) }),
        ...(gear.walkRegen === undefined ? {} : { walkRegen: parseWalkingRegen(gear.walkRegen) }),
        ...(gear.roundExperienceUp === undefined ? {} : { roundExperienceUp: gear.roundExperienceUp as boolean }),
        ...(gear.goldMultiplier === undefined ? {} : { goldMultiplier: bounded(gear.goldMultiplier, 1, 10) }),
        ...(gear.victoryMpRecovery === undefined ? {} : { victoryMpRecovery: whole(gear.victoryMpRecovery, 0, 9999) }),
        ...(gear.selfDamageFraction === undefined ? {} : { selfDamageFraction: bounded(gear.selfDamageFraction, 0, 1) }),
        ...(gear.cannotEscape === undefined ? {} : { cannotEscape: gear.cannotEscape as boolean }),
        ...(gear.experienceMultiplier === undefined && gear.experienceRate === undefined ? {} : { experienceMultiplier: bounded(gear.experienceMultiplier ?? gear.experienceRate, 1, 10) }),
        ...(gear.encounterMultiplier === undefined ? {} : { encounterMultiplier: bounded(gear.encounterMultiplier, 1, 10) }),
        ...(gear.curseDamage === undefined ? {} : { curseDamage: whole(gear.curseDamage, 0, 9999) }), ...(gear.metalPiercing === undefined ? {} : { metalPiercing: gear.metalPiercing as boolean }), ...(gear.criticalChance === undefined ? {} : { criticalChance: gear.criticalChance as number }), ...(gear.poisonImmune === undefined ? {} : { poisonImmune: gear.poisonImmune as boolean }), ...(gear.stunChance === undefined ? {} : { stunChance: gear.stunChance as number }), ...(gear.dragonMultiplier === undefined ? {} : { dragonMultiplier: gear.dragonMultiplier as number }), ...(gear.evasionChance === undefined ? {} : { evasionChance: gear.evasionChance as number }), mpCostReduction: whole(gear.mpCostReduction ?? 0, 0, 9999), slot: gear.slot as EquipmentSlot, hp: whole(gear.hp ?? 0, 0, 9999), mp: whole(gear.mp ?? 0, 0, 9999), magic: whole(gear.magic ?? 0, 0, 9999), attack: whole(gear.attack, 0, 9999), defense: whole(gear.defense, -9999, 9999), requiredLevel: whole(gear.requiredLevel ?? 1, 1, 99) };
    }
    return item;
  });
}
export const itemCatalog = parseItemCatalog(definitions);
export const findItem = (id: number): ItemDefinition | undefined => itemCatalog.find(item => item.id === id);
