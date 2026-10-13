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
import type { ShopDefinition } from '../data/shops';
import { findSkill } from '../data/skills';
import { dialogueText, dialogueTemplates } from '../data/interactions';
import { createStory } from './story';
import { dimensionScene } from './postgame';
import catalog from '../data/scene-catalog.json';

export interface EncounterEvent { readonly enemyId: number; readonly name: string; readonly stageId: number; readonly entityIndex?: number }
export interface WorldGameOptions { player?: PlayerDefinition; enemies?: readonly EnemyDefinition[]; initialEquipment?: readonly number[]; encounterGraceSteps?: number; storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> }
export type EncounterOutcome = 'victory' | 'escape' | 'defeat';

/** ステージごとの取得状態を残し、ワールド全体を1回のプレイとして扱う。 */
export function createWorldGame(source: readonly SceneData[], initialId: number, random = () => Math.random(), options: WorldGameOptions = {}) {
  if (options.encounterGraceSteps !== undefined && (!Number.isInteger(options.encounterGraceSteps) || options.encounterGraceSteps < 0 || options.encounterGraceSteps > 6)) throw new Error('安全歩数は0〜6の整数で指定してください。');
  const scenes = source.map(scene => ({ ...structuredClone(scene) }));
  const signature = JSON.stringify(source);
  const saveKey = 'tagquest.play-save.v1';
  let safeSteps = 0;
  const mainCastle = scenes.find(scene => scene.entities.some(entity => entity.battleEvent?.clear));
  let portal: { stageId: number; x: number; y: number; dimensionId: number } | null = null;
  function openDimension(): void {
    if (!mainCastle || portal) return;
    const id = Array.from({ length: 256 }, (_, index) => index).find(index => !scenes.some(scene => scene.id === index));
    if (id === undefined) return;
    const throne = mainCastle.entities.find(entity => entity.kind === 'demon-throne');
    const centerX = throne ? Math.round(throne.x / 16) : Math.floor(mainCastle.width / 2);
    const upperY = throne ? Math.max(1, Math.floor(throne.y / 16) - 1) : 2;
    const free = (px: number, py: number) => canStand(mainCastle, { x: px * 16, y: py * 16 - 16 });
    const position = [{ x: centerX, y: upperY }, { x: centerX - 1, y: upperY }, { x: centerX + 1, y: upperY }, { x: centerX, y: upperY + 1 }]
      .find(p => free(p.x, p.y) && !(mainCastle.exits ?? []).some(exit => exit.x === p.x && exit.y === p.y));
    if (!position) return;
    const { x, y } = position;
    const arrival = [{ x: x - 1, y }, { x: x + 1, y }, { x, y: y + 1 }].find(position => free(position.x, position.y));
    if (!arrival) return;
    portal = { stageId: mainCastle.id, x, y, dimensionId: id };
    mainCastle.tiles = mainCastle.tiles.slice(); mainCastle.tiles[y * mainCastle.width + x] = catalog.tiles.indexOf('void-rift');
    mainCastle.exits = [...mainCastle.exits ?? [], { x, y, targetStageId: id, targetX: 9, targetY: 21, direction: 'back' }];
    for (const game of games.values()) if (game.scene.id === mainCastle.id) Object.assign(game.scene, { tiles: mainCastle.tiles, exits: mainCastle.exits });
    scenes.push(dimensionScene(id, mainCastle.id, arrival.x, arrival.y)); revision++;
  }
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
  let victoryCommitted = false;
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
  const innShop: ShopDefinition = { merchant: 'innkeeper', name: '宿屋', items: [] };
  const shopFor = (kind: string | null) => kind === 'innkeeper' ? innShop : kind ? findShop(kind) ?? null : null;
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
    victoryCommitted = false;
    activeEncounter = event;
    syncLoot();
    battle = createBattle(enemyDefinition(event.enemyId), { random, victoryText: () => {
      const preview = createPlayerState(options.player); preview.restore(player.snapshot());
      const before = preview.definition, result = preview.gainExperience(enemyDefinition(event.enemyId).reward?.experience ?? 0), after = preview.definition;
      return [result.level > result.previousLevel ? `レベルが${result.level}に上がった！ HP+${after.stats.hp - before.stats.hp}、MP+${(after.maxMp ?? 0) - (before.maxMp ?? 0)}、攻撃力+${after.stats.attack - before.stats.attack}、防御力+${after.stats.defense - before.stats.defense}、魔力+${after.stats.magic - before.stats.magic}！\nHP・MPが全回復した！` : '', preview.nextLevelExperience === null ? '最高レベルに達した！' : `次のレベルまで あと${preview.nextLevelExperience - preview.experience}EXP`].filter(Boolean).join('\n');
    }, player: player.battleDefinition(enemyDefinition(event.enemyId)), playerHp: player.vitals.hp, playerMp: player.vitals.mp, poisoned: player.vitals.poisoned,
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
  function progressSnapshot() {
    syncLoot();
    return { cleared, safeSteps, stageId: current.scene.id, states: [...games].map(([id, game]) => ({ id, state: game.snapshot() })),
      heard: story.snapshot(), attackedEvents: [...attackedEvents], attackedEnemies: [...attackedEnemies], defeatCounts: [...defeatCounts], removedCharacters: [...removedCharacters] };
  }
  let savedWorlds: Record<string, ReturnType<typeof progressSnapshot>> = Object.create(null);
  let saveStatus = '';
  let lastSaved = '';
  function persist(): void {
    if (!options.storage) return;
    try {
      if (battle?.phase === 'victory' && !victoryCommitted) {
        const resultBattle = battle, resultEvent = activeEncounter;
        // リザルト表示を保ったまま報酬と撃破を確定し、画面を閉じても失わない。
        api.finishEncounter('victory');
        resultBattle.completeVictory(player.definition, player.vitals);
        battle = resultBattle; activeEncounter = resultEvent; victoryCommitted = true;
      }
      savedWorlds[signature] = progressSnapshot();
      const state = player.snapshot();
      if (battle && !victoryCommitted) state.vitals = { hp: battle.playerHp, mp: battle.playerMp, poisoned: battle.poisoned };
      const serialized = JSON.stringify({ version: 1, defeated: battle?.phase === 'defeat', player: state, worlds: savedWorlds });
      if (serialized === lastSaved) return;
      options.storage.setItem(saveKey, serialized); lastSaved = serialized;
      saveStatus = '自動保存済み';
    } catch { saveStatus = '保存できませんでした。ブラウザの保存設定を確認してください。'; }
  }
  const api = {
    save(): void { persist(); },
    get saveStatus() { return saveStatus; },
    get cleared() { return cleared; },
    get trueCleared() { return cleared && (defeatCounts.get(11) ?? 0) > 0; },
    get story() {
      const summary = story.summary(cleared);
      if (!summary || !cleared) return summary;
      if ((defeatCounts.get(11) ?? 0) > 0) return { ...summary, objective: '世界の真の覇者となった。好きな場所へ旅を続けよう。' };
      return current.scene.id === portal?.dimensionId ? { ...summary, objective: '虚無の回廊で力を磨き、最奥の古代の虚無神に挑もう。' } : summary;
    },
    get scene() { return current.scene; },
    get position() { return current.position; },
    get direction() { return current.direction; },
    get encounter() { return activeEncounter; },
    get battle() { return battle; },
    get playerHp() { return battle?.playerHp ?? player.vitals.hp; },
    get shop() { return shopFor(shopKind); },
    get stages() { return scenes; },
    get portal() { return portal; },
    get safeSteps() { return safeSteps; },
    rename(value: string): ActionResult { return cannotManage() ? blocked() : player.rename(value); },
    rest(): ActionResult { return shopKind === 'innkeeper' ? player.rest(15) : blocked(); },
    get status() {
      const definition = player.definition;
      return { name: definition.name, hp: battle?.playerHp ?? player.vitals.hp, maxHp: definition.stats.hp,
        mp: battle?.playerMp ?? player.vitals.mp, maxMp: definition.maxMp ?? 0,
        poisoned: battle?.poisoned ?? player.vitals.poisoned,
        attack: battle?.player.stats.attack ?? definition.stats.attack, defense: definition.stats.defense, magic: battle?.player.stats.magic ?? definition.stats.magic, baseStats: player.baseStats,
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
        else if (safeSteps > 0) safeSteps--; else rollEncounter();
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
      if (requestedShop && !current.message && shopFor(requestedShop)) { shopKind = requestedShop; return; }
      if (wasMessage) transition(); // 出口と落とし物が同じマスなら取得メッセージの後に移動。
    },
    finishEncounter(outcome: EncounterOutcome): void {
      if (!activeEncounter || !battle) return;
      if (battle.phase !== outcome) throw new Error('戦闘の結果がまだ確定していません。');
      if (outcome === 'victory' && victoryCommitted) { activeEncounter = null; battle = null; victoryCommitted = false; return; }
      const wasCleared = cleared;
      safeSteps = options.encounterGraceSteps ?? 6;
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
            `攻撃力＋${after.stats.attack - before.stats.attack}　防御力＋${after.stats.defense - before.stats.defense}　魔力＋${after.stats.magic - before.stats.magic}`,
            'HP・MPが全回復した！', ...progression.learnedSkills.map(id => `${findSkill(id)!.name}を覚えた！`)];
          progressionMessage = { speaker: '', text: lines.join('\n') };
        }
        const remaining = player.nextLevelExperience;
        if (progressionMessage || enemy.id === 11) progressionMessage = { speaker: '', text: [progressionMessage?.text, remaining === null ? '最高レベルに達した！' : `次のレベルまで あと${remaining - player.experience}EXP`, ...(enemy.id === 11 ? ['古代の虚無神を打ち倒し、世界の真の覇者となった！', '「虚無の覇者」の称号を手に入れた！'] : [])].filter(Boolean).join('\n') };
        defeatCounts.set(enemy.id, (defeatCounts.get(enemy.id) ?? 0) + 1);
        if (enemy.characterId === kingEncounter.characterId && kingEncounter.removeFromStageAfterVictory) {
          story.record(current.scene.entities.find(entity => entity.kind === 'king' && encounterCharacter(entity))?.dialogue);
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
      if (outcome === 'victory' && cleared && !wasCleared) { openDimension(); progressionMessage = { speaker: '', text: [progressionMessage?.text, 'GAME CLEAR！\n冒険をクリアした！', story.ending, portal ? '玉座の奥に異次元への裂け目が現れた！' : ''].filter(Boolean).join('\n') }; }
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
      try { options.storage?.removeItem(saveKey); } catch { /* 保存不可でもリセットは可能 */ }
      safeSteps = 0; lastSaved = ''; victoryCommitted = false;
      if (portal && mainCastle) { const original = source.find(scene => scene.id === mainCastle.id)!; mainCastle.tiles = original.tiles.slice(); mainCastle.exits = structuredClone(original.exits); scenes.splice(scenes.findIndex(scene => scene.id === portal!.dimensionId), 1); portal = null; }
      cleared = false; story.reset(); attackedEvents.clear(); games.clear(); current = createWalkingGame(initial); games.set(initial.id, current);
      defeatCounts.clear(); removedCharacters.clear(); activeEncounter = null; pendingEncounter = null;
      attackedEnemies.clear(); battle = null; shopKind = null; progressionMessage = null; credited.clear(); player = newPlayer();
      ignored = tileKey(); revision++;
    },
  };
  if (options.storage) {
    try {
      const raw = options.storage.getItem(saveKey);
      if (raw) {
        if (raw.length > 4000000) throw new Error('保存データが大きすぎます。');
        const saved = JSON.parse(raw);
        if (saved.version !== 1 || !saved.worlds || typeof saved.worlds !== 'object' || Array.isArray(saved.worlds)) throw new Error('保存形式が違います。');
        player.restore(saved.player);
        const progress = Object.hasOwn(saved.worlds, signature) ? saved.worlds[signature] as ReturnType<typeof progressSnapshot> : undefined;
        if (progress) {
          if (typeof progress.cleared !== 'boolean' || !Number.isInteger(progress.safeSteps) || progress.safeSteps < 0 || progress.safeSteps > 6 || !Array.isArray(progress.states) || !Array.isArray(progress.heard)) throw new Error('保存された進行が不正です。');
          cleared = progress.cleared; safeSteps = progress.safeSteps; if (cleared) openDimension();
          games.clear(); credited.clear();
          for (const entry of progress.states) {
            const scene = scenes.find(scene => scene.id === entry.id); if (!scene || games.has(entry.id)) throw new Error('保存マップが不正です。');
            const safe = scene.spawn ?? Array.from({ length: scene.width * scene.height }, (_, index) => ({ x: index % scene.width * 16, y: Math.floor(index / scene.width) * 16 - 16 })).find(position => canStand(scene, position));
            if (!safe) throw new Error('保存マップに歩ける場所がありません。');
            const fullGame = createWalkingGame(scene, { position: safe, direction: 'front' });
            fullGame.restore(entry.state); games.set(entry.id, fullGame); credited.set(fullGame, new Map(fullGame.inventory.map(item => [item.itemId, item.count])));
          }
          const resumed = games.get(progress.stageId); if (!resumed) throw new Error('保存先がありません。'); current = resumed;
          story.restore(progress.heard);
          for (const value of progress.attackedEvents) { if (typeof value !== 'string') throw new Error('撃破状態が不正です。'); attackedEvents.add(value); }
          for (const value of progress.attackedEnemies) { if (!findEnemy(value)) throw new Error('敵が不明です。'); attackedEnemies.add(value); }
          for (const [id, count] of progress.defeatCounts) { if (!findEnemy(id) || !Number.isSafeInteger(count) || count < 0) throw new Error('撃破数が不正です。'); defeatCounts.set(id, count); }
          for (const kind of progress.removedCharacters) { if (typeof kind !== 'string') throw new Error('消失状態が不正です。'); removedCharacters.add(kind); }
          ignored = tileKey(); revision++;
        }
        if (saved.defeated === true) {
          const lost = player.applyDefeatPenalty(); player.setVitals({ hp: player.definition.stats.hp, mp: player.definition.maxMp ?? 0, poisoned: false });
          const respawn = [current, games.get(initial.id)].find(game => game?.scene.spawn && canStand({ ...game.scene, entities: game.visibleEntities }, game.scene.spawn));
          if (respawn?.scene.spawn) { current = respawn; current.enter(respawn.scene.spawn, 'front'); }
          safeSteps = 6; ignored = tileKey(); revision++; progressionMessage = { speaker: '', text: `意識を取り戻した…。${lost}Gを失った。HP・MPが回復した。` };
        } else if (player.vitals.hp === 0) throw new Error('保存HPが不正です。');
        savedWorlds = Object.assign(Object.create(null), saved.worlds); saveStatus = progress ? '前回の冒険を再開した' : '保存した主人公を引き継いだ';
        if (saved.defeated === true) persist();
      }
    } catch {
      // 壊れた保存で起動を止めず、確認できた初期設定から始める。
      api.reset(); savedWorlds = Object.create(null); saveStatus = '保存データを読み込めなかったため、最初から開始しました。';
    }
    for (const key of Object.keys(api)) {
      const descriptor = Object.getOwnPropertyDescriptor(api, key)!;
      if (typeof descriptor.value !== 'function') continue;
      const original = descriptor.value;
      Object.defineProperty(api, key, { ...descriptor, value(...args: unknown[]) {
        const result = original.apply(api, args);
        if (key === 'reset') savedWorlds = Object.create(null);
        persist(); return result;
      } });
    }
  }
  return api;
}
