// World connections: binary contract, real castle/town paths and persistent session state.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../node_modules/vite/dist/node/index.js';
const root = fileURLToPath(new URL('../..', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'tagquest-world-'));
try {
  await build({ configFile: false, logLevel: 'silent', build: {
    lib: { entry: { model: join(root, 'web/src/editor/model.ts'), decoder: join(root, 'web/src/codec/scenes.ts'),
      world: join(root, 'web/src/game/world.ts'), walking: join(root, 'web/src/game/walking.ts') },
      formats: ['es'], fileName: (_, name) => `${name}.mjs` }, outDir: temporary, emptyOutDir: false,
  } });
  const { initialWorld, parseWorld, encodeWorld, toSceneData } = await import(pathToFileURL(join(temporary, 'model.mjs')).href);
  const { decodeScenes } = await import(pathToFileURL(join(temporary, 'decoder.mjs')).href);
  const { createWorldGame } = await import(pathToFileURL(join(temporary, 'world.mjs')).href);
  const { canStand } = await import(pathToFileURL(join(temporary, 'walking.mjs')).href);
  const world = initialWorld(), encoded = encodeWorld(world), scenes = decodeScenes(encoded.bytes);
  assert.equal(encoded.bytes.length, 206); assert.deepEqual(encoded.reports.map(r => r.exitBytes), [4, 4]);
  const snapshot = structuredClone(scenes);
  const objectScenes = structuredClone(scenes);
  const objectCastle = objectScenes[0];
  objectCastle.entities = objectCastle.entities.filter(e => e.kind !== 'king');
  Object.assign(objectCastle.entities.find(e => e.kind === 'throne'), { dialogue: { type: 'custom', text: '座面を調べた。' }, itemId: 1 });
  objectCastle.spawn = { x: 48, y: 32 }; delete objectCastle.encounter;
  const objectSnapshot = structuredClone(objectScenes), objectGame = createWorldGame(objectScenes, 0);
  objectGame.move('back'); objectGame.interact(); assert.equal(objectGame.message.text, '座面を調べた。');
  objectGame.interact(); assert.equal(objectGame.message.text, 'どくけしそうを手に入れた！'); objectGame.interact();
  objectGame.move('front'); objectGame.move('front'); assert.equal(objectGame.scene.id, 1);
  objectGame.move('back'); assert.equal(objectGame.scene.id, 0);
  objectGame.move('back'); objectGame.move('back'); objectGame.move('back'); objectGame.interact();
  assert.equal(objectGame.message.text, 'もうここには何もないようだ。'); objectGame.interact(); assert.equal(objectGame.message, null);
  assert.deepEqual(objectGame.inventory, [{ itemId: 1, count: 1 }]);
  assert.ok(objectGame.visibleEntities.some(e => e.kind === 'throne'));
  objectGame.reset(); assert.deepEqual(objectGame.inventory, []);
  objectGame.move('back'); objectGame.interact(); assert.equal(objectGame.inventory[0].count, 1);
  assert.deepEqual(objectScenes, objectSnapshot);
  const game = createWorldGame(scenes, 0, () => 0.999999);
  assert.equal(game.move('front'), true); // walk out of the lower boundary of the castle
  assert.equal(game.scene.id, 1); assert.deepEqual(game.position, { x: 96, y: 96 }); assert.equal(game.direction, 'front');
  game.move('back'); assert.equal(game.scene.id, 0); assert.deepEqual(game.position, { x: 48, y: 64 });
  assert.equal(game.direction, 'back');
  game.interact(); game.interact(); assert.equal(game.scene.id, 0); // no automatic bounce on arrival
  game.move('back'); game.move('front'); assert.equal(game.scene.id, 1);
  // Find a real traversable route around buildings and residents to a sparkle and back.
  function walkTo(x, y) {
    const scene = game.scene, queue = [{ ...game.position, path: [] }], seen = new Set();
    const steps = [['front', 0, 16], ['back', 0, -16], ['left', -16, 0], ['right', 16, 0]];
    let route;
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i], key = `${p.x},${p.y}`;
      if (seen.has(key)) continue; seen.add(key);
      if (p.x === x && p.y === y) { route = p.path; break; }
      if (scene.exits?.some(e => e.x * 16 === p.x && e.y * 16 - 16 === p.y) && p.path.length) continue;
      for (const [direction, dx, dy] of steps) {
        const next = { x: p.x + dx, y: p.y + dy };
        if (canStand(scene, next)) queue.push({ ...next, path: [...p.path, direction] });
      }
    }
    assert.ok(route, `reachable ${x},${y}`);
    for (const direction of route) { assert.equal(game.move(direction), true); while (game.message) game.interact(); }
  }
  walkTo(64, 240); assert.deepEqual(game.inventory, [{ itemId: 0, count: 1 }]);
  assert.equal(game.visibleEntities.filter(e => e.kind === 'loot').length, 1);
  walkTo(96, 80); assert.equal(game.scene.id, 0);
  assert.deepEqual(game.inventory, [{ itemId: 0, count: 1 }]);
  game.move('front'); assert.equal(game.scene.id, 1);
  assert.equal(game.visibleEntities.filter(e => e.kind === 'loot').length, 1);
  walkTo(64, 240); assert.deepEqual(game.inventory, [{ itemId: 0, count: 1 }]);
  game.reset(); assert.equal(game.scene.id, 0); assert.deepEqual(game.inventory, []);
  game.move('front'); assert.equal(game.visibleEntities.filter(e => e.kind === 'loot').length, 2);
  assert.deepEqual(scenes, snapshot); // no edits or compiled-map writes

  const blank = id => ({ id, name: `マップ${id}`, width: 4, height: 4, spawn: { x: 0, y: 16 },
    spawnAnchor: 'frame', npcAnchor: 'frame', floor: { default: 'grass', rectangles: [] }, entities: [], exits: [] });
  const a = blank(9), b = blank(42); b.spawn = null;
  a.exits = [{ x: 1, y: 2, targetStageId: 42, targetX: 1, targetY: 2, direction: 'left' }];
  b.exits = [{ x: 1, y: 2, targetStageId: 9, targetX: 0, targetY: 0, direction: 'right' }];
  b.entities = [{ kind: 'loot', x: 16, y: 32, parameters: [0], itemId: 2 }];
  const custom = parseWorld([a, b]), customEncoded = encodeWorld(custom), customBinary = customEncoded.bytes;
  const json = join(temporary, 'world.json'), output = join(temporary, 'world.bin');
  writeFileSync(json, JSON.stringify(custom));
  execFileSync('python3', ['compiler/build.py', '--maps', json, '--out', output], { cwd: root });
  assert.deepEqual(Buffer.from(customBinary), readFileSync(output));
  const customScenes = decodeScenes(customBinary), connected = createWorldGame(customScenes, 9);
  connected.move('right'); assert.equal(connected.scene.id, 42); assert.equal(connected.direction, 'left');
  assert.equal(connected.message.text, 'まほうの水を手に入れた！'); connected.interact();
  assert.equal(connected.scene.id, 42); // target exit at the arrival tile is suppressed
  connected.move('back'); connected.move('front'); assert.equal(connected.scene.id, 9);
  assert.deepEqual(connected.position, { x: 0, y: -16 }); // arrival uses feet, including top row
  assert.equal(connected.direction, 'right'); assert.deepEqual(connected.inventory, [{ itemId: 2, count: 1 }]);
  // Pickup on a departure exit completes before changing maps.
  const pickupExit = structuredClone(customScenes);
  pickupExit[0].entities = [{ kind: 'loot', x: 16, y: 32, parameters: [0], itemId: 0 }];
  const delayed = createWorldGame(pickupExit, 9); delayed.move('right'); assert.equal(delayed.scene.id, 9);
  delayed.interact(); assert.equal(delayed.scene.id, 42);
  assert.deepEqual(delayed.inventory, [{ itemId: 0, count: 1 }, { itemId: 2, count: 1 }]);
  // Same-stage exits also work and do not recursively trigger on arrival.
  const same = blank(9); same.exits = [{ x: 1, y: 2, targetStageId: 9, targetX: 3, targetY: 3, direction: 'back' }];
  const self = createWorldGame([toSceneData(parseWorld(same).stages[0])], 9); self.move('right');
  assert.deepEqual(self.position, { x: 48, y: 32 }); assert.equal(self.direction, 'back');

  for (const change of [e => e.x = 4, e => e.y = -1, e => e.targetStageId = 255,
    e => e.targetX = 4, e => e.targetY = 4, e => e.direction = 'missing', e => e.x = true]) {
    const bad = structuredClone([a, b]); change(bad[0].exits[0]);
    assert.throws(() => parseWorld(bad)); writeFileSync(json, JSON.stringify(bad));
    assert.throws(() => execFileSync('python3', ['compiler/build.py', '--maps', json, '--out', output], { cwd: root, stdio: 'pipe' }));
  }
  const duplicate = structuredClone([a, b]); duplicate[0].exits.push({ ...duplicate[0].exits[0] });
  assert.throws(() => parseWorld(duplicate));
  for (const stage of [0, 1]) {
    const blocked = structuredClone(customScenes);
    blocked[stage].tiles[2 * 4 + 1] = 2;
    assert.throws(() => createWorldGame(blocked, 9), /歩けない/);
  }
  assert.throws(() => createWorldGame(customScenes, 42), /開始位置/);
  for (let i = 0; i < customBinary.length; i++) assert.throws(() => decodeScenes(customBinary.subarray(0, i)));
  // All bytes of the first exit record have independent range checks.
  const offset = 4 + customEncoded.reports[0].bytes - customEncoded.reports[0].encounterBytes - 6;
  for (const [field, value] of [[0, 7], [1, 6], [2, 255], [3, 13], [4, 31], [5, 4]]) {
    const bad = customBinary.slice(); bad[offset + field] = value; assert.throws(() => decodeScenes(bad));
  }
  console.log('World: castle/town round trips, real routes, no bounce, inventory/loot persistence, reset, arrival direction, same-stage exits, binary parity and invalid connections passed.');
} finally { rmSync(temporary, { recursive: true, force: true }); }
