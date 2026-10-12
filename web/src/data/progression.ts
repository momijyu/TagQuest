import definition from './progression-config.json';
import { record, whole } from './catalog-validation';
export const maximumLevel = 99;
export const maximumExperience = 999999999;
export interface ProgressionDefinition {
  readonly levelThresholds: readonly number[];
  readonly growthPerLevel: { readonly hp: number; readonly mp: number; readonly attack: number; readonly defense: number };
}
export function parseProgression(value: unknown): ProgressionDefinition {
  const data = record(value), growth = record(data.growthPerLevel);
  if (!Array.isArray(data.levelThresholds) || !data.levelThresholds.length || data.levelThresholds.length > maximumLevel) throw new Error('レベル必要経験値は1〜99件にしてください。');
  const thresholds = data.levelThresholds.map(value => whole(value, 0, maximumExperience));
  if (thresholds[0] !== 0 || thresholds.some((value, index) => index > 0 && value <= thresholds[index - 1])) throw new Error('レベル必要経験値は0から始め、前のレベルより大きくしてください。');
  return { levelThresholds: thresholds, growthPerLevel: { hp: whole(growth.hp, 0, 9999), mp: whole(growth.mp, 0, 9999), attack: whole(growth.attack, 0, 9999), defense: whole(growth.defense, 0, 9999) } };
}
export const progressionConfig = parseProgression(definition);
export function levelForExperience(experience: number, config = progressionConfig): number {
  whole(experience, 0, maximumExperience);
  return config.levelThresholds.filter(threshold => threshold <= experience).length;
}
