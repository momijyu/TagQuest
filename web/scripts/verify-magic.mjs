import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../node_modules/vite/dist/node/index.js';

const root = fileURLToPath(new URL('../..', import.meta.url)), out = mkdtempSync(join(tmpdir(), 'tq-magic-'));
try {
  await build({ configFile: false, logLevel: 'silent', build: { lib: { entry: Object.fromEntries([
    ['player', 'game/player-state'], ['world', 'game/world'], ['battle', 'game/battle'],
    ['config', 'data/encounters/combat-config'], ['items', 'data/items'], ['progression', 'data/progression'],
  ].map(([name, file]) => [name, join(root, `web/src/${file}.ts`)])), formats: ['es'], fileName: (_, name) => `${name}.mjs` }, outDir: out } });
  const read = name => import(pathToFileURL(join(out, `${name}.mjs`)).href);
  const { createPlayerState } = await read('player'), { createWorldGame } = await read('world'), { createBattle } = await read('battle');
  const { playerConfig, enemyCatalog, parsePlayerDefinition, parseEnemyDefinitions } = await read('config');
  const { findItem, parseItemCatalog } = await read('items'), { progressionConfig, parseProgression } = await read('progression');
  assert.equal(playerConfig.stats.magic, 10); assert.equal(progressionConfig.growthPerLevel.magic, 2);
  const legacy = structuredClone(playerConfig); delete legacy.stats.magic;
  assert.equal(parsePlayerDefinition(legacy).stats.magic, 0);
  const legacyGrowth = structuredClone(progressionConfig); delete legacyGrowth.growthPerLevel.magic;
  assert.equal(parseProgression(legacyGrowth).growthPerLevel.magic, 0);
  const legacyGear = structuredClone(findItem(4)); delete legacyGear.equipment.magic;
  assert.equal(parseItemCatalog([legacyGear])[0].equipment.magic, 0);
  for (const magic of [-1, 1.5, 10000, NaN, Infinity, true, '10']) {
    assert.throws(() => parsePlayerDefinition({ ...playerConfig, stats: { ...playerConfig.stats, magic } }));
    assert.throws(() => parseEnemyDefinitions([{ ...enemyCatalog[1], stats: { ...enemyCatalog[1].stats, magic } }]));
    assert.throws(() => parseProgression({ ...progressionConfig, growthPerLevel: { ...progressionConfig.growthPerLevel, magic } }));
    assert.throws(() => parseItemCatalog([{ ...findItem(24), equipment: { ...findItem(24).equipment, magic } }]));
  }
  const level3 = createPlayerState(); level3.gainExperience(40); assert.equal(level3.baseStats.magic, 14);
  for (const [id, bonuses] of [[24, { attack: 2, magic: 14, mp: 15 }], [11, { attack: 30, magic: 180, mp: 200, hp: 100 }],
    [27, { defense: 3, magic: 6, mp: 10 }], [10, { defense: 120, magic: 40, hp: 200, mp: 50 }], [22, { defense: 2, magic: 4, mp: 8 }]]) {
    for (const [key, value] of Object.entries(bonuses)) assert.equal(findItem(id).equipment[key], value);
  }
  for (const id of [24, 27, 22, 10]) { level3.addItem(id, 1); assert.equal(level3.equip(id).ok, true); }
  assert.equal(level3.definition.stats.magic, 78); // base14 + 14 + 6 + 4 + 40
  level3.unequip('weapon'); assert.equal(level3.definition.stats.magic, 64);
  const capped = createPlayerState({ ...playerConfig, stats: { ...playerConfig.stats, magic: 9998 } });
  capped.addItem(11, 1); capped.equip(11); assert.equal(capped.definition.stats.magic, 9999);
  capped.gainExperience(900); assert.equal(capped.baseStats.magic, 9999);

  const enemy = { ...enemyCatalog[1], stats: { ...enemyCatalog[1].stats, hp: 9999, defense: 4 } };
  const caster = (attack, magic) => ({ ...playerConfig, maxMp: 100, stats: { ...playerConfig.stats, hp: 100, attack, magic } });
  function damage(attack, magic, skill = 1, defense = 4) {
    const battle = createBattle({ ...enemy, stats: { ...enemy.stats, defense } }, { player: caster(attack, magic) });
    assert.equal(battle.useSkill(skill).ok, true); return battle.feedback.amount;
  }
  assert.equal(damage(1, 20), 28); assert.equal(damage(9999, 20), 28, 'physical attack does not raise spell damage');
  assert.equal(damage(20, 0), 8); assert.equal(damage(20, 25), 33); assert.equal(damage(20, 0, 1, 9999), 1);
  assert.equal(damage(20, 0, 0), 26); assert.equal(damage(20, 9999, 0), 26, 'magic does not raise physical technique damage');
  for (const attack of [1, 9999]) {
    const definition = caster(attack, 7), battle = createBattle(enemy, { player: definition, playerHp: 1 });
    assert.equal(battle.useSkill(2).ok, true); assert.equal(battle.playerHp, 26); // 1 + 20 + floor(7*.8)
    const field = createPlayerState(definition); field.setVitals({ hp: 1, mp: 100, poisoned: true });
    assert.equal(field.useFieldSkill(2).ok, true); assert.equal(field.vitals.hp, 26); assert.equal(field.vitals.mp, 97); assert.equal(field.vitals.poisoned, true);
  }
  const sword = createPlayerState(), staff = createPlayerState();
  sword.addItem(4, 1); sword.equip(4); staff.addItem(24, 1); staff.equip(24);
  assert.ok(sword.definition.stats.attack > staff.definition.stats.attack);
  assert.ok(createBattle(enemy, { player: staff.definition }).player.stats.magic > sword.definition.stats.magic);
  const swordSpell = createBattle(enemy, { player: sword.definition }), staffSpell = createBattle(enemy, { player: staff.definition });
  swordSpell.useSkill(1); staffSpell.useSkill(1); assert.ok(staffSpell.feedback.amount > swordSpell.feedback.amount);
  const restored = createPlayerState(); restored.restore(JSON.parse(JSON.stringify(level3.snapshot())));
  assert.deepEqual(restored.definition.stats, level3.definition.stats, 'old save schema derives magic from XP and equipment IDs');

  const disk = new Map(), storage = { getItem: key => disk.get(key) ?? null, setItem: (key, value) => disk.set(key, value), removeItem: key => disk.delete(key) };
  const scene = { id: 0, width: 5, height: 5, spawn: { x: 16, y: 32 }, tiles: new Uint8Array(25).fill(7), entities: [], encounter: { enabled: true, rate: 100, enemyId: 1 } };
  const weak = { ...enemyCatalog[1], stats: { ...enemyCatalog[1].stats, hp: 1 }, reward: { gold: 0, experience: 40, items: [{ itemId: 24, quantity: 1 }] } };
  let game = createWorldGame([scene], 0, () => 0, { storage, enemies: [weak] }); game.move('right'); game.battle.attack();
  assert.match(game.battle.text, /魔力\+4/); game.finishEncounter('victory'); game.interact(); game.equip(24);
  assert.equal(game.status.magic, 28); game = createWorldGame([scene], 0, () => 0, { storage }); assert.equal(game.status.magic, 28);
  const other = createWorldGame([{ ...scene, id: 7 }], 7, () => 0, { storage }); assert.equal(other.status.magic, 28);
  other.reset(); assert.equal(other.status.magic, 10);
  console.log('Magic: independent spell/heal/physical scaling, level growth, specified gear bonuses, caps, legacy defaults/save recovery, cross-world persistence and config validation passed.');
} finally { rmSync(out, { recursive: true, force: true }); }
