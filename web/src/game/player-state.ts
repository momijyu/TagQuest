import { findItem, equipmentSlots } from '../data/items';
import type { ItemDefinition, EquipmentSlot } from '../data/items';
import { playerConfig } from '../data/encounters/combat-config';
import type { PlayerDefinition, VictoryReward, EnemyDefinition } from '../data/encounters/combat-config';
import { whole } from '../data/catalog-validation';
import { findSkill } from '../data/skills';
import { levelForExperience, progressionConfig, maximumExperience } from '../data/progression';
import type { ProgressionDefinition } from '../data/progression';
import { royalAutoEquipIds, wearsRoyalSet, isRoyalEquipment } from '../data/royal-equipment';
import { findExchangeRecipe } from '../data/exchanges';

export interface ActionResult { readonly ok: boolean; readonly message: string }
export interface Vitals { readonly hp: number; readonly mp: number; readonly poisoned: boolean }
export function recoverItem(item: ItemDefinition, vitals: Vitals, maxHp: number, maxMp: number): ActionResult & { readonly vitals: Vitals } {
  const next = { ...vitals }, effect = item.effect;
  let message = 'このアイテムは使えない。';
  if (effect?.type === 'heal-hp' && next.hp < maxHp && next.hp > 0) {
    const amount = Math.min(effect.amount, maxHp - next.hp); next.hp += amount; message = `HPが${amount}回復した！`;
  } else if (effect?.type === 'heal-mp' && next.mp < maxMp) {
    const amount = Math.min(effect.amount, maxMp - next.mp); next.mp += amount; message = `MPが${amount}回復した！`;
  } else if (effect?.type === 'cure-poison' && next.poisoned) {
    next.poisoned = false; message = '毒が治った！';
  } else return { ok: false, message: effect ? '今は使う必要がない。' : message, vitals };
  return { ok: true, message: `${item.name}を使った！\n${message}`, vitals: next };
}

