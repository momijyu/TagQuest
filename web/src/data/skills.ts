import definitions from './skill-catalog.json';
import { record, whole, label } from './catalog-validation';
export interface SkillDefinition {
  readonly id: number;
  readonly name: string;
  readonly kind: 'technique' | 'spell';
  readonly description: string;
  readonly mpCost: number;
  readonly learnLevel?: number;
  readonly effect: { readonly type: 'physical-damage'; readonly power: number }
    | { readonly type: 'magic-damage' | 'heal-hp'; readonly amount: number };
}
export function parseSkillCatalog(value: unknown): readonly SkillDefinition[] {
  if (!Array.isArray(value)) throw new Error('特技・魔法一覧は配列にしてください。');
  const seen = new Set<number>();
  return value.map(entry => {
    const data = record(entry), id = whole(data.id, 0, 255), effect = record(data.effect);
    if (seen.has(id)) throw new Error('特技・魔法IDが重複しています。');
    seen.add(id);
    if (data.kind !== 'technique' && data.kind !== 'spell') throw new Error('技の種類はtechniqueかspellにしてください。');
    let parsed: SkillDefinition['effect'];
    if (effect.type === 'physical-damage' && typeof effect.power === 'number' && Number.isFinite(effect.power) && effect.power > 0 && effect.power <= 10) parsed = { type: effect.type, power: effect.power };
    else if (effect.type === 'magic-damage' || effect.type === 'heal-hp') parsed = { type: effect.type, amount: whole(effect.amount, 1, 9999) };
    else throw new Error('技の効果が不明か、倍率が不正です。');
    return { id, name: label(data.name), kind: data.kind, description: label(data.description), mpCost: whole(data.mpCost, 0, 9999), learnLevel: whole(data.learnLevel ?? 1, 1, 99), effect: parsed };
  });
}
export const skillCatalog = parseSkillCatalog(definitions);
export const findSkill = (id: number) => skillCatalog.find(skill => skill.id === id);
