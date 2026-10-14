// Gameplay regression cases for poison, boss turns, field healing and post-clear exploration.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../node_modules/vite/dist/node/index.js';
const root = fileURLToPath(new URL('../..', import.meta.url));
const out = mkdtempSync(join(tmpdir(), 'tagquest-ux-'));
try {
  await build({ configFile: false, logLevel: 'silent', build: { lib: { entry: {
    battle: join(root, 'web/src/game/battle.ts'), config: join(root, 'web/src/data/encounters/combat-config.ts'),
    state: join(root, 'web/src/game/player-state.ts'), world: join(root, 'web/src/game/world.ts'),
    items: join(root, 'web/src/data/items.ts'),
  }, formats: ['es'], fileName: (_, name) => `${name}.mjs` }, outDir: out, emptyOutDir: false } });
  const read = name => import(pathToFileURL(join(out, `${name}.mjs`)).href);
  const { createBattle } = await read('battle');
  const { enemyCatalog, playerConfig, parseEnemyDefinitions } = await read('config');
  const { createPlayerState } = await read('state');
  const { createWorldGame: createWorldGameBase } = await read('world');
  // Safety is tested with defaults in verify-gameplay; this suite isolates combat retries.
  const createWorldGame = (scenes, initial, random, options = {}) => createWorldGameBase(scenes, initial, random, { ...options, encounterGraceSteps: 0 });
  const { findItem } = await read('items');
  const mushroom = enemyCatalog.find(e => e.id === 2);
  const king = enemyCatalog.find(e => e.id === 0), demon = enemyCatalog.find(e => e.id === 4);
  const nextTurn = battle => { battle.advance(); if (battle.phase === 'enemy-action') battle.advance(); };

  for (const boss of [king, demon]) {
    assert.equal(boss.canEscape, false);
    const battle = createBattle(boss, { wasAttacked: boss.id === 0 });
    const hp = battle.playerHp, mp = battle.playerMp;
    battle.escape(); assert.equal(battle.phase, 'commands'); assert.match(battle.text, /この戦いからは逃げられない！/);
    battle.escape(); battle.cancelEscape(); battle.advance(); assert.equal(battle.phase, 'commands');
    assert.equal(battle.playerHp, hp); assert.equal(battle.playerMp, mp); assert.equal(battle.feedback, null);
    battle.guard(); battle.advance(); assert.equal(battle.phase, 'enemy-action', 'another command remains usable');
    battle.advance(); assert.equal(battle.phase, 'commands');
    const permitted = createBattle({ ...boss, canEscape: true }); permitted.escape(); assert.equal(permitted.phase, 'escape');
  }
  const peacefulKing = createBattle(king);
  assert.equal(peacefulKing.canEscape, true);
  assert.match(peacefulKing.text, /攻撃する前なら/);
  peacefulKing.guard(); nextTurn(peacefulKing);
  peacefulKing.escape(); assert.equal(peacefulKing.phase, 'escape');
  peacefulKing.cancelEscape(); peacefulKing.attack(); nextTurn(peacefulKing);
  assert.equal(peacefulKing.canEscape, false);
  const angryHp = peacefulKing.playerHp;
  peacefulKing.escape(); assert.equal(peacefulKing.phase, 'commands');
  assert.equal(peacefulKing.playerHp, angryHp, 'a blocked escape never spends a turn');
  const defaultEscape = structuredClone(mushroom); delete defaultEscape.canEscape;
  const fleeing = createBattle(parseEnemyDefinitions([defaultEscape])[0]); fleeing.escape(); assert.equal(fleeing.phase, 'escape');
  for (const value of [0, 1, 'false', null, [], {}]) {
    assert.throws(() => parseEnemyDefinitions([{ ...mushroom, canEscape: value }]));
    assert.throws(() => parseEnemyDefinitions([{ ...king, canEscapeBeforeAttacked: value }]));
    const bad = structuredClone(mushroom); bad.patterns.beforeAttacked[0].inflictPoison = value;
    assert.throws(() => parseEnemyDefinitions([bad]));
  }

  let antidotes = 2;
  const poisonBattle = createBattle(mushroom, { consumeItem: id => id === 1 && antidotes > 0 && Boolean(antidotes--) });
  poisonBattle.guard(); nextTurn(poisonBattle); assert.equal(poisonBattle.poisoned, false);
  poisonBattle.guard(); poisonBattle.advance();
  assert.equal(poisonBattle.poisoned, true); assert.equal(poisonBattle.playerHp, 34);
  assert.match(poisonBattle.text, /ゆうしゃは毒を受けた！/); assert.doesNotMatch(poisonBattle.text, /毒で/);
  assert.equal(poisonBattle.feedback.amount, 3); // Newly applied poison does not damage on this turn.
  poisonBattle.advance(); assert.equal(poisonBattle.useItem(1).ok, true); assert.equal(poisonBattle.poisoned, false);
  assert.equal(antidotes, 1); nextTurn(poisonBattle);
  const beforeRetry = poisonBattle.playerHp;
  assert.equal(poisonBattle.useItem(1).ok, false); assert.equal(antidotes, 1);
  assert.equal(poisonBattle.phase, 'commands'); assert.equal(poisonBattle.playerHp, beforeRetry);
  poisonBattle.guard(); nextTurn(poisonBattle); assert.equal(poisonBattle.poisoned, true, 'a later poison attack can reapply it');
  const poisonAttack = mushroom.patterns.beforeAttacked[1];
  const repeatPoison = createBattle({ ...mushroom, patterns: { beforeAttacked: [poisonAttack], afterAttacked: [poisonAttack] } });
  repeatPoison.guard(); repeatPoison.advance(); assert.equal(repeatPoison.playerHp, 37);
  assert.equal(repeatPoison.feedback.amount, 3); assert.doesNotMatch(repeatPoison.text, /毒で/);
  repeatPoison.advance(); repeatPoison.guard(); repeatPoison.advance();
  assert.equal(repeatPoison.playerHp, 32); assert.equal(repeatPoison.feedback.amount, 5);
  assert.match(repeatPoison.text, /毒で2のダメージ/); assert.doesNotMatch(repeatPoison.text, /毒を受けた/);
  const carriedPoison = createBattle(mushroom, { poisoned: true }); carriedPoison.guard(); carriedPoison.advance();
  assert.equal(carriedPoison.playerHp, 35); assert.match(carriedPoison.text, /毒で2のダメージ/);
  const lethal = createBattle(mushroom, { playerHp: 2, poisoned: true }); lethal.guard(); lethal.advance();
  assert.equal(lethal.phase, 'defeat'); assert.equal(lethal.playerHp, 0);
  const poisonOnly = createBattle({ ...mushroom, patterns: { beforeAttacked: [{ type: 'say', text: '様子を見ている。' }], afterAttacked: mushroom.patterns.afterAttacked } }, { playerHp: 1, poisoned: true });
  poisonOnly.guard(); poisonOnly.advance(); assert.equal(poisonOnly.phase, 'defeat'); assert.match(poisonOnly.text, /毒で1のダメージ/);
  const victorious = createBattle({ ...mushroom, stats: { ...mushroom.stats, hp: 1 } }, { poisoned: true });
  victorious.attack(); victorious.advance(); assert.equal(victorious.phase, 'victory'); assert.equal(victorious.playerHp, 40);

  const state = createPlayerState();
  assert.equal(state.useFieldSkill(2, () => .5).ok, false); assert.equal(state.vitals.mp, 10);
  state.setVitals({ hp: 10, mp: 10, poisoned: true });
  for (const id of [255, 0, 1]) assert.equal(state.useFieldSkill(id).ok, false);
  assert.deepEqual(state.vitals, { hp: 10, mp: 10, poisoned: true });
  assert.equal(state.useFieldSkill(2, () => .5).ok, true); assert.deepEqual(state.vitals, { hp: 34, mp: 7, poisoned: true });
  assert.equal(state.useFieldSkill(2, () => .5).ok, true); assert.deepEqual(state.vitals, { hp: 40, mp: 4, poisoned: true });
  assert.equal(state.useFieldSkill(2, () => .5).ok, false); assert.equal(state.vitals.mp, 4);
  state.setVitals({ hp: 20, mp: 2, poisoned: false }); assert.equal(state.useFieldSkill(2, () => .5).ok, false);
  assert.deepEqual(state.vitals, { hp: 20, mp: 2, poisoned: false });
  const unlearned = createPlayerState({ ...playerConfig, skills: [] }); unlearned.setVitals({ hp: 20, mp: 10, poisoned: false });
  assert.equal(unlearned.useFieldSkill(2).ok, false); assert.equal(unlearned.vitals.mp, 10);

  const scene = { id: 0, width: 6, height: 6, spawn: { x: 16, y: 32 }, tiles: new Uint8Array(36).fill(7), entities: [], encounter: { enabled: true, enemyId: 2, rate: 100 } };
  const kingScene = { ...scene, entities: [{ kind: 'king', x: 64, y: 0, parameters: [0] }], encounter: { enabled: true, enemyId: 0, rate: 100, once: true } };
  const royalVisit = createWorldGame([kingScene], 0, () => 0);
  royalVisit.move('right'); assert.equal(royalVisit.battle.canEscape, true);
  royalVisit.battle.escape(); royalVisit.finishEncounter('escape');
  assert.ok(royalVisit.visibleEntities.some(entity => entity.kind === 'king'), 'peaceful escape leaves the king in the castle');
  assert.equal(royalVisit.status.hp, playerConfig.stats.hp);
  royalVisit.move('left'); assert.equal(royalVisit.battle.wasAttacked, false);
  royalVisit.battle.attack(); nextTurn(royalVisit.battle);
  assert.equal(royalVisit.battle.canEscape, false);
  for (let turns = 0; royalVisit.battle.phase !== 'defeat'; turns++) {
    assert.ok(turns < 50); royalVisit.battle.guard(); nextTurn(royalVisit.battle);
  }
  royalVisit.finishEncounter('defeat'); royalVisit.interact();
  royalVisit.move('right'); assert.equal(royalVisit.battle.wasAttacked, true);
  assert.equal(royalVisit.battle.canEscape, false, 'provocation survives defeat and a new encounter');
  royalVisit.reset(); royalVisit.move('right'); assert.equal(royalVisit.battle.canEscape, true, 'reset restores peaceful escape');
  const game = createWorldGame([scene], 0, () => 0, { player: { ...playerConfig, initialItems: [{ itemId: 1, quantity: 1 }] } });
  game.move('right'); assert.equal(game.useFieldSkill(2).ok, false);
  game.battle.guard(); nextTurn(game.battle); game.battle.guard(); nextTurn(game.battle);
  game.battle.escape(); game.finishEncounter('escape');
  assert.equal(game.status.poisoned, true); assert.equal(game.status.hp, 34);
  assert.equal(game.useFieldSkill(2).ok, true); assert.equal(game.status.hp, 40); assert.equal(game.status.mp, 7); assert.equal(game.status.poisoned, true);
  assert.equal(game.useItem(1).ok, true); assert.equal(game.status.poisoned, false); assert.deepEqual(game.inventory, []);
  game.move('left'); assert.equal(game.battle.playerMp, 7); assert.equal(game.battle.poisoned, false);
  game.reset(); assert.equal(game.status.poisoned, false); assert.equal(game.status.mp, 10);

  const bossScene = { ...scene, encounter: undefined, entities: [{ kind: 'demon-lord', x: 16, y: 0, parameters: [], battleEvent: { enemyId: 4, once: true, clear: true } }] };
  const town = { ...scene, id: 1, encounter: undefined, entities: [{ kind: 'resident', x: 16, y: 0, parameters: [], dialogue: { type: 'custom', text: 'おめでとう！' } }] };
  bossScene.exits = [{ x: 2, y: 3, targetStageId: 1, targetX: 1, targetY: 3, direction: 'back' }];
  const winBoss = session => {
    session.battle.attack(); assert.equal(session.battle.phase, 'player-action');
    session.battle.advance(); session.battle.advance(); session.battle.attack();
    assert.equal(session.battle.phase, 'victory'); session.finishEncounter('victory');
  };
  const cleared = createWorldGame([bossScene, town], 0, () => 0, { player: { ...playerConfig, stats: { hp: 300, attack: 200, defense: 10 } } });
  cleared.move('back'); cleared.interact(); assert.equal(cleared.cancelBattleDialogue(), true); assert.equal(cleared.battle, null);
  cleared.interact(); cleared.interact(); assert.equal(cleared.cancelBattleDialogue(), false);
  winBoss(cleared); assert.equal(cleared.cleared, true);
  assert.match(cleared.message.text, /GAME CLEAR/); assert.equal(cleared.move('front'), false, 'the notice needs to be closed first');
  cleared.interact(); assert.equal(cleared.message, null); assert.ok(!cleared.visibleEntities.some(e => e.kind === 'demon-lord'));
  assert.equal(cleared.move('front'), true); assert.equal(cleared.move('right'), true); assert.equal(cleared.scene.id, 1);
  assert.equal(cleared.cleared, true); cleared.move('back'); cleared.move('back'); cleared.interact(); assert.equal(cleared.message.text, 'おめでとう！');
  cleared.interact(); cleared.reset(); assert.equal(cleared.cleared, false); assert.ok(cleared.visibleEntities.some(e => e.kind === 'demon-lord'));

  // A normal victory after clearing never repeats GAME CLEAR, even when it grants growth.
  let encounterRoll = 0.99;
  const continuing = createWorldGame([bossScene, { ...town, encounter: { enabled: true, enemyId: 1, rate: 50 } }], 0, () => encounterRoll,
    { player: { ...playerConfig, stats: { hp: 300, attack: 200, defense: 10 } }, enemies: [{ ...enemyCatalog.find(e => e.id === 1), stats: { hp: 1, attack: 1, defense: 0 }, reward: { gold: 1, experience: 60, items: [] } }] });
  continuing.move('back'); continuing.interact(); continuing.interact(); winBoss(continuing); continuing.interact();
  continuing.move('front'); continuing.move('right'); assert.equal(continuing.scene.id, 1);
  encounterRoll = 0; continuing.move('right'); assert.equal(continuing.battle.enemy.id, 1);
  continuing.battle.attack(); continuing.finishEncounter('victory');
  assert.equal(continuing.cleared, true); assert.match(continuing.message.text, /レベル3/); assert.doesNotMatch(continuing.message.text, /GAME CLEAR/);
  continuing.interact(); assert.equal(continuing.message, null);

  const proceeds = createPlayerState(); proceeds.grantReward(king.reward);
  assert.equal(proceeds.gold, 1600); assert.equal(proceeds.level, 10);
  for (const id of [9, 10, 11, 12]) { assert.equal(findItem(id).sellPrice, 500); assert.equal(proceeds.sell(id).ok, true); }
  assert.equal(proceeds.gold, 3600);
  console.log('UX: boss escape restrictions/turns/config, poison damage/reapplication/cure/defeat, field spell validation/MP/persistence, clear notice→travel/conversation/reset and royal sale balance passed.');
} finally { rmSync(out, { recursive: true, force: true }); }
