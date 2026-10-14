import definitions from './skill-catalog.json';
import { record, whole, label } from './catalog-validation';
export interface ScaledSpell { readonly amount: number; readonly magicScale: number; readonly amountRange?: { readonly min: number; readonly max: number } }
export interface SkillDefinition {
  readonly id: number;
  readonly name: string;
  readonly kind: 'technique' | 'spell';
  readonly description: string;
  readonly mpCost: number;
  readonly learnLevel?: number;
  readonly effect: { readonly type: 'physical-damage'; readonly power: number }
    | ({ readonly type: 'magic-damage'; readonly ignoreDefense?: boolean; readonly drainFraction?: number; readonly freeze?: boolean } & ScaledSpell)
    | ({ readonly type: 'heal-hp' } & ScaledSpell)
    | { readonly type: 'return-mark' | 'dungeon-escape' }
    | { readonly type: 'no-encounters'; readonly steps: number }
    | { readonly type: 'magic-barrier'; readonly turns: number; readonly reduction: number };
}
function fraction(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error('魔法の係数が不正です。');
  return value;
}
function flag(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('魔法のフラグはtrue/falseです。');
  return value;
}
export function parseSkillCatalog(value: unknown): readonly SkillDefinition[] {
  if (!Array.isArray(value)) throw new Error('特技・魔法一覧は配列にしてください。');
  const seen = new Set<number>();
  return value.map(entry => {
    const data = record(entry), id = whole(data.id, 0, 255), effect = record(data.effect);
    if (typeof data.name === 'string' && /[()（）]/u.test(data.name)) throw new Error('呪文名・技名は併記のない単一名称にしてください。');
    if (seen.has(id)) throw new Error('特技・魔法IDが重複しています。');
    seen.add(id);
    if (data.kind !== 'technique' && data.kind !== 'spell') throw new Error('技の種類はtechniqueかspellにしてください。');
    let parsed: SkillDefinition['effect'];
    if (effect.type === 'physical-damage' && typeof effect.power === 'number' && Number.isFinite(effect.power) && effect.power > 0 && effect.power <= 10) parsed = { type: effect.type, power: effect.power };
    else if (effect.type === 'magic-damage' || effect.type === 'heal-hp') {
      let amountRange: ScaledSpell['amountRange'];
      if (effect.amountRange !== undefined) {
        const range = record(effect.amountRange), min = whole(range.min, 1, 9999), max = whole(range.max, min, 9999);
        amountRange = { min, max };
      }
      const scaled = { amount: whole(effect.amount, 1, 9999), magicScale: fraction(effect.magicScale ?? (effect.type === 'heal-hp' ? .8 : 1), 0, 10), ...(amountRange ? { amountRange } : {}) };
      parsed = effect.type === 'heal-hp' ? { type: effect.type, ...scaled } : {
        type: effect.type, ...scaled,
        ...(effect.ignoreDefense === undefined ? {} : { ignoreDefense: flag(effect.ignoreDefense) }),
        ...(effect.freeze === undefined ? {} : { freeze: flag(effect.freeze) }),
        ...(effect.drainFraction === undefined ? {} : { drainFraction: fraction(effect.drainFraction, 0, 1) }),
      };
    } else if (data.kind === 'spell' && (effect.type === 'return-mark' || effect.type === 'dungeon-escape')) parsed = { type: effect.type };
    else if (data.kind === 'spell' && effect.type === 'no-encounters') parsed = { type: effect.type, steps: whole(effect.steps, 1, 255) };
    else if (data.kind === 'spell' && effect.type === 'magic-barrier') parsed = { type: effect.type, turns: whole(effect.turns, 1, 9), reduction: fraction(effect.reduction, 0, 1) };
    else throw new Error('技の効果が不明か、倍率が不正です。');
    return { id, name: label(data.name), kind: data.kind, description: label(data.description), mpCost: whole(data.mpCost, 0, 9999), learnLevel: whole(data.learnLevel ?? 1, 1, 99), effect: parsed };
  });
}
export const skillCatalog = parseSkillCatalog(definitions);
export const findSkill = (id: number) => skillCatalog.find(skill => skill.id === id);
export const isFieldSpell = (skill: SkillDefinition) => skill.kind === 'spell' && ['heal-hp', 'return-mark', 'dungeon-escape', 'no-encounters'].includes(skill.effect.type);
export const isBattleSkill = (skill: SkillDefinition) => ['physical-damage', 'magic-damage', 'heal-hp', 'magic-barrier'].includes(skill.effect.type);
