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
  const { progressionConfig, parseProgression, maximumExperience } = await module('progression');
  const { skillCatalog, findSkill, parseSkillCatalog } = await module('skills');
  const { itemCatalog, findItem, parseItemCatalog } = await module('items');
  const player = createPlayerState();
  assert.equal(player.level, 1); assert.equal(player.experience, 0); assert.equal(player.nextLevelExperience, 20);
  player.setVitals({ hp: 25, mp: 4, poisoned: true });
  player.gainExperience(19); assert.equal(player.level, 1);
  const leveled = player.gainExperience(1);
  assert.deepEqual(leveled, { previousLevel: 1, level: 2, learnedSkills: [] });
  assert.deepEqual(player.definition.stats, { hp: 45, attack: 12, defense: 1 });
  assert.deepEqual(player.vitals, { hp: 30, mp: 6, poisoned: true }); // missing HP/MP is preserved
  player.addItem(0, 1); player.useItem(0); assert.equal(player.vitals.hp, 45);
  player.gainExperience(100); assert.equal(player.level, 4); assert.equal(player.nextLevelExperience, 200);
  assert.deepEqual(player.definition.stats, { hp: 55, attack: 16, defense: 3 });
  const high = createPlayerState({ ...playerConfig, initialExperience: 60 });
  assert.equal(high.level, 3); assert.equal(high.vitals.hp, 50); assert.equal(high.vitals.mp, 14);
  high.gainExperience(999999); assert.equal(high.level, 10); assert.equal(high.nextLevelExperience, null);
  for (let index = 0; index < 1000; index++) high.gainExperience(999999);
  assert.equal(high.experience, maximumExperience); assert.equal(high.level, 10);
  const capped = createPlayerState({ ...playerConfig, stats: { hp: 9998, attack: 9998, defense: 9998 }, maxMp: 9998 });
  capped.gainExperience(900); assert.deepEqual(capped.definition.stats, { hp: 9999, attack: 9999, defense: 9999 });
  assert.equal(capped.vitals.mp, 9999);

  const skill = findSkill(1), gear = findItem(4).equipment;
  const oldLearn = skill.learnLevel, oldRequired = gear.requiredLevel;
  try {
    skill.learnLevel = 3; gear.requiredLevel = 3;
    const gated = createPlayerState();
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
