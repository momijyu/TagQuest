import { royalEquipmentWarning } from '../data/encounters/combat-config';
import type { SceneData } from '../codec/scenes';
import { parseExits, validateExitTargets, exitArrival } from '../data/stage-exits';
import { playerCollisionFrame } from '../data/player-placement';
import { canStand, createWalkingGame } from './walking';
import type { Direction, GameMessage } from './walking';
import { parseEncounter, findEnemy, encounterEntries } from '../data/encounters/settings';
import { kingEncounter } from '../data/encounters/king';
import { createBattle } from './battle';
import type { Battle } from './battle';
import type { PlayerDefinition, EnemyDefinition } from '../data/encounters/combat-config';
import { createPlayerState } from './player-state';
import type { ActionResult } from './player-state';
import type { EquipmentSlot } from '../data/items';
import { findShop } from '../data/shops';
import { findSkill } from '../data/skills';
import { dialogueText, dialogueTemplates } from '../data/interactions';
import { createStory } from './story';

export interface EncounterEvent { readonly enemyId: number; readonly name: string; readonly stageId: number; readonly entityIndex?: number }
export interface WorldGameOptions { player?: PlayerDefinition; enemies?: readonly EnemyDefinition[]; initialEquipment?: readonly number[] }
export type EncounterOutcome = 'victory' | 'escape' | 'defeat';