/** 所持品は装備中の1個も含む。装備の切り替えで個数を増減させない。 */
export function createPlayerState(definition: PlayerDefinition = playerConfig, progression: ProgressionDefinition = progressionConfig) {
  const base = structuredClone(definition);
  const defeatGoldLossPercent = whole(base.defeatGoldLossPercent ?? 50, 0, 100);
  let experience = base.initialExperience ?? 0;
  let level = levelForExperience(experience, progression);
  function grownStats() {
    const growth = progression.growthPerLevel, steps = level - 1;
    return { hp: Math.min(9999, base.stats.hp + steps * growth.hp), mp: Math.min(9999, (base.maxMp ?? 0) + steps * growth.mp),
      attack: Math.min(9999, base.stats.attack + steps * growth.attack), defense: Math.min(9999, base.stats.defense + steps * growth.defense) };
  }
  const learned = () => (base.skills ?? []).filter(id => (findSkill(id)?.learnLevel ?? 1) <= level);
  let gold = base.initialGold ?? 0;
  let vitals: Vitals = { hp: grownStats().hp, mp: grownStats().mp, poisoned: false };
  const inventory = new Map<number, number>();
  const discovered = new Set<number>();
  const equipment: Record<EquipmentSlot, number | null> = { weapon: null, armor: null, shield: null, accessory: null, head: null };
  function addItem(itemId: number, quantity: number): void {
    if (!findItem(itemId)) throw new Error('アイテムIDが不明です。');
    whole(quantity, 1, Number.MAX_SAFE_INTEGER);
    const count = (inventory.get(itemId) ?? 0) + quantity;
    whole(count, 1, Number.MAX_SAFE_INTEGER); inventory.set(itemId, count); discovered.add(itemId);
  }
  function consume(itemId: number): boolean {
    const count = inventory.get(itemId) ?? 0;
    if (count <= 0 || count === 1 && Object.values(equipment).includes(itemId)) return false;
    if (count === 1) inventory.delete(itemId); else inventory.set(itemId, count - 1);
    return true;
  }
  function effectiveStats(royalAttackMultiplier = 1) {
    const stats = grownStats();
    let royalAttackBonus = 0;
    for (const id of Object.values(equipment)) if (id !== null) {
      const gear = findItem(id)!.equipment!;
      stats.hp += gear.hp ?? 0; stats.mp += gear.mp ?? 0;
      if (isRoyalEquipment(id)) royalAttackBonus += gear.attack;
      else stats.attack += gear.attack;
      stats.defense += gear.defense;
    }
    stats.attack += Math.floor(royalAttackBonus * royalAttackMultiplier);
    return { hp: Math.min(9999, stats.hp), mp: Math.min(9999, stats.mp), attack: Math.min(9999, stats.attack), defense: Math.min(9999, stats.defense) };
  }
  function effective(royalAttackMultiplier = 1): PlayerDefinition {
    const stats = effectiveStats(royalAttackMultiplier);
    return { ...base, level, maxMp: stats.mp, skills: learned(), stats: { hp: stats.hp, attack: stats.attack, defense: stats.defense } };
  }
  function clampVitals(): void {
    const stats = effectiveStats();
    // 付け外しでは回復させず、上限を超えた現在値だけ収める。
    vitals = { ...vitals, hp: Math.min(vitals.hp, stats.hp), mp: Math.min(vitals.mp, stats.mp) };
  }
  function gainExperience(amount: number) {
    whole(amount);
    const previousLevel = level, previousStats = effectiveStats(), previousSkills = learned();
    experience = Math.min(maximumExperience, experience + amount);
    level = levelForExperience(experience, progression);
    const nextStats = effectiveStats();
    // 上限が増えた分だけ現在値も増やし、残りの回復必要量は維持する。
    vitals = { ...vitals, hp: Math.min(nextStats.hp, vitals.hp + nextStats.hp - previousStats.hp), mp: Math.min(nextStats.mp, vitals.mp + nextStats.mp - previousStats.mp) };
    return { previousLevel, level, learnedSkills: learned().filter(id => !previousSkills.includes(id)) };
  }
  for (const item of base.initialItems ?? []) addItem(item.itemId, item.quantity);
  return {
    get gold() { return gold; },
    get level() { return level; },
    get experience() { return experience; },
    get nextLevelExperience() { return progression.levelThresholds[level] ?? null; },
    get skillSchedule() { return (base.skills ?? []).map(id => ({ id, learnLevel: findSkill(id)?.learnLevel ?? 1, learned: learned().includes(id) })); },
    get vitals() { return { ...vitals }; },
    get definition() { return effective(); },
    battleDefinition(enemy: EnemyDefinition): PlayerDefinition { return effective(enemy.royalEquipmentPlayerAttackMultiplier ?? 1); },
    get baseStats() { return grownStats(); },
    get equipment() { return { ...equipment }; },
    get appearance(): 'hero' | 'king' { return wearsRoyalSet(equipment) ? 'king' : 'hero'; },
    get inventory() { return [...inventory].map(([itemId, count]) => ({ itemId, count })); },
    get discoveredItems() { return [...discovered].sort((a, b) => a - b); },
    addItem, consume, gainExperience,
    applyDefeatPenalty(): number {
      const percent = defeatGoldLossPercent;
      // Split before multiplication to remain exact even at the safe-integer gold cap.
      const lost = Math.floor(gold / 100) * percent + Math.ceil(gold % 100 * percent / 100);
      gold -= lost;
      return lost;
    },
    setVitals(next: Vitals): void {
      const stats = effectiveStats();
      whole(next.hp, 0, stats.hp); whole(next.mp, 0, stats.mp);
      if (typeof next.poisoned !== 'boolean') throw new Error('毒状態が不正です。');
      vitals = { ...next };
    },
    grantReward(reward: VictoryReward | null | undefined) {
      if (!reward) return;
      whole(reward.gold);
      whole(reward.experience ?? 0);
      whole(gold + reward.gold, 0, Number.MAX_SAFE_INTEGER);
      for (const { itemId, quantity } of reward.items) {
        if (!findItem(itemId)) throw new Error('報酬アイテムが不明です。');
        whole(quantity, 1, Number.MAX_SAFE_INTEGER); whole((inventory.get(itemId) ?? 0) + quantity, 1, Number.MAX_SAFE_INTEGER);
      }
      gold += reward.gold;
      reward.items.forEach(({ itemId, quantity }) => addItem(itemId, quantity));
      return gainExperience(reward.experience ?? 0);
    },
    buy(itemId: number): ActionResult {
      const item = findItem(itemId);
      if (!item) return { ok: false, message: '商品が見つからない。' };
      if (gold < item.price) return { ok: false, message: 'お金が足りない。' };
      if (!Number.isSafeInteger((inventory.get(itemId) ?? 0) + 1)) return { ok: false, message: 'これ以上持てない。' };
      addItem(itemId, 1); gold -= item.price;
      return { ok: true, message: `${item.name}を買った！` };
    },
    exchange(recipeId: number): ActionResult {
      const recipe = findExchangeRecipe(recipeId);
      if (!recipe) return { ok: false, message: '交換レシピが見つからない。' };
      // 全条件を確認してからまとめて更新し、失敗時は何も消費しない。
      for (const { itemId, quantity } of recipe.ingredients) {
        const count = inventory.get(itemId) ?? 0, equipped = Object.values(equipment).includes(itemId) ? 1 : 0;
        if (count < quantity) return { ok: false, message: `${findItem(itemId)!.name}が${quantity - count}個足りない。` };
        if (count - equipped < quantity) return { ok: false, message: `${findItem(itemId)!.name}を装備から外してから交換してください。` };
      }
      if (gold < recipe.gold) return { ok: false, message: '交換のお金が足りない。' };
      const result = recipe.result, usedResult = recipe.ingredients.find(entry => entry.itemId === result.itemId)?.quantity ?? 0;
      if (!Number.isSafeInteger((inventory.get(result.itemId) ?? 0) - usedResult + result.quantity)) return { ok: false, message: 'これ以上持てない。' };
      for (const { itemId, quantity } of recipe.ingredients) {
        const count = inventory.get(itemId)! - quantity;
        if (count) inventory.set(itemId, count); else inventory.delete(itemId);
      }
      gold -= recipe.gold; addItem(result.itemId, result.quantity);
      return { ok: true, message: `${findItem(result.itemId)!.name}を${result.quantity}個手に入れた！` };
    },
    sell(itemId: number): ActionResult {
      const item = findItem(itemId), count = inventory.get(itemId) ?? 0;
      if (!item || !count) return { ok: false, message: '持っていない。' };
      if (count === 1 && Object.values(equipment).includes(itemId)) return { ok: false, message: '装備を外してから売ってください。' };
      if (!Number.isSafeInteger(gold + item.sellPrice)) return { ok: false, message: 'これ以上お金を持てない。' };
      consume(itemId); gold += item.sellPrice;
      return { ok: true, message: `${item.name}を${item.sellPrice}Gで売った！` };
    },
    equip(itemId: number): ActionResult {
      const item = findItem(itemId);
      if (!item?.equipment || !(inventory.get(itemId) ?? 0)) return { ok: false, message: '持っている装備を選んでください。' };
      if (level < (item.equipment.requiredLevel ?? 1)) return { ok: false, message: `レベル${item.equipment.requiredLevel}から装備できる。` };
      equipment[item.equipment.slot] = itemId;
      clampVitals();
      return { ok: true, message: `${item.name}を装備した！` };
    },
    equipRoyalSet(): ActionResult {
      // 変更済みの報酬・装備制限でも、3点がそろって使えるときだけ一括で切り替える。
      if (!royalAutoEquipIds.every(id => (inventory.get(id) ?? 0) > 0 && level >= (findItem(id)!.equipment!.requiredLevel ?? 1))) {
        return { ok: false, message: '王の装備3点を装備できない。' };
      }
      for (const id of royalAutoEquipIds) equipment[findItem(id)!.equipment!.slot] = id;
      clampVitals();
      return { ok: true, message: `${royalAutoEquipIds.map(id => findItem(id)!.name).join('・')}を装備した！` };
    },
    unequip(slot: EquipmentSlot): ActionResult {
      if (!equipmentSlots.includes(slot) || equipment[slot] === null) return { ok: false, message: '何も装備していない。' };
      const name = findItem(equipment[slot]!)!.name; equipment[slot] = null;
      clampVitals();
      return { ok: true, message: `${name}を外した。` };
    },
    useItem(itemId: number): ActionResult {
      const item = findItem(itemId);
      if (!item || !(inventory.get(itemId) ?? 0)) return { ok: false, message: '持っていない。' };
      const stats = effectiveStats();
      const result = recoverItem(item, vitals, stats.hp, stats.mp);
      if (result.ok && consume(itemId)) vitals = result.vitals;
      return result;
    },
    useFieldSkill(skillId: number): ActionResult {
      const skill = findSkill(skillId);
      if (!skill || !learned().includes(skillId)) return { ok: false, message: 'その魔法は覚えていない。' };
      if (skill.kind !== 'spell' || skill.effect.type !== 'heal-hp') return { ok: false, message: 'フィールドでは使えない。' };
      if (vitals.hp <= 0) return { ok: false, message: '今は使えない。' };
      if (vitals.hp === effectiveStats().hp) return { ok: false, message: 'HPは全快している。' };
      if (vitals.mp < skill.mpCost) return { ok: false, message: 'MPが足りない。' };
      const amount = Math.min(skill.effect.amount, effectiveStats().hp - vitals.hp);
      vitals = { ...vitals, hp: vitals.hp + amount, mp: vitals.mp - skill.mpCost };
      return { ok: true, message: `${base.name}は${skill.name}を使った！\nHPが${amount}回復した！` };
    },
  };
}
