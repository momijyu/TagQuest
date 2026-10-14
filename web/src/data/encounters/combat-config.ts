import { parseWalkingRegen } from '../items';
import type { WalkingRegen } from '../items';
import { wearsAnyRoyalEquipment, wearsRoyalSet } from '../royal-equipment';
import type { EquipmentSlot } from '../items';
import enemyDefinitions from './enemy-definitions';
import playerDefinition from './player-config.json';
import { validateCustomDialogue } from '../interactions';
import { findItem } from '../items';
import { record, whole } from '../catalog-validation';
import { findSkill } from '../skills';
import { levelForExperience, maximumExperience } from '../progression';
import illustrationIds from './enemy-illustration-ids.json';

export interface VictoryReward { readonly gold: number; readonly experience?: number; readonly items: readonly { readonly itemId: number; readonly quantity: number }[] }
export function parseReward(value: unknown): VictoryReward | null {
  if (value == null) return null;
  const data = record(value);
  if (!Array.isArray(data.items)) throw new Error('報酬アイテムは配列にしてください。');
  const seen = new Set<number>();
  const items = data.items.map(entry => {
    const item = record(entry), itemId = whole(item.itemId, 0, 255);
    if (!findItem(itemId) || seen.has(itemId)) throw new Error('報酬アイテムが不明か重複しています。');
    seen.add(itemId);
    return { itemId, quantity: whole(item.quantity, 1, 9999) };
  });
  return { gold: whole(data.gold), experience: whole(data.experience ?? 0), items };
}

export interface CombatStats { readonly hp: number; readonly attack: number; readonly defense: number; readonly magic: number }
export type EnemyAction = { readonly type: 'say'; readonly text: string }
  | { readonly type: 'escape'; readonly text: string; readonly chance: number }
  | { readonly type: 'slow'; readonly text: string; readonly turns: number }
  | { readonly type: 'boost-attack'; readonly text: string; readonly power: number; readonly turns: number }
  | { readonly type: 'heal'; readonly text: string; readonly amount: number }
  | { readonly type: 'attack' | 'magic-attack'; readonly text: string; readonly power: number; readonly speech?: string; readonly inflictPoison?: boolean; readonly hits?: number };
