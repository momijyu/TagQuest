import { returnPortalKey, validReturnPortal, isDungeon, isTown } from './return-portal';
import { battleExperience } from './battle-rewards';
import type { ReturnPortal } from './return-portal';
import { facilityConfig, facilityNames, facilityServices, monsterSupport } from '../data/facilities';
import { inferLocationName } from './location-names';
import { interactionTarget } from './walking';
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
import { findSkill, isFieldSpell } from '../data/skills';
import { dialogueText, dialogueTemplates, purificationOffer } from '../data/interactions';
import { createStory } from './story';
import { bountyCatalog } from '../data/bounties';
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
  const facilitiesEnabled = source.some(scene => scene.entities.some(entity => (facilityServices.some(kind => kind === entity.kind) || ['blacksmith-building','teleport-shrine','casino-building','observatory','port-building','monster-corral'].includes(entity.kind))));
  let pendingRecruit: number | null = null, card: number | null = null;
  const saveKey = 'tagquest.play-save.v1';
  let safeSteps = 0, mistSteps = 0;
  let returnPortal: ReturnPortal | null = null;
  const dungeonEntries = new Map<number, ReturnPortal>();
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
  const initial = scenes.find(scene => scene.id === initialId)!;
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
  const claimedBounties = new Set<number>();
  let activeEncounter: EncounterEvent | null = null;
  let pendingEncounter: EncounterEvent | null = null;
  let battle: Battle | null = null;
  let victoryCommitted = false;
  function newPlayer() {
    const state = createPlayerState(options.player, undefined, facilitiesEnabled);
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
  const serviceShops: Record<string,ShopDefinition> = { 'guild-master':{merchant:'guild-master',name:'冒険者ギルド',items:[]}, 'bounty-board':{merchant:'bounty-board',name:'賞金首掲示板',items:[]}, sister:{merchant:'sister',name:'教会',items:[]} };
  for (const [merchant, name] of Object.entries(facilityNames)) if (merchant !== 'black-market-dealer') serviceShops[merchant] = { merchant, name, items: [] };
  const shopFor = (kind: string | null) => kind === 'innkeeper' ? innShop : kind ? serviceShops[kind] ?? findShop(kind) ?? null : null;
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
  function levelUpMessage(before: PlayerDefinition, result: ReturnType<typeof player.gainExperience>): GameMessage {
    const after = player.definition;
    return { speaker: '', text: [
      `${after.name}はレベル${result.level}になった！`,
      `最大HP＋${after.stats.hp - before.stats.hp}　最大MP＋${(after.maxMp ?? 0) - (before.maxMp ?? 0)}`,
      `攻撃力＋${after.stats.attack - before.stats.attack}　防御力＋${after.stats.defense - before.stats.defense}　魔力＋${after.stats.magic - before.stats.magic}`,
      'HP・MPが全回復した！', ...result.learnedSkills.map(id => `${findSkill(id)!.name}を覚えた！`),
    ].join('\n') };
  }
  function awardWalkingBonus(): void {
    const before = player.definition, result = player.walk();
    if (result && result.level > result.previousLevel) progressionMessage = levelUpMessage(before, result);
  }
  function beginEncounter(event: EncounterEvent): void {
    victoryCommitted = false;
    activeEncounter = event;
    syncLoot();
    battle = createBattle(enemyDefinition(event.enemyId), { support: facilitiesEnabled && player.companion !== null ? monsterSupport(player.companion) : undefined, random, victoryText: () => {
      const preview = createPlayerState(options.player, undefined, facilitiesEnabled); preview.restore(player.snapshot());
      const before = preview.definition, result = preview.gainExperience(battleExperience(enemyDefinition(event.enemyId).reward?.experience ?? 0, player.definition.experienceMultiplier, player.definition.roundExperienceUp)), after = preview.definition;
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
    if (!entries.length || random() * 100 >= Math.min(100, settings.rate * (player.definition.encounterMultiplier ?? 1))) return;
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
  function unlockGates(): void {
    if (!facilitiesEnabled || !player.inventory.some(item => item.itemId === 42)) return;
    for (const game of games.values()) for (const gate of game.visibleEntities.filter(entity => entity.kind === 'iron-gate')) {
      game.removeEntity(game.scene.entities.indexOf(gate)); revision++;
    }
  }
  function enterScene(target: SceneData, arrival: {x:number;y:number}, direction: Direction, recordEntry = false): void {
    if (recordEntry && target.id !== current.scene.id) dungeonEntries.set(target.id,{stageId:current.scene.id,...current.position,direction:current.direction});
    const existing = games.get(target.id);
    if (existing) { existing.enter({ x: arrival.x, y: arrival.y }, direction); current = existing; }
    else {
      current = createWalkingGame(target, { position: { x: arrival.x, y: arrival.y }, direction });
      for (const kind of removedCharacters) current.removeCharacter(kind, encounterCharacter);
      games.set(target.id, current);
    }
    unlockGates(); ignored = tileKey(); revision++;
  }
  function facilityTravel(): ActionResult {
    if (!facilitiesEnabled || current.message || progressionMessage || activeEncounter) return blocked();
    const currentName = inferLocationName(current.scene);
    const targetName = shopKind === 'well-entrance' ? '地下水路と闇市' : shopKind === 'locked-house' ? '古い民家の地下蔵'
      : shopKind === 'captain' ? currentName === '沈没神殿' ? '旅人の港と商人街' : '沈没神殿' : '';
    if (!targetName) return blocked();
    if (shopKind === 'locked-house' && !player.inventory.some(item => item.itemId === 42)) return {ok:false,message:'扉には合鍵が必要だ。'};
    const target = scenes.find(scene => inferLocationName(scene) === targetName);
    const exit = target && scenes.flatMap(scene => scene.exits ?? []).find(exit => exit.targetStageId === target.id);
    if (!target || !exit) return {ok:false,message:'この世界には目的地がありません。'};
    shopKind = null; enterScene(target, exitArrival(exit), exit.direction, true); safeSteps = 6;
    return {ok:true,message:`${targetName}へ移動した！`};
  }
  function transition(): boolean {
    if (activeEncounter || current.message || progressionMessage || shopKind || tileKey() === ignored) return false;
    const feet = playerCollisionFrame(current.position);
    const exit = current.scene.exits?.find(exit => exit.x === Math.floor((feet.x + 8) / 16) && exit.y === Math.floor((feet.y + 8) / 16));
    if (!exit) return false;
    const target = scenes.find(scene => scene.id === exit.targetStageId)!;
    if (facilitiesEnabled && inferLocationName(current.scene) === '旅人の港と商人街' && ['地下水路と闇市', '沈没神殿', '古い民家の地下蔵'].includes(inferLocationName(target))) return false;
    const arrival = exitArrival(exit);
    enterScene(target, arrival, exit.direction, true);
    return true;
  }
  function progressSnapshot() {
    syncLoot();
    return { returnPortal, mistSteps, dungeonEntries: [...dungeonEntries], pendingRecruit, card, claimedBounties: [...claimedBounties], cleared, safeSteps, stageId: current.scene.id, states: [...games].map(([id, game]) => ({ id, state: game.snapshot() })),
      heard: story.snapshot(), attackedEvents: [...attackedEvents], attackedEnemies: [...attackedEnemies], defeatCounts: [...defeatCounts], removedCharacters: [...removedCharacters] };
  }
  let savedWorlds: Record<string, ReturnType<typeof progressSnapshot>> = Object.create(null);
  function portalScenes(): SceneData[] { return scenes.map(scene => ({...scene,entities:games.get(scene.id)?.visibleEntities ?? scene.entities})); }
  function persistPortal(): void {
    if (!options.storage || !returnPortal) return;
    let stored: {version:number;worlds:Record<string,ReturnPortal>} = {version:1,worlds:Object.create(null)};
    try {
      const raw = options.storage.getItem(returnPortalKey);
      if (raw && raw.length <= 4000000) {
        const parsed = JSON.parse(raw);
        if (parsed.version === 1 && parsed.worlds && typeof parsed.worlds === 'object' && !Array.isArray(parsed.worlds)) stored.worlds=Object.assign(Object.create(null),parsed.worlds);
      }
    } catch { /* Invalid portal metadata cannot invalidate the hero's save. */ }
    stored.worlds[signature] = {...returnPortal};
    const encoded=JSON.stringify(stored);
    if (options.storage.getItem(returnPortalKey) !== encoded) options.storage.setItem(returnPortalKey,encoded);
  }
  let saveStatus = '';
  let lastSaved = '';
  function clearWorldProgress(): void {
    safeSteps = 0; mistSteps=0;returnPortal=null;dungeonEntries.clear();pendingRecruit = null; card = null; victoryCommitted = false;
    if (portal && mainCastle) { const original = source.find(scene => scene.id === mainCastle.id)!; mainCastle.tiles = original.tiles.slice(); mainCastle.exits = structuredClone(original.exits); scenes.splice(scenes.findIndex(scene => scene.id === portal!.dimensionId), 1); portal = null; }
    cleared = false; story.reset(); attackedEvents.clear(); games.clear(); current = createWalkingGame(initial); games.set(initial.id, current);
    defeatCounts.clear(); claimedBounties.clear(); removedCharacters.clear(); activeEncounter = null; pendingEncounter = null;
    attackedEnemies.clear(); battle = null; shopKind = null; progressionMessage = null; credited.clear();
    ignored = tileKey(); revision++;
  }
  let observedSave: string | null = null, saveConflict = false;
  let recoveryNotice = '', recoveryRaw: string | null = null, canBackupCurrent = false, needsDefeatSave = false;
  const backupKey = `${saveKey}.backup`, recoveryKey = `${saveKey}.recovery`;
  const conflictMessage = '別の画面で冒険が保存されました。上書きを防ぐため操作を止めています。再読み込みして続けてください。';
  function hasSaveConflict(): boolean {
    if (!options.storage || saveConflict) return saveConflict;
    try {
      if (options.storage.getItem(saveKey) !== observedSave) { saveConflict = true; saveStatus = conflictMessage; }
    } catch { /* 保存不可の案内はpersistで表示する。 */ }
    return saveConflict;
  }
  function persist(): void {
    if (!options.storage || hasSaveConflict()) return;
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
      // 修復前の原本と直前の正常な保存を残してから更新する。
      if (recoveryRaw !== null) { options.storage.setItem(recoveryKey, recoveryRaw); recoveryRaw = null; }
      if (canBackupCurrent && observedSave !== null) options.storage.setItem(backupKey, observedSave);
      if (hasSaveConflict()) return;
      options.storage.setItem(saveKey, serialized); observedSave = serialized; canBackupCurrent = true;
      persistPortal(); lastSaved = serialized;
      saveStatus = recoveryNotice ? `${recoveryNotice} 自動保存済み` : '自動保存済み';
    } catch { saveStatus = '保存できませんでした。ブラウザの保存設定を確認してください。'; }
  }
  const api = {
    save(): void { persist(); },
    get returnPortal() { return returnPortal ? {...returnPortal} : null; },
    get mistSteps() { return mistSteps; },
    get canReturnAtTownEntrance() { return Boolean(returnPortal && isTown(current.scene) && current.scene.exits?.some(exit => { return Math.abs(exit.x*16-current.position.x)+Math.abs(exit.y*16-16-current.position.y)<=16; })); },
    returnToPortal(): ActionResult {
      if (cannotManage() || pendingRecruit !== null) return blocked();
      if (!returnPortal || !validReturnPortal(returnPortal, portalScenes())) return {ok:false,message:'ゲートがないか、戻る場所がふさがれている。'};
      const point = returnPortal, target = scenes.find(scene => scene.id === point.stageId)!;
      enterScene(target,point,point.direction);safeSteps=6;
      return {ok:true,message:'光の門をくぐり、刻んだ場所へ帰還した！'};
    },
    get saveStatus() { return saveStatus; },
    get saveConflict() { return hasSaveConflict(); },
    get facilitiesEnabled() { return facilitiesEnabled; },
    get visitedStageIds() { return [...games.keys()]; },
    get pendingRecruit() { return pendingRecruit === null ? null : monsterSupport(pendingRecruit) ?? null; },
    recruitMonster(accept: boolean): ActionResult {
      if (!facilitiesEnabled || pendingRecruit === null || activeEncounter || current.message || progressionMessage || shopKind) return blocked();
      const id = pendingRecruit; pendingRecruit = null;
      const result = accept ? player.recruit(id) : {ok:true,message:'魔物は静かに去っていった。'};
      progressionMessage = {speaker:'',text:result.message}; return result;
    },
    get travelDestinations() { return [...games.values()].filter(game => game.scene.id !== current.scene.id).map(game => ({id:game.scene.id,name:inferLocationName(game.scene)})); },
    fastTravel(stageId: number): ActionResult {
      if (!facilitiesEnabled || shopKind !== 'shrine-keeper' || activeEncounter || current.message || progressionMessage) return blocked();
      const target = games.get(stageId);
      if (!target || target === current) return {ok:false,message:'まだ訪れたことのない場所です。'};
      shopKind = null; enterScene(target.scene, target.position, 'front'); safeSteps = 6;
      return {ok:true,message:`${inferLocationName(target.scene)}へ移動した！`};
    },
    travelFacility: facilityTravel,
    enhance(itemId: number): ActionResult { return facilitiesEnabled && shopKind === 'blacksmith' && !current.message && !activeEncounter ? player.enhance(itemId) : blocked(); },
    itemName(itemId: number): string { return player.itemName(itemId); },
    gearBonus(itemId: number, stat: string): number { return player.gearBonus(itemId,stat); },
    get casinoCard() { return card; },
    buyCoins(amount: number): ActionResult { return facilitiesEnabled && shopKind === 'casino-dealer' && card === null ? player.buyCoins(amount) : blocked(); },
    redeem(itemId: number): ActionResult { return facilitiesEnabled && shopKind === 'casino-dealer' && card === null ? player.redeem(itemId) : blocked(); },
    race(choice: number): ActionResult {
      if (!facilitiesEnabled || shopKind !== 'casino-dealer' || card !== null || !Number.isInteger(choice) || choice < 0 || choice > 3) return blocked();
      if (player.coins > Number.MAX_SAFE_INTEGER - facilityConfig.racePayout) return {ok:false,message:'これ以上コインを持てない。'};
      if (!player.spendCoins(facilityConfig.raceBet)) return {ok:false,message:'10コイン必要です。'};
      const winner = Math.min(3, Math.floor(random()*4));
      const rest = [0,1,2,3].filter(id => id !== winner);
      for(let i=rest.length-1;i>0;i--) { const j=Math.min(i,Math.floor(random()*(i+1))); [rest[i],rest[j]]=[rest[j],rest[i]]; }
      const order = [winner,...rest].map(id => id+1).join(' → ');
      if (winner === choice) player.addCoins(facilityConfig.racePayout);
      return {ok:true,message:`着順 ${order}（1着：スライム${winner+1}）！ ${winner===choice ? `${facilityConfig.racePayout}コインの配当！` : '予想は外れた。'}`};
    },
    startCard(): ActionResult {
      if (!facilitiesEnabled || shopKind !== 'casino-dealer' || card !== null) return blocked();
      if (player.coins > Number.MAX_SAFE_INTEGER - facilityConfig.cardPayout) return {ok:false,message:'これ以上コインを持てない。'};
      if (!player.spendCoins(facilityConfig.cardBet)) return {ok:false,message:`${facilityConfig.cardBet}コイン必要です。`};
      card = Math.min(9, 1 + Math.floor(random()*9)); return {ok:true,message:`今の数字は${card}。次は高い？ 低い？ 同じ数字は外れです。`};
    },
    guessCard(high: boolean): ActionResult {
      if (!facilitiesEnabled || shopKind !== 'casino-dealer' || card === null) return blocked();
      const next = Math.min(9,1+Math.floor(random()*9)), previous=card; card=null;
      const win = high ? next > previous : next < previous; if(win) player.addCoins(facilityConfig.cardPayout);
      return {ok:true,message:`${previous} → ${next}！ ${win ? `当たり！ ${facilityConfig.cardPayout}コインの配当！` : '外れ。'}`};
    },
    setCompanion(enemyId: number | null): ActionResult { return facilitiesEnabled && shopKind === 'corral-keeper' ? player.setCompanion(enemyId) : blocked(); },
    get fortune() { return [api.story?.objective ?? '各地の人々から旅の手がかりを聞こう。', ...api.bounties.filter(bounty => bounty.status === 'active').map(bounty => `${bounty.location}：${bounty.name}（推奨Lv${bounty.recommendedLevel}）`)]; },
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
    get bounties() { return bountyCatalog.filter(bounty=>source.some(scene=>scene.entities.some(entity=>entity.battleEvent?.enemyId===bounty.enemyId))).map(bounty=>({...bounty,status:claimedBounties.has(bounty.enemyId)?'claimed':(defeatCounts.get(bounty.enemyId)??0)>0?'defeated':'active'})); },
    claimBounty(enemyId:number): ActionResult {
      if(shopKind!=='guild-master' || activeEncounter || current.message || progressionMessage) return blocked();
      const bounty=api.bounties.find(b=>b.enemyId===enemyId);
      if(!bounty || bounty.status==='active') return {ok:false,message:'まだ討伐が確認できない。'};
      if(bounty.status==='claimed') return {ok:false,message:'この依頼は報告済みです。'};
      if(!Number.isSafeInteger(player.gold+bounty.bonus)) return {ok:false,message:'これ以上お金を持てない。'};
      if (!player.titles.includes(bounty.title) && player.titles.length >= 256) return {ok:false,message:'これ以上称号を記録できない。'};
      player.addTitle(bounty.title); player.addGold(bounty.bonus); claimedBounties.add(enemyId);
      return {ok:true,message:`討伐を確認した！ 特別ボーナス${bounty.bonus}Gを受け取った！\n名誉称号「${bounty.title}」を手に入れた！`};
    },
    purify(): ActionResult { return shopKind === 'sister' && !current.message && !progressionMessage && !activeEncounter && !pendingEncounter ? player.purify() : blocked(); },
    pray(): ActionResult { return shopKind==='sister' && !current.message && !activeEncounter ? player.pray() : blocked(); },
    get stages() { return scenes; },
    get portal() { return portal; },
    get safeSteps() { return safeSteps; },
    rename(value: string): ActionResult { return cannotManage() ? blocked() : player.rename(value); },
    rest(): ActionResult { return shopKind === 'innkeeper' ? player.rest(15) : blocked(); },
    get status() {
      const definition = player.definition;
      return { cursedEquipment: player.cursedEquipment, name: definition.name, hp: battle?.playerHp ?? player.vitals.hp, maxHp: definition.stats.hp,
        mp: battle?.playerMp ?? player.vitals.mp, maxMp: definition.maxMp ?? 0,
        poisoned: battle?.poisoned ?? player.vitals.poisoned,
        attack: battle?.player.stats.attack ?? definition.stats.attack, defense: definition.stats.defense, magic: battle?.player.stats.magic ?? definition.stats.magic, baseStats: player.baseStats,
        walkExperience: definition.walkExperience ?? 0, walkRegen: definition.walkRegen, regenSteps: player.regenSteps, victoryMpRecovery: definition.victoryMpRecovery ?? 0, goldMultiplier: definition.goldMultiplier ?? 1, selfDamageFraction: definition.selfDamageFraction ?? 0, cannotEscape: definition.cannotEscape ?? false, curseDamage: definition.curseDamage ?? 0, experienceMultiplier: definition.experienceMultiplier ?? 1, encounterMultiplier: definition.encounterMultiplier ?? 1, totalMpReduction: definition.mpCostReduction ?? 0, evasionChance: definition.evasionChance ?? 0, criticalChance: definition.criticalChance ?? 0, coins: player.coins, enhancements: player.enhancements, monsters: player.monsters, companion: player.companion, titles: player.titles, gold: player.gold, equipment: player.equipment, appearance: player.appearance, skills: [...definition.skills ?? []], skillSchedule: player.skillSchedule,
        level: player.level, experience: player.experience, nextLevelExperience: player.nextLevelExperience };
    },
    get message() {
      const source = current.message;
      const message = source?.dialogue ? { ...source, text: dialogueText(source.dialogue, cleared) } : source;
      if (message?.shopKind === 'sister' && player.cursedEquipment.length) return { ...message, speaker: 'シスター', text: purificationOffer };
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
    closeShop(): void { shopKind = null; card = null; },
    buy(itemId: number): ActionResult {
      if (activeEncounter || current.message || !shopKind || !findShop(shopKind)?.items.includes(itemId)) return blocked();
      syncLoot(); const result = player.buy(itemId); if (result.ok) unlockGates(); return result;
    },
    sell(itemId: number): ActionResult {
      if (activeEncounter || current.message || !shopKind || !findShop(shopKind)) return blocked();
      syncLoot(); return player.sell(itemId);
    },
    exchange(recipeId: number): ActionResult {
      if (activeEncounter || pendingEncounter || current.message || progressionMessage || !shopKind || !findShop(shopKind)?.recipes?.includes(recipeId)) return blocked();
      syncLoot(); return player.exchange(recipeId);
    },
    equip(itemId: number): ActionResult { if (cannotManage()) return blocked(); syncLoot(); return player.equip(itemId); },
    unequip(slot: EquipmentSlot): ActionResult { return cannotManage() ? blocked() : player.unequip(slot); },
    useItem(itemId: number): ActionResult { if (cannotManage()) return blocked(); syncLoot(); return player.useItem(itemId); },
    useFieldSkill(skillId: number): ActionResult {
      if (cannotManage() || pendingRecruit !== null) return blocked();
      const skill=findSkill(skillId);
      if (!skill || !isFieldSpell(skill)) return {ok:false,message:'フィールドでは使えない。'};
      if (skill.effect.type === 'heal-hp') return player.useFieldSkill(skillId,random);
      const allowed=player.canUseFieldSpell(skillId);if(!allowed.ok)return allowed;
      if (skill.effect.type === 'return-mark') {
        const point={stageId:current.scene.id,...current.position,direction:current.direction};
        if (!validReturnPortal(point,portalScenes())) return {ok:false,message:'ここには門を刻めない。'};
        player.spendMp(player.skillMpCost(skillId));returnPortal=point;revision++;
        return {ok:true,message:`${skill.name}を使った！ 光の魔方陣を刻んだ。メニューや街の入口から戻れます。`};
      }
      if (skill.effect.type === 'no-encounters') {
        player.spendMp(player.skillMpCost(skillId));mistSteps=skill.effect.steps;
        return {ok:true,message:`聖なる霧に包まれた！ あと${mistSteps}歩は通常の魔物と遭遇しない。`};
      }
      if (skill.effect.type === 'dungeon-escape') {
        if (!isDungeon(current.scene)) return {ok:false,message:'この場所は迷宮ではない。'};
        let point=dungeonEntries.get(current.scene.id);
        if (!point || !validReturnPortal(point,portalScenes())) {
          const exit=current.scene.exits?.find(exit => !isDungeon(scenes.find(scene=>scene.id===exit.targetStageId)!)) ?? current.scene.exits?.at(-1);
          point=exit ? {stageId:exit.targetStageId,...exitArrival(exit),direction:exit.direction} : current.scene.spawn ? {stageId:current.scene.id,...current.scene.spawn,direction:'front'} : undefined;
        }
        if (!point || !validReturnPortal(point,portalScenes())) return {ok:false,message:'脱出できる入口が見つからない。'};
        player.spendMp(player.skillMpCost(skillId));enterScene(scenes.find(scene=>scene.id===point!.stageId)!,point,point.direction);safeSteps=6;
        return {ok:true,message:'脱出の風に導かれ、迷宮の入口へ戻った！'};
      }
      return {ok:false,message:'フィールドでは使えない。'};
    },
    cancelBattleDialogue(): boolean {
      return !activeEncounter && !pendingEncounter && !shopKind && current.cancelBattleDialogue();
    },
    move(direction: Direction): boolean {
      if (activeEncounter || pendingEncounter || current.message || progressionMessage || shopKind || pendingRecruit !== null) return false;
      const moved = current.move(direction);
      if (moved) {
        const protectedByMist=mistSteps>0;if(protectedByMist)mistSteps--;
        if (tileKey() !== ignored) ignored = '';
        // 出口の歩みは移動を優先し、移動先でも抽選しない。
        const feet = playerCollisionFrame(current.position);
        const isExit = tileKey() !== ignored && current.scene.exits?.some(exit => exit.x === Math.floor((feet.x + 8) / 16) && exit.y === Math.floor((feet.y + 8) / 16));
        if (isExit) transition();
        awardWalkingBonus();
        if (!isExit && safeSteps > 0) safeSteps--; else if (!isExit && !protectedByMist && !progressionMessage) rollEncounter();
      } else {
        // マップ端の出口から、そのまま外へ歩いて出られる。
        const feet = playerCollisionFrame(current.position);
        const dx = direction === 'left' ? -16 : direction === 'right' ? 16 : 0;
        const dy = direction === 'back' ? -16 : direction === 'front' ? 16 : 0;
        if (feet.x + dx < 0 || feet.y + dy < 0 || feet.x + dx + 16 > current.scene.width * 16 || feet.y + dy + 16 > current.scene.height * 16) {
          ignored = '';
          const changed=transition();if(changed){if(mistSteps>0)mistSteps--;awardWalkingBonus();}return changed;
        }
      }
      return moved;
    },
    interact(): void {
      if (activeEncounter || shopKind || pendingRecruit !== null && !current.message && !progressionMessage) return;
      if (progressionMessage && !current.message) { progressionMessage = null; transition(); return; }
      const requestedShop = current.message?.shopKind;
      const requestedBattle = current.message?.battleEntityIndex;
      const wasMessage = Boolean(current.message);
      const targetIndex = !wasMessage && facilitiesEnabled ? interactionTarget(current.scene, current.position, current.direction) : undefined;
      const well = targetIndex === undefined ? undefined : current.scene.entities[targetIndex];
      if (well?.kind === 'well' && (well.itemId === undefined || current.snapshot().collected.includes(targetIndex!))) { shopKind = 'well-entrance'; return; }
      const lockedHouse = targetIndex !== undefined && current.scene.entities[targetIndex].kind.startsWith('house-') && !current.scene.entities[targetIndex].dialogue && current.scene.entities[targetIndex].itemId === undefined;
      if (lockedHouse && player.inventory.some(item => item.itemId === 42)) { shopKind = 'locked-house'; return; }
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
        if(enemy.id===11) player.addTitle('虚無の覇者');
        syncLoot();
        const before = player.definition;
        const progression = player.grantReward(enemy.reward);
        if (progression && progression.level > progression.previousLevel) {
          progressionMessage = levelUpMessage(before, progression);
        }
        const remaining = player.nextLevelExperience;
        if (progressionMessage || enemy.id === 11) progressionMessage = { speaker: '', text: [progressionMessage?.text, remaining === null ? '最高レベルに達した！' : `次のレベルまで あと${remaining - player.experience}EXP`, ...(enemy.id === 11 ? ['古代の虚無神を打ち倒し、世界の真の覇者となった！', '「虚無の覇者」の称号を手に入れた！'] : [])].filter(Boolean).join('\n') };
        if (facilitiesEnabled && activeEncounter.entityIndex === undefined && facilityConfig.recruitableEnemies.includes(enemy.id) && !player.monsters.includes(enemy.id) && random() < facilityConfig.recruitChance) pendingRecruit = enemy.id;
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
        mistSteps=0;current = respawn!; ignored = tileKey(); revision++;
        progressionMessage = { speaker: '', text: `意識を取り戻した…。\n${lostGold}Gを失った。（残り${player.gold}G）\nHP・MPが回復した。もう一度、旅を続けよう。` };
      }
    },
    reset(): void {
      try { for (const key of [saveKey, returnPortalKey, backupKey, recoveryKey]) options.storage?.removeItem(key); } catch { /* 保存不可でもリセットは可能 */ }
      observedSave = null; canBackupCurrent = false; recoveryRaw = null; recoveryNotice = ''; lastSaved = '';
      clearWorldProgress(); player = newPlayer();
    },
  };
  if (options.storage) {
    function restoreSaved(raw: string): void {
      if (raw.length > 4000000) throw new Error('保存データが大きすぎます。');
      const saved = JSON.parse(raw);
      if (saved.version !== 1 || !saved.worlds || typeof saved.worlds !== 'object' || Array.isArray(saved.worlds)) throw new Error('保存形式が違います。');
      const restored = newPlayer(); restored.restore(saved.player);
      if (restored.vitals.hp === 0 && saved.defeated !== true) throw new Error('保存HPが不正です。');
      player = restored; savedWorlds = Object.assign(Object.create(null), saved.worlds);
      const progress = Object.hasOwn(saved.worlds, signature) ? saved.worlds[signature] as ReturnType<typeof progressSnapshot> : undefined;
      try {
        if (progress) {
          if (typeof progress.cleared !== 'boolean' || !Number.isInteger(progress.safeSteps) || progress.safeSteps < 0 || progress.safeSteps > 6 || !Array.isArray(progress.states) || !Array.isArray(progress.heard)) throw new Error('保存された進行が不正です。');
          if (facilitiesEnabled) {
            const recruit = progress.pendingRecruit ?? null, savedCard = progress.card ?? null;
            if (recruit !== null && !monsterSupport(recruit) || savedCard !== null && (!Number.isInteger(savedCard) || savedCard < 1 || savedCard > 9)) throw new Error('保存施設データが不正です。');
            pendingRecruit = recruit; card = null; // A paid card game left on reload is forfeited, never rerolled free.
          }
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
          for (const enemyId of progress.claimedBounties ?? []) { if (!bountyCatalog.some(b=>b.enemyId===enemyId) || !(defeatCounts.get(enemyId)??0) || claimedBounties.has(enemyId)) throw new Error('保存された賞金報告が不正です。'); claimedBounties.add(enemyId); }
          for (const kind of progress.removedCharacters) { if (typeof kind !== 'string') throw new Error('消失状態が不正です。'); removedCharacters.add(kind); }
          unlockGates();
          if (progress.returnPortal && validReturnPortal(progress.returnPortal,portalScenes())) returnPortal={...progress.returnPortal};
          if (progress.mistSteps !== undefined && (!Number.isInteger(progress.mistSteps) || progress.mistSteps < 0 || progress.mistSteps > 255)) throw new Error('保存された霧の歩数が不正です。');
          mistSteps=progress.mistSteps ?? 0;
          for (const entry of progress.dungeonEntries ?? []) {
            if (!Array.isArray(entry) || entry.length !== 2 || !scenes.some(scene=>scene.id===entry[0]) || !validReturnPortal(entry[1],portalScenes())) continue;
            dungeonEntries.set(entry[0],{...entry[1]});
          }
          ignored = tileKey(); revision++;
        }
      } catch {
        // 主人公とほかの世界は保持し、この世界の進行だけを修復する。
        clearWorldProgress(); delete savedWorlds[signature]; recoveryRaw = raw;
        recoveryNotice = 'この世界の進行を読み込めなかったため、主人公を保持して開始地点へ戻しました。';
      }

      if (saved.defeated === true) {
        const lost = player.applyDefeatPenalty(); player.setVitals({ hp: player.definition.stats.hp, mp: player.definition.maxMp ?? 0, poisoned: false });
        const respawn = [current, games.get(initial.id)].find(game => game?.scene.spawn && canStand({ ...game.scene, entities: game.visibleEntities }, game.scene.spawn));
        if (respawn?.scene.spawn) { current = respawn; current.enter(respawn.scene.spawn, 'front'); }
        safeSteps = 6; mistSteps=0;ignored = tileKey(); revision++; progressionMessage = { speaker: '', text: `意識を取り戻した…。${lost}Gを失った。HP・MPが回復した。` };
      } else if (player.vitals.hp === 0) throw new Error('保存HPが不正です。');
      saveStatus = recoveryNotice || (progress ? '前回の冒険を再開した' : '保存した主人公を引き継いだ');
      canBackupCurrent = !recoveryNotice;
      needsDefeatSave = saved.defeated === true;
    }
    try {
      observedSave = options.storage.getItem(saveKey);
      if (observedSave !== null) restoreSaved(observedSave);
    } catch {
      const damaged = observedSave;
      clearWorldProgress(); player = newPlayer(); savedWorlds = Object.create(null);
      recoveryNotice = '保存データを読み込めなかったため、初期状態で開始しました。修復前のデータは退避します。';
      try {
        const backup = options.storage.getItem(backupKey);
        if (backup !== null) {
          recoveryNotice = ''; restoreSaved(backup);
          recoveryNotice = '保存データを読み込めなかったため、バックアップから復元しました。';
        }
      } catch {
        clearWorldProgress(); player = newPlayer(); savedWorlds = Object.create(null);
        recoveryNotice = '保存データを読み込めなかったため、初期状態で開始しました。修復前のデータは退避します。';
      }
      recoveryRaw = damaged; canBackupCurrent = false; saveStatus = recoveryNotice;
    }
    if (needsDefeatSave) persist();
    if (!returnPortal) try {
      const raw=options.storage.getItem(returnPortalKey);
      if(raw && raw.length<=4000000) {
        const saved=JSON.parse(raw), point=saved.version===1 && saved.worlds && Object.hasOwn(saved.worlds,signature) ? saved.worlds[signature] : null;
        if(validReturnPortal(point,portalScenes()))returnPortal={...point};
      }
    } catch { /* Broken or foreign portal data is ignored independently. */ }
    for (const key of Object.keys(api)) {
      const descriptor = Object.getOwnPropertyDescriptor(api, key)!;
      if (typeof descriptor.value !== 'function') continue;
      const original = descriptor.value;
      Object.defineProperty(api, key, { ...descriptor, value(...args: unknown[]) {
        if (['itemName', 'gearBonus'].includes(key)) return original.apply(api, args);
        if (hasSaveConflict()) {
          if (['move', 'cancelBattleDialogue'].includes(key)) return false;
          if (['save', 'interact', 'closeShop', 'reset', 'finishEncounter'].includes(key)) return;
          return { ok: false, message: conflictMessage };
        }
        const result = original.apply(api, args);
        if (key === 'reset') savedWorlds = Object.create(null);
        persist(); return result;
      } });
    }
  }
  return api;
}
