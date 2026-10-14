import { spellPower } from './spell-power';
import { skillMpCost } from './skill-cost';
import { facilityConfig, enhancementBonus, monsterSupport } from '../data/facilities';
import { findItem, equipmentSlots } from '../data/items';
import type { ItemDefinition, EquipmentSlot } from '../data/items';
import { playerConfig } from '../data/encounters/combat-config';
import type { PlayerDefinition, VictoryReward, EnemyDefinition } from '../data/encounters/combat-config';
import { whole, record, label } from '../data/catalog-validation';
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
export function createPlayerState(definition: PlayerDefinition = playerConfig, progression: ProgressionDefinition = progressionConfig, facilitiesActive = true) {
  const base = structuredClone(definition);
  let name = base.name;
  const titles = new Set<string>();
  const enhancements = new Map<number, number>();
  const monsters = new Set<number>();
  let coins = 0, companion: number | null = null;
  let boost = { hp: 0, attack: 0 };
  let regenSteps = 0;
  const defeatGoldLossPercent = whole(base.defeatGoldLossPercent ?? 50, 0, 100);
  let experience = base.initialExperience ?? 0;
  let level = levelForExperience(experience, progression);
  function grownStats() {
    const growth = progression.growthPerLevel, steps = level - 1;
    return { hp: Math.min(9999, base.stats.hp + steps * growth.hp + boost.hp), mp: Math.min(9999, (base.maxMp ?? 0) + steps * growth.mp),
      attack: Math.min(9999, base.stats.attack + steps * growth.attack + boost.attack), defense: Math.min(9999, base.stats.defense + steps * growth.defense), magic: Math.min(9999, (base.stats.magic ?? 0) + steps * (growth.magic ?? 0)) };
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
      stats.attack += enhancementBonus(gear.slot, facilitiesActive ? enhancements.get(id) ?? 0 : 0, 'attack');
      stats.defense += gear.defense + enhancementBonus(gear.slot, facilitiesActive ? enhancements.get(id) ?? 0 : 0, 'defense'); stats.magic += gear.magic ?? 0;
    }
    stats.attack += Math.floor(royalAttackBonus * royalAttackMultiplier);
    return { hp: Math.min(9999, stats.hp), mp: Math.min(9999, stats.mp), attack: Math.min(9999, stats.attack), defense: Math.max(0, Math.min(9999, stats.defense)), magic: Math.min(9999, stats.magic) };
  }
  function effective(royalAttackMultiplier = 1): PlayerDefinition {
    const stats = effectiveStats(royalAttackMultiplier);
    const weapon = equipment.weapon === null ? undefined : findItem(equipment.weapon)?.equipment;
    const poisonImmune = Boolean(base.poisonImmune || Object.values(equipment).some(id => id !== null && findItem(id)?.equipment?.poisonImmune));
    // 既存の遊技場景品は施設のある世界で有効。今回の通常装備は全世界で効果を持つ。
    const criticalChance = Math.min(1, (facilitiesActive ? base.criticalChance ?? 0 : 0) + Object.values(equipment).reduce<number>((sum, id) =>
      sum + (id === null || !facilitiesActive && facilityConfig.casinoPrizes.some(prize => prize.itemId === id) ? 0 : findItem(id)?.equipment?.criticalChance ?? 0), 0));
    const mpCostReduction = (base.mpCostReduction ?? 0) + gearEffectSum('mpCostReduction');
    const evasionChance = Math.min(1, (base.evasionChance ?? 0) + gearEffectSum('evasionChance'));
    const selfDamageFraction = Math.min(1, (base.selfDamageFraction ?? 0) + gearEffectSum('selfDamageFraction'));
    const curseDamage = Math.min(9999, (base.curseDamage ?? 0) + gearEffectSum('curseDamage'));
    const cannotEscape = Boolean(base.cannotEscape || Object.values(equipment).some(id => id !== null && findItem(id)?.equipment?.cannotEscape));
    const multiplier = (key: 'experienceMultiplier' | 'encounterMultiplier' | 'goldMultiplier') => Math.min(10, Object.values(equipment).reduce<number>((product,id) => product * (id === null ? 1 : findItem(id)?.equipment?.[key] ?? 1), base[key] ?? 1));
    const walkExperience = Math.min(9999, (base.walkExperience ?? 0) + gearEffectSum('walkExperience'));
    const victoryMpRecovery = Math.min(9999, (base.victoryMpRecovery ?? 0) + gearEffectSum('victoryMpRecovery'));
    const roundExperienceUp = Boolean(base.roundExperienceUp || Object.values(equipment).some(id => id !== null && findItem(id)?.equipment?.roundExperienceUp));
    const walkRegen = Object.values(equipment).map(id => id === null ? undefined : findItem(id)?.equipment?.walkRegen).find(Boolean) ?? base.walkRegen;
    return { ...base, walkExperience, walkRegen, victoryMpRecovery, roundExperienceUp, goldMultiplier: multiplier('goldMultiplier'), selfDamageFraction, curseDamage, cannotEscape, experienceMultiplier: multiplier('experienceMultiplier'), encounterMultiplier: multiplier('encounterMultiplier'), mpCostReduction, evasionChance, criticalChance, metalPiercing: facilitiesActive && (weapon?.metalPiercing ?? false), poisonImmune, stunChance: weapon?.stunChance ?? base.stunChance ?? 0, dragonMultiplier: weapon?.dragonMultiplier ?? base.dragonMultiplier ?? 1, name, level, maxMp: stats.mp, skills: learned(), stats: { hp: stats.hp, attack: stats.attack, defense: stats.defense, magic: stats.magic } };
  }
  function gearEffectSum(key: 'mpCostReduction' | 'evasionChance' | 'selfDamageFraction' | 'curseDamage' | 'walkExperience' | 'victoryMpRecovery'): number {
    return Object.values(equipment).reduce<number>((sum, id) => sum + (id === null ? 0 : findItem(id)?.equipment?.[key] ?? 0), 0);
  }
  const cursedInSlot = (slot: EquipmentSlot) => equipment[slot] !== null && findItem(equipment[slot]!)?.equipment?.cursed === true;
  const curseWarning = '不気味な気配がまとわりつき、呪われていて外せない！';
  function clampVitals(): void {
    const stats = effectiveStats();
    // 付け外しでは回復させず、上限を超えた現在値だけ収める。
    vitals = { ...vitals, hp: Math.min(vitals.hp, stats.hp), mp: Math.min(vitals.mp, stats.mp), poisoned: vitals.poisoned && !effective().poisonImmune };
  }
  function gainExperience(amount: number) {
    whole(amount);
    const previousLevel = level, previousSkills = learned();
    experience = Math.min(maximumExperience, experience + amount);
    level = levelForExperience(experience, progression);
    const nextStats = effectiveStats();
    if (level > previousLevel) vitals = { ...vitals, hp: nextStats.hp, mp: nextStats.mp };
    return { previousLevel, level, learnedSkills: learned().filter(id => !previousSkills.includes(id)) };
  }
  for (const item of base.initialItems ?? []) addItem(item.itemId, item.quantity);
  return {
    snapshot() { return { regenSteps, coins, enhancements: [...enhancements], monsters: [...monsters], companion, titles: [...titles], name, level, experience, gold, vitals: { ...vitals }, boost: { ...boost }, equipment: { ...equipment }, inventory: [...inventory], discovered: [...discovered] }; },
    restore(value: unknown): void {
      const data = record(value), bonuses = record(data.boost), savedEquipment = record(data.equipment), health = record(data.vitals);
      const savedName = label(data.name), xp = whole(data.experience, 0, maximumExperience), money = whole(data.gold, 0, Number.MAX_SAFE_INTEGER);
      if ([...savedName].length > 20 || !Array.isArray(data.inventory) || data.inventory.length > 256 || !Array.isArray(data.discovered)) throw new Error('セーブデータの形式が不正です。');
      const nextItems = new Map<number, number>();
      for (const entry of data.inventory) {
        if (!Array.isArray(entry) || entry.length !== 2 || !findItem(entry[0]) || nextItems.has(entry[0])) throw new Error('保存アイテムが不正です。');
        nextItems.set(entry[0], whole(entry[1], 1, Number.MAX_SAFE_INTEGER));
      }
      const nextGear = { ...equipment };
      for (const slot of equipmentSlots) {
        const id = savedEquipment[slot];
        if (id !== null && (typeof id !== 'number' || !nextItems.has(id) || findItem(id)?.equipment?.slot !== slot || levelForExperience(xp, progression) < (findItem(id)?.equipment?.requiredLevel ?? 1))) throw new Error('保存装備が不正です。');
        nextGear[slot] = id as number | null;
      }
      const discoveredIds = data.discovered.map(id => { if (typeof id !== 'number' || !findItem(id)) throw new Error('図鑑データが不正です。'); return id; });
      const nextBoost = { hp: whole(bonuses.hp, 0, 9999), attack: whole(bonuses.attack, 0, 9999) };
      const nextVitals = { hp: whole(health.hp, 0, 9999), mp: whole(health.mp, 0, 9999), poisoned: health.poisoned };
      if (typeof nextVitals.poisoned !== 'boolean') throw new Error('保存状態が不正です。');
      const savedTitles = data.titles ?? [];
      if (!Array.isArray(savedTitles) || savedTitles.length > 256) throw new Error('保存称号が不正です。');
      const checkedTitles = savedTitles.map(value => label(value));
      const nextCoins = whole(data.coins ?? 0, 0, Number.MAX_SAFE_INTEGER);
      const nextRegenSteps = whole(data.regenSteps ?? 0, 0, 254);
      if (!Array.isArray(data.enhancements ?? []) || !Array.isArray(data.monsters ?? [])) throw new Error('施設の保存状態が不正です。');
      const nextEnhancements = new Map<number, number>();
      for (const entry of (data.enhancements ?? []) as unknown[]) {
        if (!Array.isArray(entry) || entry.length !== 2 || !findItem(entry[0])?.equipment || nextEnhancements.has(entry[0])) throw new Error('保存強化が不正です。');
        nextEnhancements.set(entry[0], whole(entry[1], 1, 2));
      }
      const nextMonsters = new Set<number>();
      for (const id of (data.monsters ?? []) as number[]) { if (!monsterSupport(id) || nextMonsters.has(id)) throw new Error('保存魔物が不正です。'); nextMonsters.add(id); }
      const nextCompanion = data.companion ?? null;
      if (nextCompanion !== null && !nextMonsters.has(nextCompanion as number)) throw new Error('連れ歩く魔物が不正です。');
      coins = nextCoins; companion = nextCompanion as number | null;
      enhancements.clear(); for (const [id, level] of nextEnhancements) enhancements.set(id, level);
      monsters.clear(); for (const id of nextMonsters) monsters.add(id);
      titles.clear(); for (const title of checkedTitles) titles.add(title);
      name = savedName; experience = xp; level = levelForExperience(xp, progression); gold = money; boost = nextBoost;
      inventory.clear(); for (const [id, count] of nextItems) inventory.set(id, count);
      discovered.clear(); for (const id of [...discoveredIds, ...nextItems.keys()]) discovered.add(id);
      Object.assign(equipment, nextGear); vitals = nextVitals as Vitals; clampVitals();
      regenSteps = effective().walkRegen ? nextRegenSteps % effective().walkRegen!.steps : 0;
    },
    rename(value: string): ActionResult {
      const next = value.trim();
      if (!next || [...next].length > 20 || /[\u0000-\u001f\u007f]/u.test(next)) return { ok: false, message: '名前は1〜20文字で入力してください。' };
      name = next; return { ok: true, message: `名前を${name}に変更した！` };
    },
    rest(price = 15): ActionResult {
      whole(price); if (gold < price) return { ok: false, message: 'お金が足りない。' };
      gold -= price; vitals = { hp: effectiveStats().hp, mp: effectiveStats().mp, poisoned: false };
      return { ok: true, message: 'ゆっくり休んだ。HP・MPが全回復し、毒も治った！' };
    },
    get coins() { return coins; },
    get companion() { return companion; },
    get monsters() { return [...monsters]; },
    get enhancements() { return [...enhancements]; },
    itemName(id: number): string { return `${findItem(id)?.name ?? '不明'}${facilitiesActive && enhancements.has(id) ? ` ＋${enhancements.get(id)}` : ''}`; },
    gearBonus(id: number, stat: string): number {
      const gear = findItem(id)?.equipment;
      return gear ? (gear[stat as 'hp' | 'mp' | 'attack' | 'defense' | 'magic'] ?? 0) + enhancementBonus(gear.slot, facilitiesActive ? enhancements.get(id) ?? 0 : 0, stat) : 0;
    },
    enhance(id: number): ActionResult {
      const gear = findItem(id)?.equipment, step = facilityConfig.enhancements.find(step => step.level === (enhancements.get(id) ?? 0) + 1);
      if (!gear || !(inventory.get(id) ?? 0)) return { ok: false, message: '手持ちの装備を選んでください。' };
      if (!step) return { ok: false, message: 'この装備は最大の＋2です。' };
      if (gold < step.gold || step.ingredients.some(item => (inventory.get(item.itemId) ?? 0) < item.quantity)) return { ok: false, message: '強化の素材かお金が足りない。' };
      for (const item of step.ingredients) for (let n = 0; n < item.quantity; n++) consume(item.itemId);
      gold -= step.gold; enhancements.set(id, step.level);
      return { ok: true, message: `${findItem(id)!.name}を＋${step.level}に強化した！ 同じ種類の装備に適用されます。` };
    },
    buyCoins(amount: number): ActionResult {
      if (!Number.isSafeInteger(amount) || amount < 1 || amount > 10000) return { ok: false, message: '交換数が不正です。' };
      const cost = amount * facilityConfig.coinGoldRate;
      if (gold < cost || !Number.isSafeInteger(coins + amount)) return { ok: false, message: 'お金が足りないか、これ以上コインを持てない。' };
      gold -= cost; coins += amount; return { ok: true, message: `${cost}Gを${amount}コインに交換した！` };
    },
    spendCoins(amount: number): boolean { whole(amount); if (coins < amount) return false; coins -= amount; return true; },
    addCoins(amount: number): void { whole(amount); whole(coins + amount, 0, Number.MAX_SAFE_INTEGER); coins += amount; },
    redeem(itemId: number): ActionResult {
      const prize = facilityConfig.casinoPrizes.find(prize => prize.itemId === itemId);
      if (!prize || coins < prize.coins || !Number.isSafeInteger((inventory.get(itemId) ?? 0) + 1)) return { ok: false, message: '景品のコインが足りないか、これ以上持てない。' };
      coins -= prize.coins; addItem(itemId, 1); return { ok: true, message: `${findItem(itemId)!.name}と交換した！` };
    },
    recruit(id: number): ActionResult {
      if (!monsterSupport(id)) return { ok: false, message: 'その魔物は仲間にできない。' };
      monsters.add(id); if (companion === null) companion = id;
      return { ok: true, message: `${monsterSupport(id)!.name}が仲間になった！` };
    },
    setCompanion(id: number | null): ActionResult {
      if (id !== null && !monsters.has(id)) return { ok: false, message: 'その魔物は仲間にいない。' };
      companion = id; return { ok: true, message: id === null ? '魔物を牧場で休ませた。' : `${monsterSupport(id)!.name}を連れていく！` };
    },
    get titles() { return [...titles]; },
    addTitle(title: string): void { label(title); if (!titles.has(title) && titles.size >= 256) throw new Error('称号の上限に達しました。'); titles.add(title); },
    addGold(amount: number): void { whole(amount); whole(gold + amount, 0, Number.MAX_SAFE_INTEGER); gold += amount; },
    get cursedEquipment() { return equipmentSlots.filter(cursedInSlot).map(slot => equipment[slot]!); },
    purify(): ActionResult {
      const slots = equipmentSlots.filter(cursedInSlot);
      if (!slots.length) return { ok: false, message: 'お祓いが必要な装備はありません。' };
      if (gold < 100) return { ok: false, message: 'お祓いには100Gが必要です。お金が足りません。' };
      gold -= 100;
      for (const slot of slots) { equipment[slot] = null; if (slot === 'accessory') regenSteps = 0; }
      clampVitals();
      return { ok: true, message: '聖なる祈りの光に包まれた！\n呪いが解け、呪いの装備がすべて外れた。100Gを支払った。' };
    },
    pray(): ActionResult { const wasPoisoned = vitals.poisoned; vitals = { ...vitals, poisoned: false }; return { ok: true, message: wasPoisoned ? '祈りの光で毒が治った！' : '祈りをささげた。心が落ち着いた。' }; },
    get gold() { return gold; },
    get level() { return level; },
    get experience() { return experience; },
    get nextLevelExperience() { return progression.levelThresholds[level] ?? null; },
    get skillSchedule() { return (base.skills ?? []).map(id => ({ id, learnLevel: findSkill(id)?.learnLevel ?? 1, learned: learned().includes(id) })); },
    get vitals() { return { ...vitals }; },
    get definition() { return effective(); },
    get regenSteps() { return regenSteps; },
    /** 成功した歩行だけが呼ぶ。ワープ・空振り・メニュー操作は歩数に含めない。 */
    walk() {
      const definition = effective();
      if (vitals.hp === 0 || !definition.walkExperience && !definition.walkRegen) return null;
      const result = gainExperience(definition.walkExperience ?? 0);
      const regen = definition.walkRegen;
      if (regen && ++regenSteps >= regen.steps) {
        regenSteps = 0;
        vitals = { ...vitals, hp: Math.min(effectiveStats().hp, vitals.hp + regen.hp), mp: Math.min(effectiveStats().mp, vitals.mp + regen.mp) };
      }
      return result;
    },
    get totalMpReduction() { return effective().mpCostReduction ?? 0; },
    skillMpCost(skillId: number): number { return skillMpCost(findSkill(skillId)!, effective().mpCostReduction); },
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
      vitals = { ...next, poisoned: next.poisoned && !effective().poisonImmune };
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
      if (item.sellable === false) return { ok: false, message: 'このアイテムは売却できない。' };
      if (count === 1 && Object.values(equipment).includes(itemId)) return { ok: false, message: '装備を外してから売ってください。' };
      if (!Number.isSafeInteger(gold + item.sellPrice)) return { ok: false, message: 'これ以上お金を持てない。' };
      consume(itemId); gold += item.sellPrice;
      return { ok: true, message: `${item.name}を${item.sellPrice}Gで売った！` };
    },
    equip(itemId: number): ActionResult {
      const item = findItem(itemId);
      if (!item?.equipment || !(inventory.get(itemId) ?? 0)) return { ok: false, message: '持っている装備を選んでください。' };
      if (equipment[item.equipment.slot] !== itemId && cursedInSlot(item.equipment.slot)) return { ok: false, message: curseWarning };
      if (level < (item.equipment.requiredLevel ?? 1)) return { ok: false, message: `レベル${item.equipment.requiredLevel}から装備できる。` };
      if (item.equipment.slot === 'accessory' && equipment.accessory !== itemId) regenSteps = 0;
      equipment[item.equipment.slot] = itemId;
      clampVitals();
      return { ok: true, message: `${item.name}を装備した！` };
    },
    equipRoyalSet(): ActionResult {
      // 変更済みの報酬・装備制限でも、3点がそろって使えるときだけ一括で切り替える。
      if (royalAutoEquipIds.some(id => cursedInSlot(findItem(id)!.equipment!.slot))) return { ok: false, message: curseWarning };
      if (!royalAutoEquipIds.every(id => (inventory.get(id) ?? 0) > 0 && level >= (findItem(id)!.equipment!.requiredLevel ?? 1))) {
        return { ok: false, message: '王の装備3点を装備できない。' };
      }
      for (const id of royalAutoEquipIds) equipment[findItem(id)!.equipment!.slot] = id;
      clampVitals();
      return { ok: true, message: `${royalAutoEquipIds.map(id => findItem(id)!.name).join('・')}を装備した！` };
    },
    unequip(slot: EquipmentSlot): ActionResult {
      if (!equipmentSlots.includes(slot) || equipment[slot] === null) return { ok: false, message: '何も装備していない。' };
      if (cursedInSlot(slot)) return { ok: false, message: curseWarning };
      const name = findItem(equipment[slot]!)!.name; equipment[slot] = null;
      if (slot === 'accessory') regenSteps = 0;
      clampVitals();
      return { ok: true, message: `${name}を外した。` };
    },
    useItem(itemId: number): ActionResult {
      const item = findItem(itemId);
      if (!item || !(inventory.get(itemId) ?? 0)) return { ok: false, message: '持っていない。' };
      const stats = effectiveStats();
      if (item.effect?.type === 'gain-experience') {
        if (experience >= maximumExperience) return { ok: false, message: '最高レベルに達している。' };
        consume(itemId); const result = gainExperience(item.effect.amount);
        return { ok: true, message: `${item.name}を使った！ ${item.effect.amount}EXPを獲得した！${result.level > result.previousLevel ? ` レベル${result.level}！ HP・MPが全回復した！` : ''}${result.learnedSkills.map(id => ` ${findSkill(id)!.name}を覚えた！`).join('')}` };
      }
      if (item.effect?.type === 'boost-hp' || item.effect?.type === 'boost-attack') {
        const key = item.effect.type === 'boost-hp' ? 'hp' : 'attack';
        if (grownStats()[key] >= 9999) return { ok: false, message: 'これ以上強化できない。' };
        const increase = Math.min(item.effect.amount, 9999 - grownStats()[key]);
        boost[key] += increase; consume(itemId);
        if (key === 'hp') vitals = { ...vitals, hp: Math.min(effectiveStats().hp, vitals.hp + increase) };
        return { ok: true, message: `${item.name}を使った！\n基礎${key === 'hp' ? '最大HP' : '攻撃力'}が${increase}上がった！` };
      }
      const result = recoverItem(item, vitals, stats.hp, stats.mp);
      if (result.ok && consume(itemId)) vitals = result.vitals;
      return result;
    },
    canUseFieldSpell(skillId: number): ActionResult {
      const skill = findSkill(skillId);
      if (!skill || !learned().includes(skillId)) return {ok:false,message:'その魔法は覚えていない。'};
      if (skill.kind !== 'spell' || vitals.hp <= 0) return {ok:false,message:'今は使えない。'};
      if (vitals.mp < skillMpCost(skill, effective().mpCostReduction)) return {ok:false,message:'MPが足りない。'};
      return {ok:true,message:''};
    },
    spendMp(amount: number): void { whole(amount,0,vitals.mp); vitals = {...vitals,mp:vitals.mp-amount}; },
    useFieldSkill(skillId: number, random: () => number = Math.random): ActionResult {
      const skill = findSkill(skillId);
      if (!skill || !learned().includes(skillId)) return { ok: false, message: 'その魔法は覚えていない。' };
      if (skill.kind !== 'spell' || skill.effect.type !== 'heal-hp') return { ok: false, message: 'フィールドでは使えない。' };
      if (vitals.hp <= 0) return { ok: false, message: '今は使えない。' };
      if (vitals.hp === effectiveStats().hp) return { ok: false, message: 'HPは全快している。' };
      const cost = skillMpCost(skill, effective().mpCostReduction);
      if (vitals.mp < cost) return { ok: false, message: 'MPが足りない。' };
      const amount = Math.min(spellPower(skill.effect, effectiveStats().magic, random), effectiveStats().hp - vitals.hp);
      vitals = { ...vitals, hp: vitals.hp + amount, mp: vitals.mp - cost };
      return { ok: true, message: `${name}は${skill.name}を使った！\nHPが${amount}回復した！` };
    },
  };
}
