import { spellPower } from './spell-power';
import { battleExperience, battleGold } from './battle-rewards';
import { skillMpCost } from './skill-cost';
import { wearsAnyRoyalEquipment, wearsRoyalSet } from '../data/royal-equipment';
import type { EquipmentSlot } from '../data/items';
import { playerConfig, royalEquipmentWarning } from '../data/encounters/combat-config';
import type { EnemyDefinition, PlayerDefinition } from '../data/encounters/combat-config';
import { findItem } from '../data/items';
import { recoverItem } from './player-state';
import type { ActionResult } from './player-state';
import { findSkill, isBattleSkill } from '../data/skills';

export interface BattleFeedback { readonly id: number; readonly target: 'enemy' | 'player' | 'heal'; readonly amount: number }
export type BattlePhase = 'commands' | 'player-action' | 'enemy-action' | 'escape' | 'victory' | 'defeat';
/** メッセージの確認ごとに進行し、再描画や時間経過ではターンを進めない。 */
export function createBattle(enemy: EnemyDefinition, options: {
  player?: PlayerDefinition; playerHp?: number; playerMp?: number; poisoned?: boolean; wasAttacked?: boolean; onAttacked?: () => void;
  support?: { name: string; kind: 'attack' | 'heal'; amount: number };
  consumeItem?: (itemId: number) => boolean; equipment?: Readonly<Record<EquipmentSlot, number | null>>; random?: () => number; victoryText?: () => string;
} = {}) {
  const config = structuredClone(enemy), player = structuredClone(options.player ?? playerConfig);
  // 旧configや試遊用定義で省略された魔力は0として扱う。
  Object.assign(player.stats, { magic: player.stats.magic ?? 0 });
  if (config.reward) Object.assign(config, { reward: { ...config.reward, gold: battleGold(config.reward.gold, player.goldMultiplier), experience: battleExperience(config.reward.experience ?? 0, player.experienceMultiplier, player.roundExperienceUp) } });
  const condition = config.royalEquipmentAttack;
  const attackMultiplier = condition && options.equipment && (condition.match === 'any' ? wearsAnyRoyalEquipment(options.equipment) : wearsRoyalSet(options.equipment)) ? condition.multiplier : 1;
  let playerHp = options.playerHp ?? player.stats.hp;
  let playerMp = options.playerMp ?? player.maxMp ?? 0;
  let poisoned = (options.poisoned ?? false) && !player.poisonImmune;
  let supportUsed = false, critical = false;
  let barrierTurns = 0, barrierReduction = 0;
  let blindTurns = 0, missChance = 0, attackBuffTurns = 0, playerAttackBoost = 1, buffJustApplied = false, itemEscaped = false;
  let slowedTurns = 0, stunned = false, enemyAttackBoost = 1, attackBoostTurns = 0;
  if (!Number.isInteger(playerMp) || playerMp < 0 || playerMp > (player.maxMp ?? 0)) throw new Error('戦闘開始時のMPが不正です。');
  if (!Number.isInteger(playerHp) || playerHp < 1 || playerHp > player.stats.hp) throw new Error('戦闘開始時のHPが不正です。');
  let enemyHp = config.stats.hp;
  let feedback: BattleFeedback | null = null, feedbackId = 0;
  const emit = (target: BattleFeedback['target'], amount: number) => { feedback = { id: ++feedbackId, target, amount }; };
  let wasAttacked = options.wasAttacked ?? false;
  const canEscape = () => !player.cannotEscape && (config.canEscape !== false || config.canEscapeBeforeAttacked === true && !wasAttacked);
  let firstReaction = false, guarding = false, enemyEscaped = false;
  let peacefulTurn = 0, angryTurn = 0;
  let phase: BattlePhase = 'commands';
  let action: 'attack' | 'guard' | 'item' | 'skill' | 'monster' | null = null;
  const firstEntry = config.patterns.beforeAttacked[0];
  const intro = wasAttacked ? config.firstAttackedMessage : firstEntry.type === 'say' ? firstEntry.text : 'speech' in firstEntry ? firstEntry.speech : undefined;
  let speech: string | null = intro ?? null;
  let text = `${config.name}があらわれた！${intro ? `\n「${intro}」` : ''}`;
  if (config.canEscape === false && canEscape()) text += '\n攻撃する前なら「にげる」で立ち去れます。';
  const warning = options.equipment ? royalEquipmentWarning(config, options.equipment) : null;
  if (warning) text += `\n${warning}${!canEscape() ? '\nこの戦いからは逃げられない！' : '\n「にげる」で戻って装備を外せます。'}`;
  const physicalDamage = (power: number) => {
    critical = (player.criticalChance ?? 0) > 0 && (options.random ?? Math.random)() < player.criticalChance!;
    const defense = config.family === 'metal' && player.metalPiercing ? 0 : config.stats.defense;
    return Math.max(1, Math.floor(player.stats.attack * playerAttackBoost * power * (critical ? 2 : 1) * (config.family === 'dragon' ? player.dragonMultiplier ?? 1 : 1)) - defense);
  };
  function boundAction(kind: 'attack' | 'guard' | 'item' | 'skill'): boolean {
    if (!slowedTurns) return false;
    slowedTurns--;
    if ((options.random ?? Math.random)() >= 0.25) return false;
    action = kind; guarding = false; speech = null; phase = 'player-action'; text = `${player.name}は糸の拘束で動けなかった！`; return true;
  }
  function damageEnemy(damage: number, announcement: string, physical = false, hitText = ''): void {
    enemyHp = Math.max(0, enemyHp - damage); emit('enemy', damage);
    if (!wasAttacked) { wasAttacked = true; firstReaction = true; options.onAttacked?.(); }
    text = `${announcement}${physical && critical ? '\n会心の一撃！' : ''}\n${damage}のダメージ！${hitText}`;
    if (physical && (player.selfDamageFraction ?? 0) > 0) {
      const selfDamage = Math.min(playerHp, Math.max(1, Math.floor(player.stats.hp * player.selfDamageFraction!)));
      playerHp -= selfDamage; emit('player', selfDamage); text += `\n大剣が血を求めて疼く！ 自分のHPが削られた！\nHPが${selfDamage}減った！`;
    }
    phase = playerHp === 0 ? 'defeat' : enemyHp === 0 ? 'victory' : 'player-action';
    if (phase === 'defeat') text += `\n${player.name}は倒れてしまった…。`;
    if (playerHp > 0 && enemyHp > 0 && physical && (player.stunChance ?? 0) > 0 && (options.random ?? Math.random)() < player.stunChance!) { stunned = true; text += '\n白銀の牙が敵の動きを止めた！'; }
    if (phase === 'victory') text += `\n${config.name}をたおした！`;

    if (phase === 'victory' && config.reward) {
      if (config.reward.experience) text += `\n${config.reward.experience}の経験値を手に入れた！`;
      if (config.reward.gold) text += `\n${config.reward.gold}Gを手に入れた！`;
      for (const item of config.reward.items) text += `\n${findItem(item.itemId)!.name} ×${item.quantity}を手に入れた！`;
    }
    if (phase === 'victory' && config.victoryMessage) text += `\n${config.victoryMessage}`;
    if (phase === 'victory' && (player.victoryMpRecovery ?? 0) > 0) {
      const recovered = Math.min((player.maxMp ?? 0) - playerMp, player.victoryMpRecovery!);
      if (recovered > 0) { playerMp += recovered; text += `\n祈りの力でMPが${recovered}回復した！`; }
    }
    if (phase === 'victory' && options.victoryText) text += `\n${options.victoryText()}`;
  }
  function curseTick(lines: string[]): void {
    if ((player.curseDamage ?? 0) > 0 && playerHp > 0) {
      const amount = Math.min(playerHp, player.curseDamage!); playerHp -= amount;
      lines.push(`怨念が体を蝕む…！ HPが${amount}減った！`);
    }
  }
  function enemyTurn(): void {
    const hpBefore = playerHp;
    const poisonedBefore = poisoned;
    const pattern = wasAttacked ? config.patterns.afterAttacked : config.patterns.beforeAttacked;
    const lines: string[] = [], speeches: string[] = [];
    if (firstReaction && config.firstAttackedMessage) { lines.push(`「${config.firstAttackedMessage}」`); speeches.push(config.firstAttackedMessage); }
    firstReaction = false;
    const skip = stunned; stunned = false;
    if (skip) lines.push(`${config.name}は動けない！`);
    for (let step = 0; !skip && step < (config.actionsPerTurn ?? 1) && playerHp > 0; step++) {
      const index = wasAttacked ? angryTurn++ : peacefulTurn++, entry = pattern[index % pattern.length];
      const quote = entry.type === 'say' ? entry.text : 'speech' in entry ? entry.speech : undefined;
      if (quote) speeches.push(quote);
      if (entry.type === 'escape' && (options.random ?? Math.random)() < entry.chance) {
        phase = 'escape'; enemyEscaped = true; speech = speeches.join('\n') || null;
        lines.push(`${config.name}は逃げてしまった！`); curseTick(lines);
        if (playerHp === 0) { phase = 'defeat'; lines.push(`${player.name}は倒れてしまった…。`); }
        text = lines.join('\n');
        if (playerHp < hpBefore) emit('player', hpBefore - playerHp);
        return;
      }
      if ((entry.type === 'attack' || entry.type === 'magic-attack') && entry.speech) lines.push(`「${entry.speech}」`);
      lines.push(entry.type === 'say' ? `「${entry.text}」` : entry.text);
      if (entry.type === 'slow') { slowedTurns = entry.turns; lines.push(`${player.name}は糸の拘束で素早く動けなくなった！`); }
      if (entry.type === 'boost-attack') { enemyAttackBoost = entry.power; attackBoostTurns = entry.turns + 1; lines.push(`${config.name}の攻撃力が上がった！`); }
      if (entry.type === 'heal') {
        const healed = Math.min(entry.amount, config.stats.hp - enemyHp); enemyHp += healed; lines.push(`HPが${healed}回復した！`);
      }
      if (entry.type === 'attack' || entry.type === 'magic-attack' || entry.type === 'escape') {
        for (let hit = 0; hit < (entry.type === 'escape' ? 1 : entry.hits ?? 1) && playerHp > 0; hit++) {
        if (entry.type !== 'magic-attack' && blindTurns > 0 && (options.random ?? Math.random)() < missChance) {
          lines.push(`${config.name}の攻撃は幻惑で外れた！`); continue;
        }
        if (entry.type !== 'magic-attack' && (player.evasionChance ?? 0) > 0 && (options.random ?? Math.random)() < player.evasionChance!) {
          lines.push(`${player.name}は攻撃を受け流した！`); continue;
        }
        // 魔法は敵の魔力を使い、物理防御を引かない。防御コマンドは両方に有効。
        const base = entry.type === 'magic-attack' ? Math.max(1, Math.floor((config.stats.magic ?? 0) * entry.power))
          : Math.max(1, Math.floor(config.stats.attack * attackMultiplier * enemyAttackBoost * (entry.type === 'attack' ? entry.power : 1)) - player.stats.defense);
        const shield = entry.type === 'magic-attack' && barrierTurns > 0 ? 1 - barrierReduction : 1;
        const damage = Math.max(1, Math.floor(base * shield * (guarding ? player.guardMultiplier : 1)));
        playerHp = Math.max(0, playerHp - damage); lines.push(`${player.name}に${damage}のダメージ！`);
        if (entry.type !== 'escape' && entry.inflictPoison && !player.poisonImmune && !poisoned && playerHp > 0) {
          poisoned = true; lines.push(`${player.name}は毒を受けた！`);
        } else if (entry.type !== 'escape' && entry.inflictPoison && player.poisonImmune && playerHp > 0) lines.push('マントが毒を防いだ！');
        }
      }
    }
    if (barrierTurns > 0 && --barrierTurns === 0) lines.push('魔導障壁が消えた。');
    if (blindTurns > 0 && --blindTurns === 0) lines.push('敵の幻惑が解けた。');
    if (buffJustApplied) buffJustApplied = false;
    else if (attackBuffTurns > 0 && --attackBuffTurns === 0) { playerAttackBoost = 1; lines.push('剛力の効果が切れた。'); }
    if (attackBoostTurns > 0 && --attackBoostTurns === 0) enemyAttackBoost = 1;
    speech = speeches.join('\n') || null;
    if (poisonedBefore && poisoned && playerHp > 0) {
      const damage = Math.min(2, playerHp);
      playerHp -= damage; lines.push(`${player.name}は毒で${damage}のダメージ！`);
    }
    curseTick(lines);
    if (playerHp < hpBefore) emit('player', hpBefore - playerHp);
    phase = playerHp === 0 ? 'defeat' : 'enemy-action';
    if (phase === 'defeat') lines.push(`${player.name}は倒れてしまった…。`);
    text = lines.join('\n');
  }
  return {
    get blindTurns() { return blindTurns; },
    get attackBuffTurns() { return attackBuffTurns; },
    get playerAttackBoost() { return playerAttackBoost; },
    get barrierTurns() { return barrierTurns; },
    get support() { return options.support; },
    get supportUsed() { return supportUsed; },
    callMonster(): ActionResult {
      if (phase !== 'commands' || !options.support || supportUsed) return { ok: false, message: '魔物の助けは1戦に1回です。' };
      const helper = options.support;
      if (helper.kind === 'heal' && playerHp === player.stats.hp) return { ok: false, message: 'HPは全快している。' };
      supportUsed = true; action = 'monster'; guarding = false; speech = null;
      if (helper.kind === 'heal') {
        const amount = Math.min(helper.amount + (player.level ?? 1) * 2, player.stats.hp - playerHp);
        playerHp += amount; emit('heal', amount); phase = 'player-action'; text = `${helper.name}の癒し！ HPが${amount}回復した！`;
      } else damageEnemy(Math.max(1, helper.amount + (player.level ?? 1) * 2 - config.stats.defense), `${helper.name}の援護攻撃！`);
      return { ok: true, message: text };
    },
    get slowedTurns() { return slowedTurns; },
    get enemyAttackBoost() { return enemyAttackBoost; },
    get feedback() { return feedback; },
    get enemyAttackMultiplier() { return attackMultiplier; },
    get enemy() { return config; },
    get player() { return player; },
    get playerHp() { return playerHp; },
    get playerMp() { return playerMp; },
    get poisoned() { return poisoned; },
    get enemyHp() { return enemyHp; },
    get phase() { return phase; },
    get text() { return text; },
    get speech() { return speech; },
    get action() { return action; },
    get wasAttacked() { return wasAttacked; },
    get canEscape() { return canEscape(); },
    completeVictory(definition: PlayerDefinition, vitals: { hp: number; mp: number; poisoned: boolean }): void {
      if (phase !== 'victory') return;
      Object.assign(player, structuredClone(definition)); playerHp = vitals.hp; playerMp = vitals.mp; poisoned = vitals.poisoned;
    },
    attack(): void {
      if (phase !== 'commands') return;
      if (boundAction('attack')) return;
      action = 'attack'; guarding = false; speech = null;
      const damage = physicalDamage(1);
      damageEnemy(damage, `${player.name}は${config.name}にこうげき！`, true);
    },
    useSkill(skillId: number): ActionResult {
      if (phase !== 'commands') return { ok: false, message: '今は使えない。' };
      const skill = findSkill(skillId);
      if (!skill || !player.skills?.includes(skillId)) return { ok: false, message: 'その技は覚えていない。' };
      if ((player.level ?? 1) < (skill.learnLevel ?? 1)) return { ok: false, message: `レベル${skill.learnLevel}で覚える技です。` };
      if (!isBattleSkill(skill)) return { ok: false, message: 'この魔法はフィールドで使う。' };
      const cost = skillMpCost(skill, player.mpCostReduction);
      if (playerMp < cost) return { ok: false, message: 'MPが足りない。' };
      if (skill.effect.type === 'heal-hp' && playerHp === player.stats.hp) return { ok: false, message: 'HPは全快している。' };
      if (boundAction('skill')) return { ok: true, message: text };
      playerMp -= cost; action = 'skill'; guarding = false; speech = null;
      const announcement = `${player.name}は${skill.name}を使った！`;
      if (skill.effect.type === 'heal-hp') {
        const amount = Math.min(spellPower(skill.effect, player.stats.magic, options.random), player.stats.hp - playerHp);
        playerHp += amount; emit('heal', amount); phase = 'player-action'; text = `${announcement}\nHPが${amount}回復した！`;
      } else if (skill.effect.type === 'magic-barrier') {
        barrierTurns = skill.effect.turns; barrierReduction = skill.effect.reduction;
        phase = 'player-action'; text = `${announcement}\n魔導障壁が魔法の攻撃を和らげる！`;
      } else if (skill.effect.type === 'physical-damage') {
        damageEnemy(physicalDamage(skill.effect.power), announcement, true);
      } else if (skill.effect.type === 'magic-damage') {
        const hpBefore = enemyHp;
        const damage = Math.max(1, spellPower(skill.effect, player.stats.magic, options.random) - (skill.effect.ignoreDefense ? 0 : config.stats.defense));
        let extra='';
        if (skill.effect.drainFraction) {
          const healed = Math.min(player.stats.hp - playerHp, Math.floor(Math.min(hpBefore, damage) * skill.effect.drainFraction));
          playerHp += healed; extra += `\n命を吸収し、HPが${healed}回復した！`;
        }
        if (skill.effect.freeze && hpBefore > damage) { stunned = true; extra += '\n敵は凍りつき、次の動きを封じられた！'; }
        damageEnemy(damage, announcement, false, extra);
      }
      return { ok: true, message: text };
    },
    useItem(itemId: number): ActionResult {
      if (phase !== 'commands') return { ok: false, message: '今は使えない。' };
      const item = findItem(itemId);
      if (!item) return { ok: false, message: 'アイテムが見つからない。' };
      const effect = item.effect;
      if (effect?.type.startsWith('battle-')) {
        if (effect.type === 'battle-escape' && (config.boss || config.canEscape === false || !canEscape())) return { ok: false, message: player.cannotEscape ? '枷の呪いで煙幕からも逃げられない！' : 'ボスに煙幕は効かない！' };
        if (!options.consumeItem?.(itemId)) return { ok: false, message: '持っていない。' };
        action = 'item'; guarding = false; speech = null;
        const announcement = `${player.name}は${item.name}を使った！`;
        if (effect.type === 'battle-damage') damageEnemy(effect.amount, announcement);
        else if (effect.type === 'battle-blind') { blindTurns = effect.turns; missChance = effect.missChance; phase = 'player-action'; text = `${announcement}\n敵を幻惑し、物理攻撃を外れやすくした！`; }
        else if (effect.type === 'battle-buff') { attackBuffTurns = effect.turns; playerAttackBoost = effect.power; buffJustApplied = true; phase = 'player-action'; text = `${announcement}\n物理攻撃力が上がった！`; }
        else if (effect.type === 'battle-escape') { itemEscaped = true; phase = 'escape'; text = `${announcement}\n煙幕にまぎれて逃げ出した！`; }
        return { ok: true, message: text };
      }
      const result = recoverItem(item, { hp: playerHp, mp: playerMp, poisoned }, player.stats.hp, player.maxMp ?? 0);
      if (!result.ok) return result;
      if (!options.consumeItem?.(itemId)) return { ok: false, message: '持っていない。' };
      emit('heal', Math.max(result.vitals.hp - playerHp, result.vitals.mp - playerMp));
      playerHp = result.vitals.hp; playerMp = result.vitals.mp; poisoned = result.vitals.poisoned;
      action = 'item'; guarding = false; speech = null; phase = 'player-action'; text = result.message;
      return result;
    },
    guard(): void {
      if (phase !== 'commands') return;
      if (boundAction('guard')) return;
      action = 'guard'; guarding = true; speech = null; phase = 'player-action'; text = `${player.name}は身をまもっている。`;
    },
    escape(): void {
      if (phase !== 'commands') return;
      if (!canEscape()) {
        text = player.cannotEscape ? '重い鎖が絡みついて逃げ出せない！' : 'この戦いからは逃げられない！'; return;
      }
      phase = 'escape'; speech = null; text = `${player.name}はにげだした！`;
    },
    cancelEscape(): void {
      if (phase !== 'escape' || enemyEscaped || itemEscaped) return;
      phase = 'commands'; text = `${player.name}のターン。`;
    },
    advance(): void {
      if (phase === 'player-action') enemyTurn();
      else if (phase === 'enemy-action') { phase = 'commands'; action = null; guarding = false; speech = null; text = `${player.name}のターン。`; }
    },
  };
}
export type Battle = ReturnType<typeof createBattle>;
