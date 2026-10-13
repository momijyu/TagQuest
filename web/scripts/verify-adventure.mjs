// Check every authored dialogue/reward in the rich sample, using the exported payload.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../node_modules/vite/dist/node/index.js';
const root = fileURLToPath(new URL('../..', import.meta.url)), out = mkdtempSync(join(tmpdir(), 'tq-adventure-'));
try {
  await build({ configFile: false, logLevel: 'silent', build: { lib: { entry: Object.fromEntries([
    ['adventure', 'editor/adventure'], ['model', 'editor/model'], ['validation', 'editor/validation'],
    ['url', 'codec/nfc-url'], ['walking', 'game/walking'], ['exits', 'data/stage-exits'], ['dialogues', 'data/interactions'], ['world', 'game/world'],
  ].map(([name, file]) => [name, join(root, `web/src/${file}.ts`)])), formats: ['es'], fileName: (_, name) => `${name}.mjs` }, outDir: out } });
  const read = name => import(pathToFileURL(join(out, `${name}.mjs`)).href);
  const { createAdventureWorld } = await read('adventure');
  const { initialWorld, encodeWorld } = await read('model');
  const { validateWorld } = await read('validation');
  const { gameUrl, readGameHash, defaultPublicBase } = await read('url');
  const { canStand, createWalkingGame, interactionTarget } = await read('walking');
  const { exitArrival } = await read('exits');
  const { dialogueText } = await read('dialogues');
  const { createWorldGame } = await read('world');
  const initial = initialWorld(), before = structuredClone(initial), world = createAdventureWorld();
  assert.deepEqual(initialWorld(), before, 'sample additions do not change the default castle/town');
  assert.equal(world.stages.length, 6);
  assert.equal(world.stages.flatMap(s => s.entities).filter(e => e.kind === 'treasure-chest').length, 12);
  const issues = validateWorld(world).filter(issue => !issue.text.includes('開始位置なし'));
  assert.deepEqual(issues, [], 'all stage connections and NPC/chest approaches remain reachable');
  const scenes = readGameHash(new URL(gameUrl(encodeWorld(world, true).bytes, defaultPublicBase())).hash);
  const catalog = JSON.parse(readFileSync(join(root, 'web/src/data/scene-catalog.json')));
  const tileAt = (scene, x, y) => catalog.tiles[scene.tiles[y * scene.width + x]];
  const castle = scenes.find(scene => scene.id === 0), town = scenes.find(scene => scene.id === 1);
  assert.deepEqual([castle.width, castle.height], [13, 12], 'castle has space around the throne and a side treasure alcove');
  assert.deepEqual([town.width, town.height], [29, 21], 'the plaza town has an eastern residential lane');
  for (const scene of scenes.filter(scene => scene.id !== 2)) {
    const exit = scene.exits.find(exit => exit.y === scene.height - 1);
    assert.ok(exit, `stage ${scene.id} has a visible boundary exit`);
    for (let x = 0; x < scene.width; x++) {
      if (x === exit.x) assert.notEqual(tileAt(scene, x, exit.y), 'empty');
      else assert.equal(tileAt(scene, x, exit.y), 'empty', 'only the exit projects one tile beyond the map body');
    }
    assert.notEqual(tileAt(scene, exit.x, exit.y - 1), 'empty', 'the projection connects to the interior');
  }
  for (let y = 8; y <= 19; y++) assert.equal(canStand(town, { x: 12 * 16, y: y * 16 - 16 }), true, 'the central town street stays open');
  for (const npc of town.entities.filter(entity => ['resident', 'traveler', 'elder'].includes(entity.kind))) {
    assert.equal(tileAt(town, npc.x / 16, npc.y / 16 + 1), 'grass', 'residents stand beside the paths, not on the paving');
  }
  for (const scene of scenes) for (const chest of scene.entities.filter(entity => entity.kind === 'treasure-chest')) {
    assert.ok(!['carpet', 'demon-carpet', 'dirt'].includes(tileAt(scene, chest.x / 16, chest.y / 16)), 'chests leave the main aisle/forest path open');
  }
  const steps = [['back', 0, -16], ['front', 0, 16], ['left', -16, 0], ['right', 16, 0]];
  let rewards = 0, conversations = 0;
  for (const scene of scenes) {
    const entry = scenes.flatMap(s => s.exits ?? []).find(exit => exit.targetStageId === scene.id);
    const start = scene.spawn ?? exitArrival(entry);
    const game = createWalkingGame({ ...scene, spawn: start }), sceneBefore = structuredClone(scene);
    function findTarget(index) {
      const queue = [{ ...game.position, path: [] }], seen = new Set();
      for (let i = 0; i < queue.length; i++) {
        const p = queue[i], key = `${p.x},${p.y}`;
        if (seen.has(key)) continue; seen.add(key);
        for (const [direction] of steps) if (interactionTarget(scene, p, direction) === index) return { ...p, direction };
        for (const [direction, dx, dy] of steps) {
          const next = { x: p.x + dx, y: p.y + dy };
          if (Array.from({ length: 16 }, (_, n) => ({ x: p.x + dx / 16 * (n + 1), y: p.y + dy / 16 * (n + 1) })).every(step => canStand(scene, step))) queue.push({ ...next, path: [...p.path, direction] });
        }
      }
      assert.fail(`stage ${scene.id}: cannot approach entity ${index} (${scene.entities[index].kind})`);
    }
    const drain = () => { let count = 0; while (game.message) { assert.ok(count++ < 10); game.interact(); } };
    for (const [index, entity] of scene.entities.entries()) {
      if (entity.kind === 'loot' || (!entity.dialogue && entity.itemId === undefined)) continue;
      const target = findTarget(index);
      for (const direction of target.path) { assert.equal(game.move(direction), true); drain(); }
      game.move(target.direction); // A blocked step sets facing toward the object/NPC.
      assert.deepEqual(game.position, { x: target.x, y: target.y });
      const quantity = () => game.inventory.find(item => item.itemId === entity.itemId)?.count ?? 0;
      const beforeQuantity = quantity();
      game.interact();
      assert.ok(game.message, `${entity.kind} opens a message`);
      if (entity.dialogue) { assert.equal(game.message.text, dialogueText(entity.dialogue)); conversations++; }
      if (entity.itemId !== undefined) { assert.equal(quantity(), beforeQuantity + 1); rewards++; }
      drain();
      if (entity.itemId !== undefined) {
        game.interact();
        assert.equal(game.message.text, entity.kind === 'treasure-chest' ? '宝箱は空っぽだった。' : 'もうここには何もないようだ。');
        drain(); assert.equal(quantity(), beforeQuantity + 1, 'repeating inspection cannot duplicate a reward');
        if (entity.kind === 'treasure-chest') assert.ok(game.openedChests.has(game.scene.entities[index]));
      }
    }
    assert.deepEqual(scene, sceneBefore);
  }
  assert.equal(rewards, 15, '12 chests + well + original house + residential gift');
  assert.ok(conversations >= 10);
  assert.equal(castle.encounter.rate, 0.01, 'hidden king is a one-in-ten-thousand encounter after URL replay');
  assert.equal(scenes.find(s => s.id === 2).encounter, undefined, 'overworld remains peaceful');
  assert.deepEqual(scenes.find(s => s.id === 3).encounter.enemies.map(e => e.enemyId), [1, 2, 3]);
  assert.deepEqual(scenes.find(s => s.id === 4).encounter.enemies.map(e => e.enemyId), [5, 6, 7, 10]);
  for (const [stageId, ids] of [[3, [1, 2, 3]], [4, [5, 6, 7]]]) {
    const scene = scenes.find(s => s.id === stageId);
    const spawn = exitArrival(scenes.flatMap(s => s.exits ?? []).find(e => e.targetStageId === stageId));
    for (const [roll, enemyId] of [[0, ids[0]], [0.5, ids[1]], [0.8, ids[2]]]) {
      const randomValues = [0, roll];
      const game = createWorldGame(scenes.map(s => s.id === stageId ? { ...s, spawn } : s), stageId, () => randomValues.shift() ?? 0.999999);
      assert.equal(game.move('back'), true, 'a real step from the sample entry triggers the encounter table');
      assert.equal(game.encounter?.enemyId, enemyId, 'all three authored enemies can be encountered after Vercel URL replay');
    }
  }
  for (const scene of scenes) for (const entity of scene.entities) if (entity.dialogue) {
    assert.doesNotMatch(dialogueText(entity.dialogue), /王の装備|百倍|100倍|装備を外/);
  }
  assert.deepEqual(createAdventureWorld(), world, 'another sample starts fresh');
  console.log(`Adventure: spacious castle, plaza town, Vercel URL replay, 0.01% hidden king, three forest/three cave encounters, no boss hints, all six connections, ${conversations} dialogues, ${rewards} one-time rewards and source isolation passed.`);
} finally { rmSync(out, { recursive: true, force: true }); }
