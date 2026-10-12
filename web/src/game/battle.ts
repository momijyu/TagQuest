import { wearsAnyRoyalEquipment, wearsRoyalSet } from '../data/royal-equipment';
import type { EquipmentSlot } from '../data/items';
import { playerConfig, royalEquipmentWarning } from '../data/encounters/combat-config';
import type { EnemyDefinition, PlayerDefinition } from '../data/encounters/combat-config';
import { findItem } from '../data/items';
import { recoverItem } from './player-state';
import type { ActionResult } from './player-state';
import { findSkill } from '../data/skills';

export interface BattleFeedback { readonly id: number; readonly target: 'enemy' | 'player' | 'heal'; readonly amount: number }
export type BattlePhase = 'commands' | 'player-action' | 'enemy-action' | 'escape' | 'victory' | 'defeat';
/** メッセージの確認ごとに進行し、再描画や時間経過ではターンを進めない。 */
export function createBattle(enemy: EnemyDefinition, options: {
  player?: PlayerDefinition; playerHp?: number; playerMp?: number; poisoned?: boolean; wasAttacked?: boolean; onAttacked?: () => void;
  consumeItem?: (itemId: number) => boolean; equipment?: Readonly<Record<EquipmentSlot, number | null>>;
} = {}) {
  const config = structuredClone(enemy), player = structuredClone(options.player ?? playerConfig);
  const condition = config.royalEquipmentAttack;
  const attackMultiplier = condition && options.equipment && (condition.match === 'any' ? wearsAnyRoyalEquipment(options.equipment) : wearsRoyalSet(options.equipment)) ? condition.multiplier : 1;
  let playerHp = options.playerHp ?? player.stats.hp;
  let playerMp = options.playerMp ?? player.maxMp ?? 0;
  let poisoned = options.poisoned ?? false;
  if (!Number.isInteger(playerMp) || playerMp < 0 || playerMp > (player.maxMp ?? 0)) throw new Error('戦闘開始時のMPが不正です。');
  if (!Number.isInteger(playerHp) || playerHp < 1 || playerHp > player.stats.hp) throw new Error('戦闘開始時のHPが不正です。');
  let enemyHp = config.stats.hp;
  let feedback: BattleFeedback | null = null, feedbackId = 0;
  const emit = (target: BattleFeedback['target'], amount: number) => { feedback = { id: ++feedbackId, target, amount }; };
  let wasAttacked = options.wasAttacked ?? false;
  let firstReaction = false, guarding = false;
  let peacefulTurn = 0, angryTurn = 0;
  let phase: BattlePhase = 'commands';
  let action: 'attack' | 'guard' | 'item' | 'skill' | null = null;
  const firstEntry = config.patterns.beforeAttacked[0];
  const intro = wasAttacked ? config.firstAttackedMessage : firstEntry.type === 'say' ? firstEntry.text : firstEntry.speech;
  let speech: string | null = intro ?? null;
  let text = `${config.name}があらわれた！${intro ? `\n「${intro}」` : ''}`;
  if ((config.royalEquipmentPlayerAttackMultiplier ?? 1) < 1 && options.equipment && wearsAnyRoyalEquipment(options.equipment)) text += '\n王の装備の攻撃力が弱められた！';
  const warning = options.equipment ? royalEquipmentWarning(config, options.equipment) : null;
  if (warning) text += `\n${warning}${config.canEscape === false ? '\nこの戦いからは逃げられない！' : '\n「にげる」で戻って装備を外せます。'}`;
  function damageEnemy(damage: number, announcement: string): void {
    enemyHp = Math.max(0, enemyHp - damage); emit('enemy', damage);
    if (!wasAttacked) { wasAttacked = true; firstReaction = true; options.onAttacked?.(); }
    phase = enemyHp === 0 ? 'victory' : 'player-action';
    text = `${announcement}\n${damage}のダメージ！`;
    if (phase === 'victory') text += `\n${config.name}をたおした！`;
    if (phase === 'victory' && config.reward) {
      if (config.reward.experience) text += `\n${config.reward.experience}の経験値を手に入れた！`;
      if (config.reward.gold) text += `\n${config.reward.gold}Gを手に入れた！`;
      for (const item of config.reward.items) text += `\n${findItem(item.itemId)!.name} ×${item.quantity}を手に入れた！`;
    }
  }
  function enemyTurn(): void {
    const hpBefore = playerHp;
    const poisonedBefore = poisoned;
    const pattern = wasAttacked ? config.patterns.afterAttacked : config.patterns.beforeAttacked;
    const index = wasAttacked ? angryTurn++ : peacefulTurn++;
    const entry = pattern[index % pattern.length];
    speech = [firstReaction ? config.firstAttackedMessage : undefined, entry.type === 'say' ? entry.text : entry.speech].filter(Boolean).join('\n') || null;
    const lines = firstReaction && config.firstAttackedMessage ? [`「${config.firstAttackedMessage}」`] : [];
    firstReaction = false;
    if (entry.type === 'attack' && entry.speech) lines.push(`「${entry.speech}」`);
    lines.push(entry.type === 'say' ? `「${entry.text}」` : entry.text);
    if (entry.type === 'attack') {
      const base = Math.max(1, Math.floor(config.stats.attack * attackMultiplier * entry.power) - player.stats.defense);
      const damage = Math.max(1, Math.floor(base * (guarding ? player.guardMultiplier : 1)));
      playerHp = Math.max(0, playerHp - damage);
      lines.push(`${player.name}に${damage}のダメージ！`);
      if (entry.inflictPoison && !poisoned && playerHp > 0) {
        poisoned = true; lines.push(`${player.name}は毒を受けた！`);
      }
    }
    if (poisonedBefore && poisoned && playerHp > 0) {
      const damage = Math.min(2, playerHp);
      playerHp -= damage; lines.push(`${player.name}は毒で${damage}のダメージ！`);
    }
    if (playerHp < hpBefore) emit('player', hpBefore - playerHp);
    phase = playerHp === 0 ? 'defeat' : 'enemy-action';
    if (phase === 'defeat') lines.push(`${player.name}は倒れてしまった…。`);
    text = lines.join('\n');
  }
  return {
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
    attack(): void {
      if (phase !== 'commands') return;
      action = 'attack'; guarding = false; speech = null;
      const damage = Math.max(1, player.stats.attack - config.stats.defense);
      damageEnemy(damage, `${player.name}は${config.name}にこうげき！`);
    },
    useSkill(skillId: number): ActionResult {
      if (phase !== 'commands') return { ok: false, message: '今は使えない。' };
      const skill = findSkill(skillId);
      if (!skill || !player.skills?.includes(skillId)) return { ok: false, message: 'その技は覚えていない。' };
      if ((player.level ?? 1) < (skill.learnLevel ?? 1)) return { ok: false, message: `レベル${skill.learnLevel}で覚える技です。` };
      if (playerMp < skill.mpCost) return { ok: false, message: 'MPが足りない。' };
      if (skill.effect.type === 'heal-hp' && playerHp === player.stats.hp) return { ok: false, message: 'HPは全快している。' };
      playerMp -= skill.mpCost; action = 'skill'; guarding = false; speech = null;
      const announcement = `${player.name}は${skill.name}を使った！`;
      if (skill.effect.type === 'heal-hp') {
        const amount = Math.min(skill.effect.amount, player.stats.hp - playerHp);
        playerHp += amount; emit('heal', amount); phase = 'player-action'; text = `${announcement}\nHPが${amount}回復した！`;
      } else {
        const damage = skill.effect.type === 'physical-damage' ? Math.max(1, Math.floor(player.stats.attack * skill.effect.power) - config.stats.defense) : skill.effect.amount;
        damageEnemy(damage, announcement);
      }
      return { ok: true, message: text };
    },
    useItem(itemId: number): ActionResult {
      if (phase !== 'commands') return { ok: false, message: '今は使えない。' };
      const item = findItem(itemId);
      if (!item) return { ok: false, message: 'アイテムが見つからない。' };
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
      action = 'guard'; guarding = true; speech = null; phase = 'player-action'; text = `${player.name}は身をまもっている。`;
    },
    escape(): void {
      if (phase !== 'commands') return;
      if (config.canEscape === false) {
        text = 'この戦いからは逃げられない！'; return;
      }
      phase = 'escape'; speech = null; text = `${player.name}はにげだした！`;
    },
    cancelEscape(): void {
      if (phase !== 'escape') return;
      phase = 'commands'; text = `${player.name}のターン。`;
    },
    advance(): void {
      if (phase === 'player-action') enemyTurn();
      else if (phase === 'enemy-action') { phase = 'commands'; action = null; guarding = false; speech = null; text = `${player.name}のターン。`; }
    },
  };
}
export type Battle = ReturnType<typeof createBattle>;
