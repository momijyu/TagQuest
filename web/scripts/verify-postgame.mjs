import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../node_modules/vite/dist/node/index.js';

const root = fileURLToPath(new URL('../..', import.meta.url)), out = mkdtempSync(join(tmpdir(), 'tq-postgame-'));
try {
  await build({ configFile: false, logLevel: 'silent', build: { lib: { entry: Object.fromEntries([
    ['battle', 'game/battle'], ['config', 'data/encounters/combat-config'], ['postgame', 'game/postgame'],
    ['clear', 'game/clear-record'], ['world', 'game/world'], ['items', 'data/items'], ['pixels', 'data/encounters/enemy-pixels'],
  ].map(([name, file]) => [name, join(root, `web/src/${file}.ts`)])), formats: ['es'], fileName: (_, name) => `${name}.mjs` }, outDir: out } });
  const read = name => import(pathToFileURL(join(out, `${name}.mjs`)).href);
  const { createBattle } = await read('battle'), { createWorldGame } = await read('world');
  const { playerConfig, enemyCatalog, parseEnemyDefinitions } = await read('config'), { dimensionScene } = await read('postgame');
  const { findItem } = await read('items'), { enemyPixelSprites } = await read('pixels'), { hasTrueClear, mountClearRecord } = await read('clear');
  const god = enemyCatalog.find(enemy => enemy.id === 11);
  assert.equal(god.stats.hp, 1200); assert.equal(god.stats.attack, 55); assert.equal(god.stats.defense, 25); assert.equal(god.actionsPerTurn, 2);
  const durable = { ...playerConfig, stats: { ...playerConfig.stats, hp: 1000, defense: 20 } };
  const attack = createBattle(god, { player: durable }); attack.attack(); attack.advance();
  assert.equal(attack.playerHp, 877); assert.equal(attack.feedback.amount, 123); // (77-20) + 66
  assert.match(attack.text, /虚無の爪痕[\s\S]*虚無の波動/); assert.equal(attack.phase, 'enemy-action');
  attack.advance(); attack.guard(); attack.advance();
  assert.match(attack.text, /深淵の闇[\s\S]*HPが1回復[\s\S]*虚無の爪痕/);
  assert.equal(attack.enemyHp, 1200, 'self-healing is capped'); assert.equal(attack.playerHp, 849);
  const guarded = createBattle(god, { player: durable }); guarded.guard(); guarded.advance();
  assert.equal(guarded.feedback.amount, 61); assert.equal(guarded.playerHp, 939, 'guard protects both actions');
  const armored = createBattle(god, { player: { ...durable, stats: { ...durable.stats, defense: 9999 } } }); armored.guard(); armored.advance();
  assert.equal(armored.feedback.amount, 34, 'physical armor cannot nullify the magic wave');
  const fragile = createBattle(god); fragile.attack(); fragile.advance(); assert.equal(fragile.phase, 'defeat'); assert.doesNotMatch(fragile.text, /虚無の波動/, 'second attack cannot execute after death');
  const oneHit = createBattle(god, { player: { ...durable, stats: { ...durable.stats, attack: 9999 } } });
  oneHit.attack(); oneHit.advance(); assert.equal(oneHit.playerHp, 1000); assert.equal(oneHit.phase, 'victory'); assert.match(oneHit.text, /世界の真の覇者/);
  const poisonAction = { type: 'attack', text: '毒の攻撃', power: 1, inflictPoison: true };
  const poison = createBattle({ ...god, stats: { ...god.stats, attack: 10 }, patterns: { beforeAttacked: [poisonAction], afterAttacked: [poisonAction] } },
    { player: { ...durable, stats: { ...durable.stats, defense: 0 } } });
  poison.guard(); poison.advance(); assert.equal(poison.playerHp, 990); assert.doesNotMatch(poison.text, /毒で/);
  poison.advance(); poison.guard(); poison.advance(); assert.equal(poison.playerHp, 978); assert.equal((poison.text.match(/毒で/g) ?? []).length, 1, 'poison damage runs once per turn');
  const escaping = createBattle({ ...god, patterns: { beforeAttacked: [{ type: 'escape', text: '逃げる', chance: 1 }, poisonAction], afterAttacked: [poisonAction] } });
  escaping.guard(); escaping.advance(); assert.equal(escaping.phase, 'escape'); assert.equal(escaping.playerHp, 40); assert.doesNotMatch(escaping.text, /毒の攻撃/);
  for (const actionsPerTurn of [0, 5, -1, 1.5, true, '2']) assert.throws(() => parseEnemyDefinitions([{ ...god, actionsPerTurn }]));
  for (const power of [0, -1, NaN, Infinity, 11]) assert.throws(() => parseEnemyDefinitions([{ ...god, patterns: { ...god.patterns, beforeAttacked: [{ type: 'magic-attack', text: '魔法', power }] } }]));

  const realm = dimensionScene(6, 5, 1, 1);
  assert.equal(realm.encounter.rate, 6); assert.deepEqual(realm.encounter.enemies.map(entry => entry.enemyId), [12, 13, 14]);
  for (const entry of realm.encounter.enemies) {
    const enemy = enemyCatalog.find(enemy => enemy.id === entry.enemyId);
    assert.ok(enemy.stats.hp >= 150 && enemy.stats.hp <= 300); assert.ok(enemy.reward.experience >= 120 && enemy.reward.experience <= 200);
    assert.equal(enemy.background, 'void'); assert.ok(enemyPixelSprites[enemy.battleImage]);
  }
  // Entry and return remain reachable independently of encounters. Their drawn footprint is unchanged.
  const realmForTest = { ...realm, encounter: { ...realm.encounter, rate: 100 } }, target = { id: 5, width: 5, height: 5, spawn: { x: 16, y: 16 }, tiles: new Uint8Array(25).fill(7), entities: [] };
  for (const [weightedRoll, id] of [[0, 12], [0.5, 13], [0.99, 14]]) {
    const draws = [0, weightedRoll], game = createWorldGame([realmForTest, target], 6, () => draws.shift() ?? 0.99);
    assert.equal(game.move('left'), true); assert.equal(game.encounter.enemyId, id);
    game.battle.escape(); game.finishEncounter('escape'); assert.equal(game.safeSteps, 6);
    for (let n = 0; n < 6; n++) { game.move(n % 2 ? 'left' : 'right'); assert.equal(game.encounter, null); }
  }
  const orb = findItem(30).equipment;
  assert.deepEqual([orb.hp, orb.mp, orb.attack, orb.defense, orb.magic], [100, 50, 30, 30, 30]);
  const disk = new Map(), storage = { getItem: key => disk.get(key) ?? null };
  assert.equal(hasTrueClear(storage), false);
  for (const payload of ['bad', '{}', JSON.stringify({ version: 2, worlds: {} }), JSON.stringify({ version: 1, worlds: { a: { cleared: true, defeatCounts: [[11, 0]] } } }), JSON.stringify({ version: 1, worlds: { a: { cleared: false, defeatCounts: [[11, 1]] } } })]) {
    disk.set('tagquest.play-save.v1', payload); assert.equal(hasTrueClear(storage), false);
  }
  const listeners = new Map(), element = { hidden: false };
  globalThis.window = { localStorage: storage, addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener: type => listeners.delete(type) };
  const stop = mountClearRecord(element); assert.equal(element.hidden, true);
  disk.set('tagquest.play-save.v1', JSON.stringify({ version: 1, worlds: { a: { cleared: true, defeatCounts: [[11, 1]] } } }));
  listeners.get('hashchange')(); assert.equal(element.hidden, false); assert.equal(hasTrueClear(storage), true);
  disk.clear(); listeners.get('storage')(); assert.equal(element.hidden, true); stop(); assert.equal(listeners.size, 0);
  console.log('Postgame: two-action order/guard/death, independent enemy magic, single poison tick, escape stop, boss healing/reward, high-level encounter weights/safe steps, orb stats and persistent title clear record passed.');
} finally { rmSync(out, { recursive: true, force: true }); }
