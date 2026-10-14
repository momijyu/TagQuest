import type { SkillDefinition } from '../data/skills';

/** 装備の軽減は呪文だけに適用し、物理特技の消費は変えない。 */
export function skillMpCost(skill: SkillDefinition, reduction = 0): number {
  return skill.kind === 'spell' ? Math.max(1, skill.mpCost - reduction) : skill.mpCost;
}

export function skillMpLabel(skill: SkillDefinition, reduction = 0): string {
  const cost = skillMpCost(skill, reduction);
  return `MP ${cost}${cost === skill.mpCost ? '' : `（通常${skill.mpCost}）`}`;
}
