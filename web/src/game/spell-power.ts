import type { ScaledSpell } from '../data/skills';

/** One draw per successful cast, after eligibility checks. Rendering never draws random numbers. */
export function spellPower(effect: ScaledSpell, magic: number, random: () => number = Math.random): number {
  const draw = random();
  const base = effect.amountRange
    ? effect.amountRange.min + Math.floor(draw * (effect.amountRange.max - effect.amountRange.min + 1))
    : Math.floor(effect.amount * (.85 + draw * .3));
  return base + Math.floor(magic * effect.magicScale);
}
