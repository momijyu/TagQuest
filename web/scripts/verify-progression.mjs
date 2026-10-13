import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../node_modules/vite/dist/node/index.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const out = mkdtempSync(join(tmpdir(), 'tagquest-progression-'));
try {
  await build({ configFile: false, logLevel: 'silent', build: { lib: { entry: {
    state: join(root, 'web/src/game/player-state.ts'), world: join(root, 'web/src/game/world.ts'),
    battle: join(root, 'web/src/game/battle.ts'), config: join(root, 'web/src/data/encounters/combat-config.ts'),
    progression: join(root, 'web/src/data/progression.ts'), skills: join(root, 'web/src/data/skills.ts'),
    items: join(root, 'web/src/data/items.ts'),
  }, formats: ['es'], fileName: (_, name) => `${name}.mjs` }, outDir: out, emptyOutDir: false } });
  const module = name => import(pathToFileURL(join(out, `${name}.mjs`)));
  const { createPlayerState } = await module('state');
  const { createWorldGame } = await module('world');
  const { createBattle } = await module('battle');
  const { playerConfig, enemyCatalog, parsePlayerDefinition, parseReward } = await module('config');
  const { progressionConfig, parseProgression, maximumExperience, levelForExperience } = await module('progression');
  const { skillCatalog, findSkill, parseSkillCatalog } = await module('skills');
  const { itemCatalog, findItem, parseItemCatalog } = await module('items');
  const player = createPlayerState();
  assert.equal(player.level, 1); assert.equal(player.experience, 0); assert.equal(player.nextLevelExperience, 15);
  player.setVitals({ hp: 25, mp: 4, poisoned: true });
  player.gainExperience(14); assert.equal(player.level, 1);
  const leveled = player.gainExperience(1);
  assert.deepEqual(leveled, { previousLevel: 1, level: 2, learnedSkills: [] });
  assert.deepEqual(player.definition.stats, { hp: 45, attack: 12, defense: 1, magic: 12 });
  assert.deepEqual(player.vitals, { hp: 45, mp: 12, poisoned: true }); // level-up restores all HP/MP
  player.addItem(0, 1); player.useItem(0); assert.equal(player.vitals.hp, 45);
  player.gainExperience(100); assert.equal(player.level, 4); assert.equal(player.nextLevelExperience, 140);
  assert.deepEqual(player.definition.stats, { hp: 55, attack: 16, defense: 3, magic: 16 });
  const high = createPlayerState({ ...playerConfig, initialExperience: 60 });
  assert.equal(high.level, 3); assert.equal(high.vitals.hp, 50); assert.equal(high.vitals.mp, 14);
  high.gainExperience(999999); assert.equal(high.level, 99); assert.equal(high.nextLevelExperience, null);
  for (let index = 0; index < 1000; index++) high.gainExperience(999999);
  assert.equal(high.experience, maximumExperience); assert.equal(high.level, 99);
  assert.equal(progressionConfig.levelThresholds.length, 99);
  assert.deepEqual(progressionConfig.levelThresholds.slice(0, 10), [0, 15, 40, 80, 140, 220, 330, 470, 650, 900]);
  for (const [index, threshold] of progressionConfig.levelThresholds.entries()) {
    assert.equal(levelForExperience(threshold), index + 1);
    if (index) assert.equal(levelForExperience(threshold - 1), index);
  }
  assert.equal(levelForExperience(97020), 99);
  assert.deepEqual(high.baseStats, { hp: 530, mp: 206, attack: 206, defense: 98, magic: 206 });
  const veteran = createPlayerState();
  assert.deepEqual(veteran.gainExperience(97020).learnedSkills, skillCatalog.filter(skill => skill.learnLevel > 1).map(skill => skill.id));
  assert.deepEqual(veteran.gainExperience(1).learnedSkills, [], 'skills are announced only once');
  assert.deepEqual(veteran.definition.skills, skillCatalog.map(skill => skill.id));
  for (const skill of skillCatalog.filter(skill => skill.id >= 3)) {
    const level = skill.learnLevel;
    const novice = createPlayerState({ ...playerConfig, initialExperience: progressionConfig.levelThresholds[level - 1] - 1 });
    const locked = createBattle(enemyCatalog[1], { player: novice.definition });
    assert.equal(locked.useSkill(skill.id).ok, false); assert.equal(locked.playerMp, novice.vitals.mp); assert.equal(locked.phase, 'commands');
    assert.deepEqual(novice.gainExperience(1).learnedSkills, [skill.id]);
    const caster = createPlayerState({ ...playerConfig, initialExperience: progressionConfig.levelThresholds[level - 1] });
    const definition = caster.definition;
    const battle = createBattle({ ...enemyCatalog[1], stats: { ...enemyCatalog[1].stats, hp: 9999 } }, { player: definition, playerHp: 1 });
    assert.equal(battle.useSkill(skill.id).ok, true);
    assert.equal(battle.playerMp, definition.maxMp - skill.mpCost);
    assert.equal(battle.phase, 'player-action');
    if (skill.effect.type === 'magic-damage') {
      assert.equal(battle.enemyHp, 9999 - Math.max(1, skill.effect.amount + Math.floor(definition.stats.magic * 1.0) - battle.enemy.stats.defense));
      assert.equal(caster.useFieldSkill(skill.id).ok, false);
    } else if (skill.effect.type === 'physical-damage') {
      assert.equal(battle.enemyHp, 9999 - Math.max(1, Math.floor(definition.stats.attack * skill.effect.power) - battle.enemy.stats.defense));
      assert.equal(battle.playerHp, 1);
      assert.equal(caster.useFieldSkill(skill.id).ok, false, 'physical techniques are battle-only');
    } else {
      assert.equal(battle.playerHp, Math.min(definition.stats.hp, 1 + skill.effect.amount + Math.floor(definition.stats.magic * 0.8)));
      assert.equal(caster.useFieldSkill(skill.id).ok, false, 'full HP does not consume MP');
      caster.setVitals({ hp: 1, mp: skill.mpCost - 1, poisoned: false });
      const insufficient = caster.vitals;
      assert.equal(caster.useFieldSkill(skill.id).ok, false); assert.deepEqual(caster.vitals, insufficient);
      caster.setVitals({ hp: 1, mp: definition.maxMp, poisoned: false });
      assert.equal(caster.useFieldSkill(skill.id).ok, true);
      assert.deepEqual(caster.vitals, { hp: Math.min(definition.stats.hp, 1 + skill.effect.amount + Math.floor(definition.stats.magic * 0.8)), mp: definition.maxMp - skill.mpCost, poisoned: false });
    }
    const dry = createBattle(enemyCatalog[1], { player: definition, playerHp: 1, playerMp: skill.mpCost - 1 });
    assert.equal(dry.useSkill(skill.id).ok, false); assert.equal(dry.playerMp, skill.mpCost - 1); assert.equal(dry.phase, 'commands');
  }
  const capped = createPlayerState({ ...playerConfig, stats: { hp: 9998, attack: 9998, defense: 9998, magic: 9998 }, maxMp: 9998 });
  capped.gainExperience(900); assert.deepEqual(capped.definition.stats, { hp: 9999, attack: 9999, defense: 9999, magic: 9999 });
  assert.equal(capped.vitals.mp, 9999);

  const skill = findSkill(1), gear = findItem(4).equipment;
  const oldLearn = skill.learnLevel, oldRequired = gear.requiredLevel;
  try {
    skill.learnLevel = 3; gear.requiredLevel = 3;
    const gated = createPlayerState({ ...playerConfig, skills: [0, 1, 2] });
    assert.deepEqual(gated.definition.skills, [0, 2]);
    assert.deepEqual(gated.skillSchedule.find(s => s.id === 1), { id: 1, learnLevel: 3, learned: false });
    assert.equal(gated.buy(4).ok, true); assert.equal(gated.gold, 20);
    const owned = gated.inventory;
    assert.equal(gated.equip(4).ok, false); assert.equal(gated.equipment.weapon, null); assert.deepEqual(gated.inventory, owned);
    const lockedBattle = createBattle(enemyCatalog[0], { player: { ...playerConfig, skills: [1], level: 1 } });
    assert.equal(lockedBattle.useSkill(1).ok, false); assert.equal(lockedBattle.playerMp, 10); assert.equal(lockedBattle.phase, 'commands');
    assert.deepEqual(gated.gainExperience(60).learnedSkills, [1]);
    assert.deepEqual(gated.definition.skills, [0, 1, 2]); assert.equal(gated.equip(4).ok, true);
    assert.equal(gated.definition.stats.attack, 21); assert.deepEqual(gated.inventory, owned);
    assert.deepEqual(gated.gainExperience(0).learnedSkills, []);
    assert.deepEqual(createPlayerState({ ...playerConfig, skills: [] }).gainExperience(900).learnedSkills, []);

    const scene = { id: 0, width: 5, height: 5, spawn: { x: 16, y: 32 }, tiles: new Uint8Array(25).fill(7),
      entities: [], encounter: { enabled: true, rate: 100, enemyId: 0 } };
    const enemy = { ...enemyCatalog[0], canEscape: true, reward: { gold: 0, experience: 60, items: [] } };
    const world = createWorldGame([scene], 0, () => 0, { enemies: [enemy] });
    world.move('right');
    for (let index = 0; index < 3; index++) {
      world.battle.attack();
      if (world.battle.phase !== 'victory') { world.battle.advance(); world.battle.advance(); }
    }
    assert.match(world.battle.text, /60の経験値/);
    world.finishEncounter('victory'); world.finishEncounter('victory');
    assert.equal(world.status.experience, 60); assert.equal(world.status.level, 3); assert.equal(world.status.maxHp, 50);
    assert.match(world.message.text, /レベル3/); assert.match(world.message.text, /火の玉を覚えた/);
    const position = world.position; assert.equal(world.move('left'), false); assert.deepEqual(world.position, position);
    assert.equal(world.useItem(0).ok, false); world.interact(); assert.equal(world.message, null);
    assert.equal(world.move('left'), true); assert.equal(world.battle, null); // king stays defeated
    world.reset(); assert.equal(world.status.level, 1); assert.equal(world.status.experience, 0); assert.equal(world.message, null);
    world.move('right'); world.battle.escape(); world.finishEncounter('escape'); assert.equal(world.status.experience, 0);
    const doomed = createWorldGame([scene], 0, () => 0, { player: { ...playerConfig, stats: { hp: 1, attack: 0, defense: 0 } }, enemies: [enemy] });
    doomed.move('right'); doomed.battle.attack(); doomed.battle.advance(); assert.equal(doomed.battle.phase, 'defeat');
    doomed.finishEncounter('defeat'); assert.equal(doomed.status.experience, 0); assert.equal(doomed.status.level, 1);
  } finally { skill.learnLevel = oldLearn; gear.requiredLevel = oldRequired; }
  // Real, unmodified defaults announce new magic after each early milestone.
  assert.deepEqual(createPlayerState().definition.skills, [0, 1, 2]);
  for (const [level, skillId, name] of [[3, 3, '氷の矢'], [5, 4, '大きな癒し'], [8, 5, '雷撃'], [6, 13, '連撃'], [18, 14, '渾身斬り'], [36, 15, '疾風連斬'], [50, 16, '天破斬']]) {
    const threshold = progressionConfig.levelThresholds[level - 1];
    const scene = { id: 0, width: 5, height: 5, spawn: { x: 16, y: 32 }, tiles: new Uint8Array(25).fill(7), entities: [], encounter: { enabled: true, rate: 100, enemyId: 1 } };
    const enemy = { ...enemyCatalog.find(entry => entry.id === 1), stats: { hp: 1, attack: 0, defense: 0 }, reward: { gold: 0, experience: 1, items: [] } };
    const session = createWorldGame([scene], 0, () => 0, { player: { ...playerConfig, initialExperience: threshold - 1 }, enemies: [enemy] });
    session.move('right'); assert.ok(!session.battle.player.skills.includes(skillId));
    session.battle.attack(); session.finishEncounter('victory');
    assert.equal(session.status.level, level); assert.ok(session.status.skills.includes(skillId));
    assert.ok(session.message.text.includes(`${name}を覚えた！`));
    session.interact(); assert.equal(session.message, null, 'learning is announced only once');
  }

  for (const thresholds of [[], [1, 20], [0, 0], [0, 20, 19], [0, 1.5], [0, maximumExperience + 1], Array(100).fill(0)]) {
    assert.throws(() => parseProgression({ ...progressionConfig, levelThresholds: thresholds }));
  }
  assert.throws(() => parseProgression({ ...progressionConfig, growthPerLevel: { ...progressionConfig.growthPerLevel, hp: -1 } }));
  for (const invalid of [-1, 1.5, maximumExperience + 1]) assert.throws(() => parsePlayerDefinition({ ...playerConfig, initialExperience: invalid }));
  for (const invalid of [-1, 1.5, 1000000]) {
    assert.throws(() => parseReward({ gold: 0, experience: invalid, items: [] }));
    const before = { xp: player.experience, gold: player.gold, inventory: player.inventory };
    assert.throws(() => player.grantReward({ gold: 10, experience: invalid, items: [{ itemId: 0, quantity: 1 }] }));
    assert.deepEqual({ xp: player.experience, gold: player.gold, inventory: player.inventory }, before);
  }
  for (const invalid of [0, 100, 1.5]) {
    assert.throws(() => parseSkillCatalog(skillCatalog.map(s => ({ ...s, learnLevel: invalid }))));
    assert.throws(() => parseItemCatalog(itemCatalog.map(i => i.equipment ? { ...i, equipment: { ...i.equipment, requiredLevel: invalid } } : i)));
  }
  const defaults = parseSkillCatalog(skillCatalog.map(({ learnLevel, ...s }) => s));
  assert.equal(defaults[0].learnLevel, 1);
  assert.equal(parseReward({ gold: 0, items: [] }).experience, 0);
  console.log('Progression: exact thresholds, multiple levels, XP/stat caps, growth/vitals, initial XP, skill learning, gear requirements, battle gates, victory once, popup lock, escape/defeat/reset and config validation passed.');
} finally { rmSync(out, { recursive: true, force: true }); }