/** ステージごとの取得状態を残し、ワールド全体を1回のプレイとして扱う。 */
export function createWorldGame(source: readonly SceneData[], initialId: number, random = () => Math.random(), options: WorldGameOptions = {}) {
  const scenes = structuredClone(source);
  if (new Set(scenes.map(scene => scene.id)).size !== scenes.length) throw new Error('マップIDが重複しています。');
  validateExitTargets(scenes);
  for (const scene of scenes) {
    parseEncounter(scene.encounter);
    parseExits(scene.exits, scene.width, scene.height);
    for (const exit of scene.exits ?? []) {
      const target = scenes.find(candidate => candidate.id === exit.targetStageId)!;
      if (!canStand(scene, { x: exit.x * 16, y: exit.y * 16 - 16 })) throw new Error(`マップ${scene.id}の出口が歩けない場所です。`);
      if (!canStand(target, exitArrival(exit))) throw new Error(`マップ${target.id}の到着位置が歩けない場所です。`);
    }
  }
  const initial = scenes.find(scene => scene.id === initialId);
  if (!initial) throw new Error('開始マップがありません。');
  const games = new Map<number, ReturnType<typeof createWalkingGame>>();
  const story = createStory(scenes);
  // The northern guide reuses the king artwork without being the hidden combat king.
  const encounterCharacter = (entity: SceneData['entities'][number]) => !(entity.kind === 'king'
    && entity.dialogue?.type === 'template' && dialogueTemplates[entity.dialogue.id].storyRole === 'north-king');
  let current = createWalkingGame(initial);
  games.set(initial.id, current);
  let revision = 0;
  let cleared = false;
  const attackedEvents = new Set<string>();
  const defeatCounts = new Map<number, number>();
  const removedCharacters = new Set<string>();
  let activeEncounter: EncounterEvent | null = null;
  let pendingEncounter: EncounterEvent | null = null;
  let battle: Battle | null = null;
  function newPlayer() {
    const state = createPlayerState(options.player);
    for (const id of options.initialEquipment ?? []) {
      const result = state.equip(id);
      if (!result.ok) throw new Error(result.message);
    }
    state.setVitals({ hp: state.definition.stats.hp, mp: state.definition.maxMp ?? 0, poisoned: false });
    return state;
  }
  let player = newPlayer();
  let shopKind: string | null = null;
  let progressionMessage: GameMessage | null = null;
  const credited = new Map<ReturnType<typeof createWalkingGame>, Map<number, number>>();
  const enemyDefinition = (id: number) => options.enemies?.find(enemy => enemy.id === id) ?? findEnemy(id)!;
  function syncLoot(): void {
    for (const game of games.values()) {
      const received = credited.get(game) ?? new Map<number, number>();
      for (const { itemId, count } of game.inventory) {
        const previous = received.get(itemId) ?? 0;
        if (count > previous) player.addItem(itemId, count - previous);
        received.set(itemId, count);
      }
      credited.set(game, received);
    }
  }
  const cannotManage = () => Boolean(activeEncounter || pendingEncounter || current.message || progressionMessage || shopKind);
  const blocked = (): ActionResult => ({ ok: false, message: '今は操作できない。' });
  const attackedEnemies = new Set<number>();
  function beginEncounter(event: EncounterEvent): void {
    activeEncounter = event;
    syncLoot();
    battle = createBattle(enemyDefinition(event.enemyId), { player: player.battleDefinition(enemyDefinition(event.enemyId)), playerHp: player.vitals.hp, playerMp: player.vitals.mp, poisoned: player.vitals.poisoned,
      consumeItem: player.consume, equipment: player.equipment, wasAttacked: event.entityIndex !== undefined ? attackedEvents.has(`${event.stageId}:${event.entityIndex}`) : enemyDefinition(event.enemyId).characterId === kingEncounter.characterId && attackedEnemies.has(event.enemyId), onAttacked: () => { if (event.entityIndex !== undefined) attackedEvents.add(`${event.stageId}:${event.entityIndex}`); else if (enemyDefinition(event.enemyId).characterId === kingEncounter.characterId) attackedEnemies.add(event.enemyId); } });
  }
  function rollEncounter(): void {
    const settings = current.scene.encounter;
    if (!settings?.enabled || settings.rate === 0) return;
    // 一度倒した王様だけを候補から外し、残りの割合を正規化する。
    const entries = encounterEntries(settings).filter(entry => {
      const enemy = enemyDefinition(entry.enemyId);
      return enemy.characterId !== kingEncounter.characterId || (defeatCounts.get(enemy.id) ?? 0) < kingEncounter.maxDefeatsPerGame;
    });
    if (!entries.length || random() * 100 >= settings.rate) return;
    let chosen = entries[0];
    if (entries.length > 1) {
      let draw = random() * entries.reduce((sum, e) => sum + e.weight, 0);
      chosen = entries[entries.length - 1];
      for (const entry of entries) { draw -= entry.weight; if (draw < 0) { chosen = entry; break; } }
    }
    const enemy = enemyDefinition(chosen.enemyId);
    const event = { enemyId: enemy.id, name: enemy.name, stageId: current.scene.id };
    if (current.message) pendingEncounter = event;
    else beginEncounter(event);
  }
  const tileKey = () => {
    const feet = playerCollisionFrame(current.position);
    return `${current.scene.id}:${Math.floor((feet.x + 8) / 16)},${Math.floor((feet.y + 8) / 16)}`;
  };
  let ignored = tileKey();
  function transition(): boolean {
    if (activeEncounter || current.message || progressionMessage || shopKind || tileKey() === ignored) return false;
    const feet = playerCollisionFrame(current.position);
    const exit = current.scene.exits?.find(exit => exit.x === Math.floor((feet.x + 8) / 16) && exit.y === Math.floor((feet.y + 8) / 16));
    if (!exit) return false;
    const target = scenes.find(scene => scene.id === exit.targetStageId)!;
    const arrival = exitArrival(exit);
    const existing = games.get(target.id);
    if (existing) { existing.enter(arrival, exit.direction); current = existing; }
    else {
      current = createWalkingGame(target, { position: arrival, direction: exit.direction });
      for (const kind of removedCharacters) current.removeCharacter(kind, encounterCharacter);
      games.set(target.id, current);
    }
    ignored = tileKey(); // 到着した出口は一度離れるまで発動させない。
    revision++;
    return true;
  }
  return {
    get cleared() { return cleared; },
    get story() { return story.summary(cleared); },
    get scene() { return current.scene; },
    get position() { return current.position; },
    get direction() { return current.direction; },
    get encounter() { return activeEncounter; },
    get battle() { return battle; },
    get playerHp() { return battle?.playerHp ?? player.vitals.hp; },
    get shop() { return shopKind ? findShop(shopKind) ?? null : null; },
    get status() {
      const definition = player.definition;
      return { name: definition.name, hp: battle?.playerHp ?? player.vitals.hp, maxHp: definition.stats.hp,
        mp: battle?.playerMp ?? player.vitals.mp, maxMp: definition.maxMp ?? 0,
        poisoned: battle?.poisoned ?? player.vitals.poisoned,
        attack: battle?.player.stats.attack ?? definition.stats.attack, defense: definition.stats.defense, baseStats: player.baseStats,
        gold: player.gold, equipment: player.equipment, appearance: player.appearance, skills: [...definition.skills ?? []], skillSchedule: player.skillSchedule,
        level: player.level, experience: player.experience, nextLevelExperience: player.nextLevelExperience };
    },
    get message() {
      const source = current.message;
      const message = source?.dialogue ? { ...source, text: dialogueText(source.dialogue, cleared) } : source;
      if (message?.battleEntityIndex !== undefined) {
        const event = current.scene.entities[message.battleEntityIndex].battleEvent!;
        const warning = royalEquipmentWarning(enemyDefinition(event.enemyId), player.equipment);
        if (warning) return { ...message, text: `${message.text}\n${warning}` };
      }
      return message ?? progressionMessage ?? (activeEncounter ? { speaker: '', text: `${activeEncounter.name}があらわれた！` } : null); },
    get visibleEntities() { return current.visibleEntities; },
    get openedChests() { return current.openedChests; },
    get revision() { return revision; },
    get inventory() {
      syncLoot(); return player.inventory;
    },
    get discoveredItems() { syncLoot(); return player.discoveredItems; },
    closeShop(): void { shopKind = null; },
    buy(itemId: number): ActionResult {
      if (activeEncounter || current.message || !shopKind || !findShop(shopKind)?.items.includes(itemId)) return blocked();
      syncLoot(); return player.buy(itemId);
    },
    sell(itemId: number): ActionResult {
      if (activeEncounter || current.message || !shopKind) return blocked();
      syncLoot(); return player.sell(itemId);
    },
    exchange(recipeId: number): ActionResult {
      if (activeEncounter || pendingEncounter || current.message || progressionMessage || !shopKind || !findShop(shopKind)?.recipes?.includes(recipeId)) return blocked();
      syncLoot(); return player.exchange(recipeId);
    },
    equip(itemId: number): ActionResult { if (cannotManage()) return blocked(); syncLoot(); return player.equip(itemId); },
    unequip(slot: EquipmentSlot): ActionResult { return cannotManage() ? blocked() : player.unequip(slot); },
    useItem(itemId: number): ActionResult { if (cannotManage()) return blocked(); syncLoot(); return player.useItem(itemId); },
    useFieldSkill(skillId: number): ActionResult { return cannotManage() ? blocked() : player.useFieldSkill(skillId); },
    cancelBattleDialogue(): boolean {
      return !activeEncounter && !pendingEncounter && !shopKind && current.cancelBattleDialogue();
    },
    move(direction: Direction): boolean {
      if (activeEncounter || pendingEncounter || current.message || progressionMessage || shopKind) return false;
      const moved = current.move(direction);
      if (moved) {
        if (tileKey() !== ignored) ignored = '';
        // 出口の歩みは移動を優先し、移動先でも抽選しない。
        const feet = playerCollisionFrame(current.position);
        const isExit = tileKey() !== ignored && current.scene.exits?.some(exit => exit.x === Math.floor((feet.x + 8) / 16) && exit.y === Math.floor((feet.y + 8) / 16));
        if (isExit) transition();
        else rollEncounter();
      } else {
        // マップ端の出口から、そのまま外へ歩いて出られる。
        const feet = playerCollisionFrame(current.position);
        const dx = direction === 'left' ? -16 : direction === 'right' ? 16 : 0;
        const dy = direction === 'back' ? -16 : direction === 'front' ? 16 : 0;
        if (feet.x + dx < 0 || feet.y + dy < 0 || feet.x + dx + 16 > current.scene.width * 16 || feet.y + dy + 16 > current.scene.height * 16) {
          ignored = '';
          return transition();
        }
      }
      return moved;
    },
    interact(): void {
      if (activeEncounter || shopKind) return;
      if (progressionMessage && !current.message) { progressionMessage = null; return; }
      const requestedShop = current.message?.shopKind;
      const requestedBattle = current.message?.battleEntityIndex;
      const wasMessage = Boolean(current.message);
      current.interact();
      story.record(current.message?.dialogue);
      if (requestedBattle !== undefined && !current.message) {
        const event = current.scene.entities[requestedBattle].battleEvent!;
        const enemy = enemyDefinition(event.enemyId);
        pendingEncounter = null; beginEncounter({ enemyId: enemy.id, name: enemy.name, stageId: current.scene.id, entityIndex: requestedBattle }); return;
      }
      if (!current.message && pendingEncounter) {
        const event = pendingEncounter; pendingEncounter = null; beginEncounter(event); return;
      }
      if (requestedShop && !current.message && findShop(requestedShop)) { shopKind = requestedShop; return; }
      if (wasMessage) transition(); // 出口と落とし物が同じマスなら取得メッセージの後に移動。
    },
    finishEncounter(outcome: EncounterOutcome): void {
      if (!activeEncounter || !battle) return;
      if (battle.phase !== outcome) throw new Error('戦闘の結果がまだ確定していません。');
      const wasCleared = cleared;
      const respawn = outcome === 'defeat' ? [current, games.get(initial.id)!].find(game => game.scene.spawn && canStand({ ...game.scene, entities: game.visibleEntities }, game.scene.spawn)) : undefined;
      if (outcome === 'defeat' && !respawn) throw new Error('帰還できる開始位置がありません。');
      if (respawn) respawn.enter(respawn.scene.spawn!, 'front');
      player.setVitals({ hp: battle.playerHp, mp: battle.playerMp, poisoned: battle.poisoned });
      if (outcome === 'victory') {
        if (activeEncounter.entityIndex !== undefined) {
          const event = current.scene.entities[activeEncounter.entityIndex].battleEvent!;
          if (event.once) current.removeEntity(activeEncounter.entityIndex);
          if (event.clear) cleared = true;
          revision++;
        }
        const enemy = battle.enemy;
        syncLoot();
        const before = player.definition;
        const progression = player.grantReward(enemy.reward);
        if (progression && progression.level > progression.previousLevel) {
          const after = player.definition;
          const lines = [`${after.name}はレベル${progression.level}になった！`,
            `最大HP＋${after.stats.hp - before.stats.hp}　最大MP＋${(after.maxMp ?? 0) - (before.maxMp ?? 0)}`,
            `攻撃力＋${after.stats.attack - before.stats.attack}　防御力＋${after.stats.defense - before.stats.defense}`,
            ...progression.learnedSkills.map(id => `${findSkill(id)!.name}を覚えた！`)];
          progressionMessage = { speaker: '', text: lines.join('\n') };
        }
        defeatCounts.set(enemy.id, (defeatCounts.get(enemy.id) ?? 0) + 1);
        if (enemy.characterId === kingEncounter.characterId && kingEncounter.removeFromStageAfterVictory) {
          removedCharacters.add(enemy.characterId);
          for (const game of games.values()) game.removeCharacter(enemy.characterId, encounterCharacter);
          const equipped = player.equipRoyalSet();
          if (equipped.ok) {
            const definition = player.definition;
            player.setVitals({ hp: definition.stats.hp, mp: definition.maxMp ?? 0, poisoned: player.vitals.poisoned });
            progressionMessage = { speaker: '', text: [progressionMessage?.text, equipped.message, 'HP・MPが全回復した！'].filter(Boolean).join('\n') };
          }
        }
      }
      if (outcome === 'victory' && cleared && !wasCleared) progressionMessage = { speaker: '', text: [progressionMessage?.text, 'GAME CLEAR！\n冒険をクリアした！', story.ending].filter(Boolean).join('\n') };
      activeEncounter = null;
      battle = null;
      if (outcome === 'defeat') {
        const lostGold = player.applyDefeatPenalty();
        player.setVitals({ hp: player.definition.stats.hp, mp: player.definition.maxMp ?? 0, poisoned: false });
        // 所持品・取得・撃破状態を保ち、現在の開始位置（なければ最初のマップ）へ戻る。
        current = respawn!; ignored = tileKey(); revision++;
        progressionMessage = { speaker: '', text: `意識を取り戻した…。\n${lostGold}Gを失った。（残り${player.gold}G）\nHP・MPが回復した。もう一度、旅を続けよう。` };
      }
    },
    reset(): void {
      cleared = false; story.reset(); attackedEvents.clear(); games.clear(); current = createWalkingGame(initial); games.set(initial.id, current);
      defeatCounts.clear(); removedCharacters.clear(); activeEncounter = null; pendingEncounter = null;
      attackedEnemies.clear(); battle = null; shopKind = null; progressionMessage = null; credited.clear(); player = newPlayer();
      ignored = tileKey(); revision++;
    },
  };
}
