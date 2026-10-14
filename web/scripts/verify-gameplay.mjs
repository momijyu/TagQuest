import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../node_modules/vite/dist/node/index.js';
const root = fileURLToPath(new URL('../..', import.meta.url)), out = mkdtempSync(join(tmpdir(), 'tq-gameplay-'));
try {
  await build({ configFile: false, logLevel: 'silent', build: { lib: { entry: Object.fromEntries([
    ['world', 'game/world'], ['player', 'game/player-state'], ['battle', 'game/battle'], ['walking', 'game/walking'],
    ['clearRecord', 'game/clear-record'], ['config', 'data/encounters/combat-config'], ['presets', 'editor/adventure-presets'], ['model', 'editor/model'],
  ].map(([name, file]) => [name, join(root, `web/src/${file}.ts`)])), formats: ['es'], fileName: (_, name) => `${name}.mjs` }, outDir: out } });
  const read = name => import(pathToFileURL(join(out, `${name}.mjs`)).href);
  const { createWorldGame } = await read('world'), { createPlayerState } = await read('player'), { createBattle: createBattleBase } = await read('battle');
  const createBattle = (enemy, options = {}) => createBattleBase(enemy, { random: () => .5, ...options });
  const { playerConfig, enemyCatalog } = await read('config'), { canStand, interactionTarget } = await read('walking');
  const { hasTrueClear } = await read('clearRecord');
  const { createAdventurePreset } = await read('presets'), { toSceneData } = await read('model');
  const drain = game => { for (let n = 0; game.message && !game.encounter; n++) { assert.ok(n < 30); game.interact(); } };
  const steps = [['back', 0, -16], ['front', 0, 16], ['left', -16, 0], ['right', 16, 0]];
  function approach(game, predicate) {
    const scene = { ...game.scene, entities: game.visibleEntities }, queue = [{ ...game.position, path: [] }], seen = new Set();
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i], key = `${p.x},${p.y}`; if (seen.has(key)) continue; seen.add(key);
      for (const [direction] of steps) {
        const index = interactionTarget(scene, p, direction);
        if (index !== undefined && predicate(scene.entities[index])) {
          for (const move of p.path) { assert.equal(game.move(move), true); drain(game); }
          assert.equal(game.move(direction), false); game.interact(); drain(game); return;
        }
      }
      for (const [direction, dx, dy] of steps) {
        if (Array.from({ length: 16 }, (_, n) => ({ x: p.x + dx * (n + 1) / 16, y: p.y + dy * (n + 1) / 16 })).every(point => canStand(scene, point))) queue.push({ x: p.x + dx, y: p.y + dy, path: [...p.path, direction] });
      }
    }
    assert.fail('No approach to target');
  }
  const player = createPlayerState(); player.setVitals({ hp: 1, mp: 0, poisoned: true });
  player.gainExperience(15); assert.equal(player.level, 2); assert.deepEqual(player.vitals, { hp: 45, mp: 12, poisoned: true });
  player.gainExperience(25); assert.equal(player.level, 3); assert.equal(player.nextLevelExperience, 80);
  player.addItem(28, 1); player.addItem(29, 1); assert.equal(player.useItem(28).ok, true); assert.equal(player.useItem(29).ok, true);
  assert.equal(player.baseStats.attack, 15); assert.equal(player.baseStats.hp, 55); assert.equal(player.useItem(28).ok, false);
  assert.equal(player.rename('  カエ  ').ok, true); assert.equal(player.rename(' ').ok, false); assert.equal(player.rename('あ'.repeat(21)).ok, false);
  const restored = createPlayerState(); restored.restore(JSON.parse(JSON.stringify(player.snapshot()))); assert.deepEqual(restored.snapshot(), player.snapshot());
  const poor = createPlayerState({ ...playerConfig, initialGold: 14 }); poor.setVitals({ hp: 1, mp: 0, poisoned: true });
  const poorBefore = poor.snapshot(); assert.equal(poor.rest().ok, false); assert.deepEqual(poor.snapshot(), poorBefore);
  const tired = createPlayerState({ ...playerConfig, initialGold: 15 }); tired.setVitals({ hp: 1, mp: 0, poisoned: true });
  assert.equal(tired.rest().ok, true); assert.equal(tired.gold, 0); assert.deepEqual(tired.vitals, { hp: 40, mp: 10, poisoned: false });
  assert.throws(() => restored.restore({ ...player.snapshot(), equipment: { ...player.equipment, head: 999 } }));
  const enemy = { ...enemyCatalog[1], stats: { hp: 999, attack: 1, defense: 4 }, reward: null };
  const magic = createBattle(enemy, { player: { ...playerConfig, stats: { hp: 100, attack: 20, defense: 0, magic: 20 } } });
  magic.useSkill(1); assert.equal(magic.feedback.amount, 16); // 12 + floor(20*.4) - 4
  const healing = createBattle(enemy, { playerHp: 1 }); healing.useSkill(2); assert.equal(healing.playerHp, 25);
  const rare = enemyCatalog.find(enemy => enemy.id === 10);
  for (const [roll, phase] of [[0.499999, 'escape'], [0.5, 'enemy-action']]) {
    const battle = createBattle(rare, { random: () => roll }); battle.guard(); battle.advance(); assert.equal(battle.phase, phase);
    if (phase === 'escape') { assert.match(battle.text, /逃げてしまった/); battle.cancelEscape(); assert.equal(battle.phase, 'escape'); assert.doesNotMatch(battle.text, /経験値を手に入れた/); }
  }
  const regen = createBattle(enemyCatalog.find(enemy => enemy.id === 11), { player: { ...playerConfig, stats: { hp: 999, attack: 50, defense: 99 } } });
  regen.attack(); regen.advance(); regen.advance();
  const wounded = regen.enemyHp; regen.guard(); regen.advance(); assert.ok(regen.enemyHp > wounded); assert.ok(regen.enemyHp <= 1200);
  const safetyScene = { id: 0, width: 5, height: 5, spawn: { x: 16, y: 32 }, tiles: new Uint8Array(25).fill(7), entities: [], encounter: { enabled: true, enemyId: 1, rate: 100 } };
  let rolls = 0; const safe = createWorldGame([safetyScene], 0, () => { rolls++; return 0; });
  safe.move('left'); safe.battle.escape(); safe.finishEncounter('escape'); assert.equal(safe.safeSteps, 6);
  assert.equal(safe.move('left'), false); safe.interact(); assert.equal(safe.safeSteps, 6);
  for (let n = 0; n < 6; n++) { assert.equal(safe.move(n % 2 ? 'left' : 'right'), true); assert.equal(safe.encounter, null); }
  assert.equal(rolls, 1); safe.move('right'); assert.ok(safe.encounter); assert.equal(rolls, 2);
  const data = new Map(); let writes = 0;
  const storage = { getItem: key => data.get(key) ?? null, setItem(key, value) { data.set(key, value); writes++; }, removeItem: key => data.delete(key) };
  const scene = { ...safetyScene, encounter: undefined, width: 8, height: 8, tiles: new Uint8Array(64).fill(7), entities: [
    { kind: 'treasure-chest', x: 32, y: 64, parameters: [], itemId: 2 },
    { kind: 'traveler', x: 80, y: 16, parameters: [], battleEvent: { enemyId: 1, once: true, clear: false } },
    { kind: 'innkeeper', x: 96, y: 80, parameters: [], dialogue: { type: 'template', id: 85 } },
  ] };
  const easy = { ...enemyCatalog[1], stats: { hp: 1, attack: 1, defense: 0 }, reward: { gold: 50, experience: 40, items: [{ itemId: 25, quantity: 1 }, { itemId: 28, quantity: 1 }] } };
  const options = { storage, enemies: [easy] };
  let game = createWorldGame([scene], 0, () => 0.999999, options);
  approach(game, entity => entity.kind === 'traveler'); game.battle.attack(); assert.match(game.battle.text, /レベルが3に上がった.*HP\+10/); assert.match(game.battle.text, /あと40EXP$/);
  game.finishEncounter('victory'); drain(game); assert.equal(game.safeSteps, 6);
  assert.equal(game.equip(25).ok, true); assert.equal(game.useItem(28).ok, true); game.rename('カエ');
  approach(game, entity => entity.kind === 'treasure-chest'); assert.equal(game.inventory.find(item => item.itemId === 2).count, 1);
  const before = { status: game.status, position: game.position, inventory: game.inventory };
  game = createWorldGame([scene], 0, () => 0.999999, options); assert.deepEqual({ status: game.status, position: game.position, inventory: game.inventory }, before);
  assert.ok(!game.visibleEntities.some(entity => entity.kind === 'traveler')); assert.equal(game.openedChests.size, 1);
  approach(game, entity => entity.kind === 'treasure-chest'); assert.equal(game.inventory.find(item => item.itemId === 2).count, 1, 'reloading cannot duplicate a chest');
  approach(game, entity => entity.kind === 'innkeeper'); assert.equal(game.shop.merchant, 'innkeeper');
  const gold = game.status.gold; assert.equal(game.rest().ok, true); assert.equal(game.status.gold, gold - 15); assert.equal(game.status.hp, game.status.maxHp); game.closeShop();
  const count = writes; game.save(); assert.equal(writes, count, 'unchanged redraws do not rewrite storage');
  const otherScene = { ...scene, id: 7 };
  const other = createWorldGame([otherScene], 7, () => 0.999999, options);
  assert.equal(other.status.name, 'カエ'); assert.equal(other.status.level, 3); assert.equal(other.status.equipment.head, 25); assert.equal(other.openedChests.size, 0);
  other.move('left'); game = createWorldGame([scene], 0, () => 0.999999, options); assert.equal(game.openedChests.size, 1);
  game.reset(); assert.equal(game.status.level, 1); assert.equal(game.status.name, 'ゆうしゃ'); assert.equal(game.status.equipment.head, null); assert.equal(game.openedChests.size, 0);
  data.set('tagquest.play-save.v1', '{broken'); assert.doesNotThrow(() => createWorldGame([scene], 0, undefined, options));
  const blockedStorage = { ...storage, setItem() { throw new Error('Storage disabled'); } };
  const blocked = createWorldGame([scene], 0, undefined, { storage: blockedStorage }); blocked.move('left'); assert.match(blocked.saveStatus, /保存できません/);
  const lethal = { ...easy, stats: { hp: 999, attack: 9999, defense: 99 } };
  const defeatOptions = { storage, enemies: [lethal], player: { ...playerConfig, initialGold: 101 } };
  data.clear(); let dying = createWorldGame([safetyScene], 0, () => 0, defeatOptions);
  dying.move('left'); dying.battle.guard(); dying.battle.advance(); dying.save();
  dying = createWorldGame([safetyScene], 0, () => 0, defeatOptions); assert.equal(dying.status.gold, 50); assert.equal(dying.status.hp, dying.status.maxHp);
  dying = createWorldGame([safetyScene], 0, () => 0, defeatOptions); assert.equal(dying.status.gold, 50, 'reloading defeat cannot evade or repeat the penalty');
  data.clear(); let winning = createWorldGame([scene], 0, () => 0.999999, options);
  approach(winning, entity => entity.kind === 'traveler'); winning.battle.attack(); winning.save();
  assert.equal(winning.battle.phase, 'victory'); assert.equal(winning.status.level, 3);
  winning.finishEncounter('victory'); assert.equal(winning.status.experience, 40, 'acknowledging an autosaved result cannot award it twice');
  winning = createWorldGame([scene], 0, () => 0.999999, options); assert.equal(winning.status.experience, 40); assert.ok(!winning.visibleEntities.some(entity => entity.kind === 'traveler'));
  for (const size of ['normal', 'large', 'small']) {
    const sources = createAdventurePreset(size).stages.map(toSceneData), original = structuredClone(sources), memory = new Map();
    const disk = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) };
    const opts = { storage: disk, player: { ...playerConfig, stats: { hp: 9999, attack: 9999, defense: 999 } } };
    let world = createWorldGame(sources, 5, () => 0.999999, opts); assert.equal(world.portal, null);
    approach(world, entity => entity.battleEvent?.clear); world.battle.attack(); world.finishEncounter('victory'); drain(world);
    assert.equal(world.cleared, true); assert.equal(hasTrueClear(disk), false); assert.ok(world.portal, `${size}: the portal is created after main-boss victory`);
    const portal = world.portal, target = { x: portal.x * 16, y: portal.y * 16 - 16 }, queue = [{ ...world.position, path: [] }], seen = new Set();
    let route;
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i], key = `${p.x},${p.y}`; if (seen.has(key)) continue; seen.add(key);
      if (p.x === target.x && p.y === target.y) { route = p.path; break; }
      for (const [direction, dx, dy] of steps) if (Array.from({ length: 16 }, (_, n) => ({ x: p.x + dx * (n + 1) / 16, y: p.y + dy * (n + 1) / 16 })).every(point => canStand({ ...world.scene, entities: world.visibleEntities }, point))) queue.push({ x: p.x + dx, y: p.y + dy, path: [...p.path, direction] });
    }
    assert.ok(route, `${size}: a real route leads behind the throne to the portal`);
    for (const direction of route) world.move(direction);
    assert.equal(world.scene.id, portal.dimensionId); assert.match(world.story.objective, /虚無の回廊で力を磨き/); assert.equal(world.trueCleared, false); approach(world, entity => entity.battleEvent?.enemyId === 11);
    world.battle.attack(); assert.match(world.battle.text, /世界の真の覇者/); world.finishEncounter('victory'); assert.match(world.message.text, /世界の真の覇者/); assert.match(world.message.text, /虚無の覇者/); drain(world);
    assert.equal(world.inventory.find(item => item.itemId === 30).count, 1); assert.equal(world.trueCleared, true); assert.equal(hasTrueClear(disk), true);
    world = createWorldGame(sources, 5, () => 0.999999, opts); assert.equal(world.scene.id, portal.dimensionId); assert.equal(world.cleared, true);
    assert.ok(!world.visibleEntities.some(entity => entity.battleEvent?.enemyId === 11)); assert.equal(world.inventory.find(item => item.itemId === 30).count, 1); assert.equal(world.trueCleared, true); assert.equal(hasTrueClear(disk), true);
    world.reset(); assert.equal(hasTrueClear(disk), false); assert.equal(world.trueCleared, false); assert.equal(world.portal, null); assert.equal(world.cleared, false); assert.deepEqual(sources, original);
  }
  console.log('Gameplay: early growth/full recovery, scaling magic/healing, seeds/name/gear, rare escape, regeneration, six safe steps, atomic save/reload/cross-world state, inn, resets/storage errors, three postgame portal routes and once-only superboss rewards passed.');
} finally { rmSync(out, { recursive: true, force: true }); }
