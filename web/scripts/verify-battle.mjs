// Turn order, editable combat config, king provocation and world lifecycle.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../node_modules/vite/dist/node/index.js';
const root = fileURLToPath(new URL('../..', import.meta.url));
const out = mkdtempSync(join(tmpdir(), 'tagquest-battle-'));
try {
  await build({ configFile: false, logLevel: 'silent', build: { lib: { entry: {
    battle: join(root, 'web/src/game/battle.ts'), config: join(root, 'web/src/data/encounters/combat-config.ts'),
    world: join(root, 'web/src/game/world.ts'), model: join(root, 'web/src/editor/model.ts'),
    skills: join(root, 'web/src/data/skills.ts'),
  }, formats: ['es'], fileName: (_, name) => `${name}.mjs` }, outDir: out, emptyOutDir: false } });
  const { createBattle } = await import(pathToFileURL(join(out, 'battle.mjs')));
  const { enemyCatalog, playerConfig, parseEnemyDefinitions, parsePlayerDefinition } = await import(pathToFileURL(join(out, 'config.mjs')));
  const { createWorldGame } = await import(pathToFileURL(join(out, 'world.mjs')));
  const { initialWorld, toSceneData } = await import(pathToFileURL(join(out, 'model.mjs')));
  const { skillCatalog, parseSkillCatalog } = await import(pathToFileURL(join(out, 'skills.mjs')));
  const king = enemyCatalog[0], before = structuredClone(king);
  let notified = 0;
  const battle = createBattle(king, { onAttacked: () => notified++ });
  assert.equal(battle.speech, 'よく来たのう、勇者よ。');
  for (let turn = 0; turn < 5; turn++) {
    battle.guard(); assert.equal(battle.speech, null); battle.advance();
    assert.equal(battle.phase, 'enemy-action'); assert.equal(battle.playerHp, 40); assert.equal(battle.wasAttacked, false);
    assert.equal(battle.text, `「${king.patterns.beforeAttacked[turn % 2].text}」`);
    assert.equal(battle.speech, king.patterns.beforeAttacked[turn % 2].text);
    battle.advance(); assert.equal(battle.speech, null);
  }
  battle.attack(); assert.equal(battle.enemyHp, 20); assert.equal(battle.phase, 'player-action'); assert.equal(notified, 1);
  battle.attack(); battle.guard(); battle.escape(); assert.equal(battle.enemyHp, 20); // action cannot be repeated or skipped
  battle.advance(); assert.match(battle.text, /何をするんじゃ！！！/); assert.equal(battle.playerHp, 34);
  assert.equal(battle.speech, '何をするんじゃ！！！');
  assert.equal(battle.phase, 'enemy-action'); battle.attack(); assert.equal(battle.enemyHp, 20);
  battle.advance(); battle.guard(); battle.advance(); assert.equal(battle.playerHp, 30); // 9 damage * .5 -> 4
  assert.match(battle.text, /光を放った/); assert.doesNotMatch(battle.text, /何をするんじゃ/);
  assert.equal(battle.speech, '無礼者め！');
  battle.advance(); battle.attack(); battle.advance(); assert.equal(battle.playerHp, 24); // protection expires
  assert.equal(battle.speech, null); // narration alone is not a spoken line
  battle.advance(); battle.attack(); assert.equal(battle.phase, 'victory'); assert.equal(battle.enemyHp, 0);
  assert.equal(battle.speech, null);
  battle.advance(); battle.guard(); battle.escape(); assert.equal(battle.phase, 'victory'); assert.equal(battle.playerHp, 24);
  assert.equal(notified, 1); assert.deepEqual(king, before);
  const weak = createBattle(king, { playerHp: 1, wasAttacked: true }); weak.guard(); weak.advance();
  assert.equal(weak.playerHp, 0); assert.equal(weak.phase, 'defeat'); weak.advance(); weak.attack(); assert.equal(weak.phase, 'defeat');
  const lethal = createBattle(king, { player: { ...playerConfig, stats: { ...playerConfig.stats, attack: 999 } } });
  lethal.attack(); lethal.advance(); assert.equal(lethal.phase, 'victory'); assert.equal(lethal.playerHp, 40); // no dead enemy attack
  const changed = structuredClone(king); changed.stats = { hp: 55, attack: 20, defense: 4 };
  changed.patterns.afterAttacked = [{ type: 'attack', text: '<changed>😀', speech: '<speech>😀', power: 2 }];
  const edited = createBattle(parseEnemyDefinitions([changed])[0], { player: { ...playerConfig, stats: { hp: 100, attack: 15, defense: 7 } } });
  edited.attack(); assert.equal(edited.enemyHp, 44); edited.advance(); assert.equal(edited.playerHp, 67);
  assert.match(edited.text, /<changed>😀/);
  assert.equal(edited.speech, '何をするんじゃ！！！\n<speech>😀');
  const flee = createBattle({ ...king, canEscape: true }); flee.escape(); flee.cancelEscape(); assert.equal(flee.phase, 'commands'); assert.equal(flee.playerHp, 40);
  assert.equal(flee.speech, null);
  const attackingIntro = structuredClone(king); attackingIntro.patterns.beforeAttacked = [{ type: 'attack', text: '王様の行動説明', power: 1 }];
  assert.equal(createBattle(parseEnemyDefinitions([attackingIntro])[0]).speech, null);
  for (const mutate of [e => e.stats.hp = 0, e => e.stats.attack = true, e => e.stats.defense = -1,
    e => e.patterns.afterAttacked = [], e => e.patterns.beforeAttacked = [{ type: 'other', text: 'a' }],
    e => e.patterns.afterAttacked[0].power = 0, e => e.patterns.afterAttacked[0].power = Infinity,
    e => e.firstAttackedMessage = '\u0000', e => e.patterns.afterAttacked[0].speech = '',
    e => e.patterns.afterAttacked[0].speech = '\u0000', e => e.patterns.afterAttacked[0].speech = 42, e => e.id = 256]) {
    const bad = structuredClone(king); mutate(bad); assert.throws(() => parseEnemyDefinitions([bad]));
  }
  assert.throws(() => parseEnemyDefinitions([king, king]));
  assert.throws(() => parsePlayerDefinition({ ...playerConfig, guardMultiplier: 2 }));
  for (const hp of [0, -1, 41, 1.5]) assert.throws(() => createBattle(king, { playerHp: hp }));
  const skills = createBattle(king);
  assert.equal(skills.useSkill(255).ok, false); assert.equal(skills.playerMp, 10);
  assert.equal(skills.useSkill(2).ok, false); assert.equal(skills.phase, 'commands'); // no needless healing/MP cost
  assert.equal(skills.useSkill(0).ok, true); assert.equal(skills.playerMp, 8); assert.equal(skills.enemyHp, 15);
  assert.equal(skills.wasAttacked, true); assert.equal(skills.useSkill(0).ok, false); assert.equal(skills.playerMp, 8);
  skills.advance(); assert.match(skills.speech, /何をするんじゃ/); skills.advance();
  assert.equal(skills.useSkill(2).ok, true); assert.equal(skills.playerHp, 40); assert.equal(skills.playerMp, 5);
  skills.advance(); skills.advance(); skills.useSkill(1); assert.equal(skills.enemyHp, 3); assert.equal(skills.playerMp, 2);
  skills.advance(); skills.advance(); assert.equal(skills.useSkill(1).ok, false); assert.equal(skills.phase, 'commands');
  const peacefulHeal = createBattle(king, { playerHp: 10 }); peacefulHeal.useSkill(2); peacefulHeal.advance();
  assert.equal(peacefulHeal.playerHp, 30); assert.equal(peacefulHeal.wasAttacked, false);
  const skillKill = createBattle({ ...king, stats: { ...king.stats, hp: 12 }, reward: { gold: 10, items: [] } });
  skillKill.useSkill(1); assert.equal(skillKill.phase, 'victory'); assert.equal(skillKill.playerHp, 40); assert.match(skillKill.text, /10G/);
  const gearSkill = createBattle(king, { player: { ...playerConfig, stats: { ...playerConfig.stats, attack: 17 } } });
  gearSkill.useSkill(0); assert.equal(gearSkill.enemyHp, 5); // floor(17 * 1.5) = 25
  assert.equal(createBattle(king, { player: { ...playerConfig, skills: [] } }).useSkill(0).ok, false);
  const manaScene = { id: 0, width: 5, height: 5, spawn: { x: 16, y: 32 }, entities: [], tiles: new Uint8Array(25).fill(7), encounter: { enemyId: 0, enabled: true, rate: 100 } };
  const manaWorld = createWorldGame([manaScene], 0, () => 0, { enemies: [{ ...king, canEscape: true }] }); manaWorld.move('left'); manaWorld.battle.useSkill(1);
  manaWorld.battle.advance(); manaWorld.battle.advance(); manaWorld.battle.escape(); manaWorld.finishEncounter('escape');
  assert.equal(manaWorld.status.mp, 7); manaWorld.move('right'); assert.equal(manaWorld.battle.playerMp, 7);
  manaWorld.reset(); assert.equal(manaWorld.status.mp, 10);
  for (const change of [s => s.mpCost = -1, s => s.kind = 'unknown', s => s.effect.power = 0, s => s.effect.power = Infinity, s => s.id = 256]) {
    const bad = structuredClone(skillCatalog); change(bad[0]); assert.throws(() => parseSkillCatalog(bad));
  }
  assert.throws(() => parseSkillCatalog([skillCatalog[0], skillCatalog[0]]));
  assert.throws(() => parseSkillCatalog([{ ...skillCatalog[1], effect: { type: 'magic-damage', amount: 0 } }]));
  for (const learned of [[255], [0, 0], [true], '0']) assert.throws(() => parsePlayerDefinition({ ...playerConfig, skills: learned }));
  const scenes = initialWorld().stages.map(toSceneData), source = structuredClone(scenes);
  const game = createWorldGame(scenes, 0, () => 0, { enemies: [{ ...king, canEscape: true }] });
  game.move('left'); assert.throws(() => game.finishEncounter('victory'));
  game.battle.attack(); game.battle.advance(); game.battle.advance();
  assert.equal(game.playerHp, 34); game.battle.escape(); game.finishEncounter('escape');
  assert.equal(game.playerHp, 34); assert.ok(game.visibleEntities.some(e => e.kind === 'king'));
  game.move('right'); assert.equal(game.scene.id, 1); game.move('back'); assert.equal(game.scene.id, 0);
  game.move('left'); assert.equal(game.battle.wasAttacked, true); assert.equal(game.battle.playerHp, 34);
  assert.equal(game.battle.enemyHp, 30);
  while (game.battle.phase !== 'defeat') { game.battle.guard(); game.battle.advance(); if (game.battle.phase === 'enemy-action') game.battle.advance(); }
  const revision = game.revision;
  game.finishEncounter('defeat'); assert.equal(game.battle, null); assert.equal(game.playerHp, 40);
  assert.deepEqual(game.position, scenes[0].spawn); assert.equal(game.revision, revision + 1);
  assert.ok(game.visibleEntities.some(e => e.kind === 'king'));
  game.move('left'); assert.equal(game.battle.wasAttacked, true);
  game.reset(); game.move('left'); assert.equal(game.battle.wasAttacked, false); assert.equal(game.playerHp, 40);
  assert.deepEqual(scenes, source);
  for (const enemy of enemyCatalog.filter(enemy => enemy.id !== 0)) {
    // Every normal monster attacks without provocation and awards repeatable rewards.
    const guarded = createBattle(enemy, { player: { ...playerConfig, stats: { ...playerConfig.stats, hp: 9999 } } }); guarded.guard(); guarded.advance();
    assert.equal(guarded.phase, 'enemy-action'); assert.ok(guarded.playerHp < 9999);
    assert.equal(guarded.wasAttacked, false); assert.equal(guarded.speech, null);
    const field = { ...manaScene, encounter: { enemyId: enemy.id, enabled: true, rate: 100 },
      entities: [{ kind: 'king', x: 48, y: 0, parameters: [1] }] };
    // Boss artwork/config is also usable from an NFC enemy ID; use a stronger test player for it.
    const loop = createWorldGame([field], 0, () => 0, { player: { ...playerConfig,
      ...(enemy.characterId === 'demon-lord' ? { stats: { hp: 3000, attack: 400, defense: 259 } } : {}),
      initialItems: [{ itemId: 0, quantity: 6 }] } });
    for (let round = 1; round <= 2; round++) {
      loop.move(round === 1 ? 'left' : 'right'); assert.equal(loop.battle.enemy.id, enemy.id);
      while (loop.battle.phase !== 'victory') {
        assert.notEqual(loop.battle.phase, 'defeat', `${enemy.name}, round ${round}`);
        if (loop.battle.phase === 'commands') {
          if (loop.battle.playerMp >= 3) assert.equal(loop.battle.useSkill(1).ok, true);
          else loop.battle.attack();
        } else loop.battle.advance();
      }
      if (enemy.reward.experience > 0) assert.match(loop.battle.text, /経験値を手に入れた/);
      loop.finishEncounter('victory'); loop.finishEncounter('victory');
      assert.equal(loop.status.experience, enemy.reward.experience * round);
      assert.equal(loop.status.gold, playerConfig.initialGold + enemy.reward.gold * round);
      assert.ok(loop.visibleEntities.some(entity => entity.kind === 'king')); // unrelated NPC is retained
      if (loop.message) loop.interact();
      while (loop.useItem(0).ok) {} // repeated fights start healed; wolf is the stronger early enemy
    }
    assert.equal(loop.status.level > 1, enemy.reward.experience * 2 >= 20);
  }
  for (const change of [e => e.battleImage = 'missing', e => e.battleImage = 1,
    e => e.background = 'desert', e => e.background = ['forest']]) {
    const bad = structuredClone(enemyCatalog[1]); change(bad); assert.throws(() => parseEnemyDefinitions([bad]));
  }
  console.log('Monsters: unprovoked attacks, all species including the demon lord, repeated encounters/rewards, NPC retention, XP growth and artwork config validation passed.');
  console.log('Battle: config validation/edits, peaceful and angry cycles, turn locking, guard expiry, damage, terminal states, persistent HP/provocation, defeat respawn and reset passed.');
} finally { rmSync(out, { recursive: true, force: true }); }
