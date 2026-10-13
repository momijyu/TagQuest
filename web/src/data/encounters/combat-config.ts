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
  | { readonly type: 'heal'; readonly text: string; readonly amount: number }
  | { readonly type: 'attack' | 'magic-attack'; readonly text: string; readonly power: number; readonly speech?: string; readonly inflictPoison?: boolean };
export interface EnemyDefinition {
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
    if (data.type === 'heal') return { type: 'heal', text, amount: whole(data.amount, 1, 9999) };
    if ((data.type === 'attack' || data.type === 'magic-attack') && typeof data.power === 'number' && Number.isFinite(data.power) && data.power > 0 && data.power <= 10) {
      return { type: data.type, text, power: data.power,
        ...(data.inflictPoison === undefined ? {} : { inflictPoison: boolean(data.inflictPoison) }),
        ...(data.speech === undefined ? {} : { speech: validateCustomDialogue(data.speech) }) };
    }
    throw new Error('敵の行動はsay・escape・heal・attack・magic-attackを設定してください。攻撃倍率は0より大きく10以下です。');
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
    return { id, ...(data.royalEquipmentWarning === undefined ? {} : { royalEquipmentWarning: validateCustomDialogue(data.royalEquipmentWarning) }), name: validateCustomDialogue(data.name), characterId: validateCustomDialogue(data.characterId), stats: stats(data.stats),
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
  if (typeof data.guardMultiplier !== 'number' || !Number.isFinite(data.guardMultiplier) || data.guardMultiplier <= 0 || data.guardMultiplier > 1) throw new Error('防御時の倍率は0より大きく1以下にしてください。');
  const initial = parseReward({ gold: data.initialGold ?? 0, items: data.initialItems ?? [] })!;
  const rawSkills = data.skills ?? [];
  if (!Array.isArray(rawSkills)) throw new Error('習得技はIDの配列で設定してください。');
  const skills = rawSkills.map(id => whole(id, 0, 255));
  if (new Set(skills).size !== skills.length || skills.some(id => !findSkill(id))) throw new Error('習得技IDが不明か重複しています。');
  const initialExperience = whole(data.initialExperience ?? 0, 0, maximumExperience);
  const defeatGoldLossPercent = whole(data.defeatGoldLossPercent ?? 50, 0, 100);
  return { name: validateCustomDialogue(data.name), stats: stats(data.stats), guardMultiplier: data.guardMultiplier,
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
