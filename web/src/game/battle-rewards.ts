/** 戦闘の経験値だけに装備倍率を適用する。種や経験値の書には適用しない。 */
export const battleExperience = (base: number, multiplier = 1, roundUp = false): number => (roundUp ? Math.ceil : Math.floor)(base * multiplier);
export const battleGold = (base: number, multiplier = 1): number => Math.floor(base * multiplier);