export interface EnemyDefinition {
  readonly boss?: boolean;
  readonly family?: 'dragon' | 'beast' | 'insect' | 'slime' | 'undead' | 'stone' | 'metal';
  readonly actionsPerTurn?: number;
  readonly victoryMessage?: string;
  readonly canEscape?: boolean;
  readonly canEscapeBeforeAttacked?: boolean;
  readonly royalEquipmentWarning?: string;
  readonly royalEquipmentPlayerAttackMultiplier?: number;
  readonly royalEquipmentAttack?: { readonly multiplier: number; readonly match: 'any' | 'set' };
  readonly id: number;
  readonly name: string;
  readonly characterId: string;
  readonly battleImage?: string;
  readonly background?: 'castle' | 'grassland' | 'forest' | 'cave' | 'void';
  readonly stats: CombatStats;
  readonly firstAttackedMessage?: string;
  readonly reward?: VictoryReward | null;
  readonly patterns: { readonly beforeAttacked: readonly EnemyAction[]; readonly afterAttacked: readonly EnemyAction[] };
}
export interface PlayerDefinition {
  readonly walkExperience?: number;
  readonly walkRegen?: WalkingRegen;
  readonly roundExperienceUp?: boolean;
  readonly goldMultiplier?: number;
  readonly victoryMpRecovery?: number;
  readonly selfDamageFraction?: number;
  readonly cannotEscape?: boolean;
  readonly experienceMultiplier?: number;
  readonly encounterMultiplier?: number;
  readonly curseDamage?: number;
  readonly mpCostReduction?: number;
  readonly evasionChance?: number;
  readonly criticalChance?: number;
  readonly metalPiercing?: boolean;
  readonly poisonImmune?: boolean;
  readonly stunChance?: number;
  readonly dragonMultiplier?: number;
  readonly name: string;
  readonly stats: CombatStats;
  readonly guardMultiplier: number;
  readonly maxMp?: number;
  readonly initialGold?: number;
  readonly defeatGoldLossPercent?: number;
  readonly initialItems?: readonly { readonly itemId: number; readonly quantity: number }[];
  readonly skills?: readonly number[];
  readonly initialExperience?: number;
  readonly level?: number;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('戦闘configの形式が違います。');
  return value as Record<string, unknown>;
}
function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new Error(`戦闘configの整数は${min}〜${max}にしてください。`);
  return value;
}
function stats(value: unknown): CombatStats {
  const data = object(value);
  return { hp: integer(data.hp, 1, 9999), attack: integer(data.attack, 0, 9999), defense: integer(data.defense, 0, 9999), magic: integer(data.magic ?? 0, 0, 9999) };
}
function pattern(value: unknown): readonly EnemyAction[] {
  if (!Array.isArray(value) || !value.length || value.length > 64) throw new Error('敵の行動パターンは1〜64件にしてください。');
  return value.map(entry => {
    const data = object(entry), text = validateCustomDialogue(data.text);
    if (data.type === 'say') return { type: 'say', text };
    if (data.type === 'escape' && typeof data.chance === 'number' && data.chance >= 0 && data.chance <= 1) return { type: 'escape', text, chance: data.chance };
    if (data.type === 'slow') return { type: 'slow', text, turns: whole(data.turns, 1, 9) };
    if (data.type === 'boost-attack' && typeof data.power === 'number' && Number.isFinite(data.power) && data.power >= 1 && data.power <= 3) return { type: 'boost-attack', text, power: data.power, turns: whole(data.turns, 1, 9) };
    if (data.type === 'heal') return { type: 'heal', text, amount: whole(data.amount, 1, 9999) };
    if ((data.type === 'attack' || data.type === 'magic-attack') && typeof data.power === 'number' && Number.isFinite(data.power) && data.power > 0 && data.power <= 10) {
      return { type: data.type, text, power: data.power, ...(data.hits === undefined ? {} : { hits: whole(data.hits, 1, 3) }),
        ...(data.inflictPoison === undefined ? {} : { inflictPoison: boolean(data.inflictPoison) }),
        ...(data.speech === undefined ? {} : { speech: validateCustomDialogue(data.speech) }) };
    }
    throw new Error('敵の行動はsay・escape・heal・attack・magic-attack・slow・boost-attackを設定してください。攻撃倍率は0より大きく10以下です。');
  });
}
function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('戦闘configのフラグはtrueかfalseにしてください。');
  return value;
}
function royalAttack(value: unknown): NonNullable<EnemyDefinition['royalEquipmentAttack']> {
  const data = object(value);
  if (typeof data.multiplier !== 'number' || !Number.isFinite(data.multiplier) || data.multiplier < 1 || data.multiplier > 1000 || data.match !== 'any' && data.match !== 'set') throw new Error('王の装備への攻撃倍率は1〜1000、条件はanyかsetにしてください。');
  return { multiplier: data.multiplier, match: data.match as 'any' | 'set' };
}
function royalPlayerAttack(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) throw new Error('王の装備の攻撃ボーナス倍率は0〜1にしてください。');
  return value;
}
export function parseEnemyDefinitions(value: unknown): readonly EnemyDefinition[] {
  if (!Array.isArray(value) || !value.length) throw new Error('敵一覧を設定してください。');
  const seen = new Set<number>();
  return value.map(entry => {
    const data = object(entry), id = integer(data.id, 0, 255), patterns = object(data.patterns);
    if (seen.has(id)) throw new Error('敵IDが重複しています。');
    seen.add(id);
    if (data.battleImage !== undefined && (typeof data.battleImage !== 'string' || !illustrationIds.includes(data.battleImage))) throw new Error('敵の戦闘画像IDが不明です。');
    if (data.background !== undefined && (typeof data.background !== 'string' || !['castle', 'grassland', 'forest', 'cave', 'void'].includes(data.background))) throw new Error('戦闘背景はcastle・grassland・forest・cave・voidを指定してください。');
    if (data.family !== undefined && !['dragon','beast','insect','slime','undead','stone','metal'].includes(String(data.family))) throw new Error('敵の種族が不正です。');
    return { id, ...(data.boss === undefined ? {} : { boss: boolean(data.boss) }), ...(data.family === undefined ? {} : { family: data.family as EnemyDefinition['family'] }), ...(data.royalEquipmentWarning === undefined ? {} : { royalEquipmentWarning: validateCustomDialogue(data.royalEquipmentWarning) }), name: validateCustomDialogue(data.name), characterId: validateCustomDialogue(data.characterId), stats: stats(data.stats),
      ...(data.actionsPerTurn === undefined ? {} : { actionsPerTurn: whole(data.actionsPerTurn, 1, 4) }),
      ...(data.victoryMessage === undefined ? {} : { victoryMessage: validateCustomDialogue(data.victoryMessage) }),
      ...(data.canEscape === undefined ? {} : { canEscape: boolean(data.canEscape) }),
      ...(data.canEscapeBeforeAttacked === undefined ? {} : { canEscapeBeforeAttacked: boolean(data.canEscapeBeforeAttacked) }),
      ...(data.battleImage === undefined ? {} : { battleImage: data.battleImage as string }),
      background: (data.background ?? 'castle') as EnemyDefinition['background'],
      ...(data.firstAttackedMessage === undefined ? {} : { firstAttackedMessage: validateCustomDialogue(data.firstAttackedMessage) }),
      ...(data.royalEquipmentAttack === undefined ? {} : { royalEquipmentAttack: royalAttack(data.royalEquipmentAttack) }),
      ...(data.royalEquipmentPlayerAttackMultiplier === undefined ? {} : { royalEquipmentPlayerAttackMultiplier: royalPlayerAttack(data.royalEquipmentPlayerAttackMultiplier) }),
      reward: parseReward(data.reward),
      patterns: { beforeAttacked: pattern(patterns.beforeAttacked), afterAttacked: pattern(patterns.afterAttacked) } };
  });
}
export function parsePlayerDefinition(value: unknown): PlayerDefinition {
  const data = object(value);
  if (data.cannotEscape !== undefined) boolean(data.cannotEscape);
  if (data.roundExperienceUp !== undefined) boolean(data.roundExperienceUp);
  if (data.walkExperience !== undefined) whole(data.walkExperience, 0, 9999);
  if (data.victoryMpRecovery !== undefined) whole(data.victoryMpRecovery, 0, 9999);
  if (data.curseDamage !== undefined) whole(data.curseDamage, 0, 9999);
  for (const [key,min,max] of [['selfDamageFraction',0,1],['experienceMultiplier',1,10],['encounterMultiplier',1,10],['goldMultiplier',1,10]] as const) if(data[key] !== undefined && (typeof data[key] !== 'number' || !Number.isFinite(data[key]) || (data[key] as number)<min || (data[key] as number)>max)) throw new Error('主人公の呪い・報酬倍率が不正です。');
  if (data.mpCostReduction !== undefined) whole(data.mpCostReduction, 0, 99999);
  if (data.evasionChance !== undefined && (typeof data.evasionChance !== 'number' || !Number.isFinite(data.evasionChance) || data.evasionChance < 0 || data.evasionChance > 1)) throw new Error('回避率は0〜1です。');
  if (typeof data.guardMultiplier !== 'number' || !Number.isFinite(data.guardMultiplier) || data.guardMultiplier <= 0 || data.guardMultiplier > 1) throw new Error('防御時の倍率は0より大きく1以下にしてください。');
  if (data.criticalChance !== undefined && (typeof data.criticalChance !== 'number' || !Number.isFinite(data.criticalChance) || data.criticalChance < 0 || data.criticalChance > 1)) throw new Error('会心率は0〜1です。');
  if (data.metalPiercing !== undefined && typeof data.metalPiercing !== 'boolean') throw new Error('メタル特効はtrue/falseです。');
  if (data.poisonImmune !== undefined && typeof data.poisonImmune !== 'boolean') throw new Error('毒無効はtrue/falseで設定してください。');
  for (const [key,min,max] of [['stunChance',0,1],['dragonMultiplier',1,10]] as const) if(data[key] !== undefined && (typeof data[key] !== 'number' || !Number.isFinite(data[key]) || (data[key] as number)<min || (data[key] as number)>max)) throw new Error('主人公の装備効果が不正です。');
  const initial = parseReward({ gold: data.initialGold ?? 0, items: data.initialItems ?? [] })!;
  const rawSkills = data.skills ?? [];
  if (!Array.isArray(rawSkills)) throw new Error('習得技はIDの配列で設定してください。');
  const skills = rawSkills.map(id => whole(id, 0, 255));
  if (new Set(skills).size !== skills.length || skills.some(id => !findSkill(id))) throw new Error('習得技IDが不明か重複しています。');
  const initialExperience = whole(data.initialExperience ?? 0, 0, maximumExperience);
  const defeatGoldLossPercent = whole(data.defeatGoldLossPercent ?? 50, 0, 100);
  return {
    ...(data.walkExperience === undefined ? {} : { walkExperience: data.walkExperience as number }),
    ...(data.walkRegen === undefined ? {} : { walkRegen: parseWalkingRegen(data.walkRegen) }),
    ...(data.roundExperienceUp === undefined ? {} : { roundExperienceUp: data.roundExperienceUp as boolean }),
    ...(data.goldMultiplier === undefined ? {} : { goldMultiplier: data.goldMultiplier as number }),
    ...(data.victoryMpRecovery === undefined ? {} : { victoryMpRecovery: data.victoryMpRecovery as number }), ...(data.selfDamageFraction === undefined ? {} : { selfDamageFraction: data.selfDamageFraction as number }),
    ...(data.cannotEscape === undefined ? {} : { cannotEscape: data.cannotEscape as boolean }),
    ...(data.experienceMultiplier === undefined ? {} : { experienceMultiplier: data.experienceMultiplier as number }),
    ...(data.encounterMultiplier === undefined ? {} : { encounterMultiplier: data.encounterMultiplier as number }),
    ...(data.curseDamage === undefined ? {} : { curseDamage: data.curseDamage as number }), ...(data.mpCostReduction === undefined ? {} : { mpCostReduction: data.mpCostReduction as number }), ...(data.evasionChance === undefined ? {} : { evasionChance: data.evasionChance as number }), ...(data.criticalChance===undefined?{}:{criticalChance:data.criticalChance as number}), ...(data.metalPiercing===undefined?{}:{metalPiercing:data.metalPiercing as boolean}), ...(data.poisonImmune===undefined?{}:{poisonImmune:data.poisonImmune as boolean}), ...(data.stunChance===undefined?{}:{stunChance:data.stunChance as number}), ...(data.dragonMultiplier===undefined?{}:{dragonMultiplier:data.dragonMultiplier as number}), name: validateCustomDialogue(data.name), stats: stats(data.stats), guardMultiplier: data.guardMultiplier,
    maxMp: whole(data.maxMp ?? 0, 0, 9999), initialGold: initial.gold, defeatGoldLossPercent, initialItems: initial.items, skills, initialExperience, level: levelForExperience(initialExperience) };
}
export const enemyCatalog = parseEnemyDefinitions(enemyDefinitions);
export const playerConfig = parsePlayerDefinition(playerDefinition);
export const findEnemy = (id: number) => enemyCatalog.find(enemy => enemy.id === id);

/** 会話と戦闘開始で、現在の装備に対応したヒントを共用する。 */
export function royalEquipmentWarning(enemy: EnemyDefinition, equipment: Readonly<Record<EquipmentSlot, number | null>>): string | null {
  const condition = enemy.royalEquipmentAttack;
  if (!condition || condition.multiplier <= 1 || !(condition.match === 'any' ? wearsAnyRoyalEquipment(equipment) : wearsRoyalSet(equipment))) return null;
  return enemy.royalEquipmentWarning ?? null;
}
