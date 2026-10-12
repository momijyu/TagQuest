// NFC configuration round trips and the shared interaction runtime, without a browser.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../node_modules/vite/dist/node/index.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'tagquest-interactions-'));
try {
  await build({ configFile: false, logLevel: 'silent', build: {
    lib: { entry: { model: join(root, 'web/src/editor/model.ts'), decoder: join(root, 'web/src/codec/scenes.ts'),
      walking: join(root, 'web/src/game/walking.ts'), world: join(root, 'web/src/game/world.ts'),
      renderer: join(root, 'web/src/renderer/compiled-scene.ts') }, formats: ['es'], fileName: (_, name) => `${name}.mjs` },
    outDir: temporary, emptyOutDir: false,
  } });
  const { parseWorld, encodeWorld, toSceneData } = await import(pathToFileURL(join(temporary, 'model.mjs')).href);
  const { decodeScenes } = await import(pathToFileURL(join(temporary, 'decoder.mjs')).href);
  const { createWalkingGame } = await import(pathToFileURL(join(temporary, 'walking.mjs')).href);
  const { createWorldGame } = await import(pathToFileURL(join(temporary, 'world.mjs')).href);
  const { drawCompiledScene } = await import(pathToFileURL(join(temporary, 'renderer.mjs')).href);
  const base = { id: 0, name: '会話と取得', width: 6, height: 8, spawn: { x: 16, y: 48 },
    spawnAnchor: 'frame', npcAnchor: 'frame', floor: { default: 'grass', rectangles: [] }, entities: [
      { kind: 'resident', x: 16, y: 32, parameters: [], dialogue: { type: 'template', id: 0 } },
      { kind: 'loot', x: 48, y: 64, parameters: [0], itemId: 0 },
      { kind: 'loot', x: 64, y: 64, parameters: [4], itemId: 0 },
    ] };
  function normalized(world) { return world.stages.map(s => {
    const { id, width, height, spawn, tiles, entities } = toSceneData(s);
    return { id, width, height, spawn, tiles, entities };
  }); }
  const custom = structuredClone(base); custom.entities[0].dialogue = { type: 'custom', text: 'ようこそ！\n勇者😀 <城> & 冒険' };
  const maximum = structuredClone(base); maximum.entities[0].dialogue = { type: 'custom', text: 'a'.repeat(1024) };
  const newMaterials = { ...structuredClone(base), entities: [
    { kind: 'treasure-chest', x: 16, y: 48, parameters: [], itemId: 0, dialogue: { type: 'custom', text: '宝箱を開いた。' } },
    { kind: 'cave-witch', x: 48, y: 16, parameters: [], dialogue: { type: 'template', id: 7 } },
    { kind: 'forest-fairy', x: 64, y: 16, parameters: [], dialogue: { type: 'template', id: 8 } },
    { kind: 'demon-lord', x: 80, y: 16, parameters: [], dialogue: { type: 'template', id: 9 } },
  ] };
  const objects = { ...structuredClone(base), width: 32, height: 32, entities: [] };
  for (const kind of JSON.parse(readFileSync(join(root, 'web/src/data/inspectable-objects.json')))) {
    for (const dialogue of [undefined, { type: 'template', id: 0 }, { type: 'custom', text: '座面の下を調べた。\n<宝物>😀' }]) {
      objects.entities.push({ kind, x: 32, y: 16, parameters: [], ...(dialogue ? { dialogue } : {}), itemId: 1 });
    }
  }
  for (const [i, source] of [base, custom, maximum, objects, newMaterials].entries()) {
    const world = parseWorld(source), data = encodeWorld(world).bytes;
    const json = join(temporary, `${i}.json`), binary = join(temporary, `${i}.bin`);
    writeFileSync(json, JSON.stringify(world));
    execFileSync('python3', ['compiler/build.py', '--maps', json, '--out', binary], { cwd: root });
    assert.deepEqual(Buffer.from(data), readFileSync(binary));
    const report = JSON.parse(readFileSync(binary.replace(/\.bin$/, '.report.json'), 'utf8'));
    for (const codec of ['RAW', 'RLE', 'RECT']) {
      const actual = execFileSync('python3', ['-c',
        'import json, sys; from compiler.build import compile_game; print(len(compile_game(json.load(open(sys.argv[1]))["stages"], sys.argv[2])[0]))',
        json, codec], { cwd: root, encoding: 'utf8' });
      assert.equal(report.binary_bytes_by_floor_codec[codec], Number(actual));
    }
    assert.deepEqual(decodeScenes(data), normalized(world));
    assert.equal(data[2], source === objects ? 14 : 8);
    const legacy = data.slice(); legacy[2] = 7;
    if (source === objects || source === newMaterials) assert.throws(() => decodeScenes(legacy));
    else assert.deepEqual(decodeScenes(legacy), normalized(world));
  }
  const malformed = [
    { type: 'template', id: 255 }, { type: 'custom', text: '' }, { type: 'custom', text: ' \n\t' },
    { type: 'custom', text: 'a'.repeat(1025) }, { type: 'custom', text: '\ud800' },
    { type: 'custom', text: 'a\u0000b' }, { type: 'custom', text: '\ufeff' }, { type: 'other', text: 'a' },
  ];
  for (const dialogue of malformed) {
    const source = structuredClone(base); source.entities[0].dialogue = dialogue;
    assert.throws(() => parseWorld(source));
    const json = join(temporary, 'invalid.json'); writeFileSync(json, JSON.stringify(source));
    assert.throws(() => execFileSync('python3', ['compiler/build.py', '--maps', json, '--out', join(temporary, 'invalid.bin')], { cwd: root, stdio: 'pipe' }));
  }
  for (const change of [e => e.itemId = 255, e => e.itemId = true, e => e.dialogue = { type: 'template', id: 0 }]) {
    const source = structuredClone(base); change(source.entities[1]); assert.throws(() => parseWorld(source));
  }
  const wrongTarget = structuredClone(base); wrongTarget.entities[0].itemId = 0;
  assert.throws(() => parseWorld(wrongTarget));
  for (const kind of ['moat-inner-bank', 'moat-outer-bank']) for (const data of [{ itemId: 0 }, { dialogue: { type: 'template', id: 0 } }]) {
    const source = { ...structuredClone(base), entities: [{ kind, x: 0, y: 0, parameters: [8, 8], ...data }] };
    assert.throws(() => parseWorld(source));
    const json = join(temporary, 'bad-object.json'); writeFileSync(json, JSON.stringify(source));
    assert.throws(() => execFileSync('python3', ['compiler/build.py', '--maps', json, '--out', join(temporary, 'bad.bin')], { cwd: root, stdio: 'pipe' }));
  }

  // A configured throne shows text and grants an item once, retaining the object and its collision.
  const throneSource = { ...structuredClone(base), spawn: { x: 48, y: 32 }, entities: [
    { kind: 'throne', x: 44, y: 16, parameters: [], dialogue: { type: 'custom', text: '<宝物>を見つけた！' }, itemId: 0 },
  ] };
  const throneWorld = parseWorld(throneSource), throneBytes = encodeWorld(throneWorld).bytes;
  const throne = createWalkingGame(decodeScenes(throneBytes)[0]), throneSnapshot = structuredClone(throne.scene);
  assert.deepEqual(throne.inventory, []); assert.equal(throne.message, null); // touching/staying near a throne never auto-collects
  assert.equal(throne.move('back'), false); throne.interact();
  assert.equal(throne.message.text, '<宝物>を見つけた！'); assert.equal(throne.message.speaker, '');
  assert.deepEqual(throne.inventory, [{ itemId: 0, count: 1 }]);
  assert.equal(throne.move('right'), false);
  throne.interact(); assert.equal(throne.message.text, 'やくそうを手に入れた！');
  throne.interact(); assert.equal(throne.message, null);
  assert.equal(throne.visibleEntities[0].kind, 'throne'); assert.equal(throne.move('back'), false);
  throne.interact(); assert.equal(throne.message.text, '<宝物>を見つけた！');
  throne.interact(); assert.equal(throne.message, null); assert.equal(throne.inventory[0].count, 1);
  assert.deepEqual(throne.scene, throneSnapshot);
  throne.reset(); assert.deepEqual(throne.inventory, []); throne.move('back'); throne.interact();
  assert.equal(throne.inventory[0].count, 1);
  const blockedThrone = structuredClone(throneSnapshot);
  blockedThrone.entities.push({ kind: 'king', x: 48, y: 32, parameters: [0] });
  blockedThrone.spawn = { x: 48, y: 64 };
  const notThroughKing = createWalkingGame(blockedThrone); notThroughKing.move('back'); notThroughKing.interact();
  assert.equal(notThroughKing.message, null); assert.deepEqual(notThroughKing.inventory, []);
  for (const kind of ['well', 'house-red']) {
    const propSource = { ...structuredClone(base), height: 12, spawn: { x: kind === 'well' ? 32 : 48, y: kind === 'well' ? 64 : 80 }, entities: [
      { kind, x: 32, y: 32, parameters: [], itemId: 1 },
    ] };
    const prop = createWalkingGame(normalized(parseWorld(propSource))[0]); prop.move('back'); prop.interact();
    assert.equal(prop.message.text, 'どくけしそうを手に入れた！'); prop.interact(); prop.interact();
    assert.equal(prop.message.text, '何も見つからなかった。'); assert.equal(prop.inventory[0].count, 1);
    assert.equal(prop.visibleEntities.length, 1);
  }
  const chestScene = decodeScenes(encodeWorld(parseWorld(newMaterials)).bytes)[0];
  const chestSnapshot = structuredClone(chestScene);
  const chest = createWalkingGame(chestScene);
  assert.equal(chest.openedChests.size, 0); assert.deepEqual(chest.inventory, []);
  assert.equal(chest.move('back'), false); chest.interact();
  assert.equal(chest.message.text, '宝箱を開いた。');
  assert.equal(chest.openedChests.size, 1);
  assert.equal(chest.openedChests.has(chest.visibleEntities[0]), true);
  assert.deepEqual(chest.inventory, [{ itemId: 0, count: 1 }]);
  chest.interact(); assert.equal(chest.message.text, 'やくそうを手に入れた！');
  chest.interact(); chest.interact(); assert.equal(chest.message.text, '宝箱は空っぽだった。');
  assert.deepEqual(chest.inventory, [{ itemId: 0, count: 1 }]);
  chest.interact(); assert.equal(chest.move('back'), false, 'opened chests retain their collision');
  const chestDraw = openedChests => {
    const pixels = new Map();
    drawCompiledScene({ fillStyle: '', fillRect(x, y, w, h) {
      for (let row = y; row < y + h; row++) for (let col = x; col < x + w; col++) pixels.set(`${col},${row}`, this.fillStyle);
    } }, { ...chest.scene, entities: chest.visibleEntities }, undefined, { openedChests });
    return pixels;
  };
  assert.notDeepEqual(chestDraw(chest.openedChests), chestDraw(new Set()), 'opened state changes the actual chest pixels');
  assert.deepEqual(chestScene, chestSnapshot); assert.deepEqual(chest.scene, chestSnapshot);
  chest.reset(); assert.equal(chest.openedChests.size, 0); assert.deepEqual(chest.inventory, []);
  const emptyChest = createWalkingGame({ ...chestScene, entities: [{ ...chestScene.entities[0], dialogue: undefined, itemId: undefined }] });
  emptyChest.move('back'); emptyChest.interact();
  assert.equal(emptyChest.message.text, '宝箱は空っぽだった。');
  assert.equal(emptyChest.openedChests.size, 1); assert.deepEqual(emptyChest.inventory, []);
  for (const [position, direction] of [[{ x: 16, y: 16 }, 'front'], [{ x: 0, y: 32 }, 'right'], [{ x: 32, y: 32 }, 'left']]) {
    const sideChest = createWalkingGame(chestScene, { position, direction }); sideChest.interact();
    assert.equal(sideChest.openedChests.size, 1, `chest ${direction}`);
  }
  for (const [kind, text, speaker] of [['cave-witch', /暗いところ/, '洞窟の魔女'], ['forest-fairy', /森へようこそ/, '森の妖精'], ['demon-lord', /よくぞここまで/, '魔王']]) {
    const npc = chestScene.entities.find(entity => entity.kind === kind);
    const talk = createWalkingGame(chestScene, { position: { x: npc.x, y: npc.y + 16 }, direction: 'back' });
    talk.interact(); assert.match(talk.message.text, text); assert.equal(talk.message.speaker, speaker);
  }
  const returnWorld = parseWorld([{ ...newMaterials, exits: [
    { x: 2, y: 4, targetStageId: 1, targetX: 1, targetY: 2, direction: 'front' },
  ] }, { id: 1, name: '帰り道', width: 3, height: 4, spawn: null, floor: { default: 'grass', rectangles: [] }, entities: [], exits: [
    { x: 1, y: 3, targetStageId: 0, targetX: 2, targetY: 4, direction: 'left' },
  ] }]);
  const returned = createWorldGame(decodeScenes(encodeWorld(returnWorld).bytes), 0);
  returned.move('back'); returned.interact(); returned.interact(); returned.interact();
  assert.deepEqual(returned.inventory, [{ itemId: 0, count: 1 }]);
  assert.equal(returned.move('right'), true); assert.equal(returned.scene.id, 1);
  assert.equal(returned.move('front'), true); assert.equal(returned.scene.id, 0);
  assert.equal(returned.openedChests.size, 1);
  returned.move('left'); returned.move('back'); returned.interact();
  assert.equal(returned.message.text, '宝箱は空っぽだった。');
  assert.deepEqual(returned.inventory, [{ itemId: 0, count: 1 }]);
  returned.reset(); assert.equal(returned.openedChests.size, 0); assert.deepEqual(returned.inventory, []);
  // Combined records may not be read as legacy v7, and a missing item ID is rejected.
  let throneExtra = 13 + (throneBytes[10] | throneBytes[11] << 8) + 3;
  const throneRecord = throneExtra + 3;
  const oldCombined = throneBytes.slice(); oldCombined[2] = 7; assert.throws(() => decodeScenes(oldCombined));
  const missingItem = throneBytes.slice(); missingItem[throneExtra]--; // shorter payload leaves item byte outside it
  assert.throws(() => decodeScenes(missingItem));
  const badCombinedItem = throneBytes.slice();
  badCombinedItem[throneRecord + 4 + new TextEncoder().encode(throneSource.entities[0].dialogue.text).length] = 255;
  assert.throws(() => decodeScenes(badCombinedItem));

  const world = parseWorld(custom), binary = encodeWorld(world).bytes;
  const game = createWalkingGame(decodeScenes(binary)[0]);
  const snapshot = structuredClone(game.scene);
  assert.equal(game.move('back'), false); // face the NPC
  game.interact(); assert.equal(game.message.text, custom.entities[0].dialogue.text);
  assert.equal(game.message.speaker, '女性');
  assert.equal(game.move('right'), false); assert.deepEqual(game.position, base.spawn);
  game.interact(); assert.equal(game.message, null);
  assert.equal(game.move('right'), true); assert.equal(game.move('right'), true);
  assert.equal(game.message.text, 'やくそうを手に入れた！');
  assert.deepEqual(game.inventory, [{ itemId: 0, count: 1 }]);
  assert.equal(game.visibleEntities.filter(e => e.kind === 'loot').length, 1);
  game.interact(); game.move('left'); game.move('right');
  assert.equal(game.message, null); assert.deepEqual(game.inventory, [{ itemId: 0, count: 1 }]);
  game.move('right'); assert.deepEqual(game.inventory, [{ itemId: 0, count: 2 }]);
  assert.equal(game.visibleEntities.filter(e => e.kind === 'loot').length, 0);
  assert.deepEqual(game.scene, snapshot);
  game.reset(); assert.deepEqual(game.inventory, []); assert.equal(game.message, null);
  assert.equal(game.visibleEntities.filter(e => e.kind === 'loot').length, 2);

  // Walls block speech; NPCs behind the player are not targeted.
  const templateScene = normalized(parseWorld(base))[0];
  const templateGame = createWalkingGame(templateScene); templateGame.move('back'); templateGame.interact();
  assert.equal(templateGame.message.text, 'こんにちは。よい旅を！');
  const behind = createWalkingGame(templateScene); behind.interact(); assert.equal(behind.message, null);
  const wallScene = structuredClone(templateScene); wallScene.tiles[3 * 6 + 1] = 2;
  const blocked = createWalkingGame(wallScene); blocked.move('back'); blocked.interact(); assert.equal(blocked.message, null);
  const unconfigured = structuredClone(templateScene); delete unconfigured.entities[1].itemId;
  const noItem = createWalkingGame(unconfigured); noItem.move('right'); noItem.move('right');
  assert.equal(noItem.message, null); assert.deepEqual(noItem.inventory, []);
  const spawnLoot = structuredClone(templateScene); spawnLoot.entities[1].x = 16;
  const atStart = createWalkingGame(spawnLoot); assert.equal(atStart.inventory[0].itemId, 0);

  // All three original shops support speech across their counters, but not movement through them.
  for (const kind of ['weapon', 'armor', 'item']) {
    const source = { ...structuredClone(base), width: 5, height: 7, spawn: { x: 32, y: 64 }, entities: [
      { kind: `${kind}-shop`, x: 0, y: 0, parameters: [] },
      { kind: `${kind}-merchant`, x: 32, y: 30, parameters: [], dialogue: { type: 'template', id: 0 } },
    ] };
    const shop = createWalkingGame(normalized(parseWorld(source))[0]);
    assert.equal(shop.move('back'), false); shop.interact(); assert.equal(shop.message.text, 'こんにちは。よい旅を！');
  }

  // Mutate the extension itself: wrong mode/target/ID, duplicates and invalid UTF-8 are rejected.
  const floorLength = binary[10] | binary[11] << 8;
  let extension = 13 + floorLength;
  for (let i = 0; i < binary[12]; i++) extension += 3 + (binary[extension] >> 6);
  const first = extension + 3; // two length bytes + record count
  for (const [offset, value] of [[extension, 255], [extension + 2, 0], [first, 255], [first + 1, 255],
    [first + 2, 255], [first + 4, 255]]) {
    const bad = binary.slice(); bad[offset] = value; assert.throws(() => decodeScenes(bad));
  }
  for (let end = 0; end < binary.length; end++) assert.throws(() => decodeScenes(binary.subarray(0, end)));
  const templateBinary = encodeWorld(parseWorld(base)).bytes;
  const badId = templateBinary.slice(); badId[first + 2] = 255; assert.throws(() => decodeScenes(badId));
  const duplicate = templateBinary.slice(); duplicate[first + 3] = 0; assert.throws(() => decodeScenes(duplicate));
  const unknownItem = templateBinary.slice(); unknownItem[first + 5] = 255; assert.throws(() => decodeScenes(unknownItem));
  console.log('Interactions: v8 object message+item Web/Python parity, legacy rejection, UTF-8 validation, NPC/counter speech, one-time loot/object rewards, retained collision, reset and occlusion passed.');
  console.log('New materials: witch/fairy/demon lord NFC dialogues, chest opening pixels, one-time reward, empty chest, four-sided inspection, return-state retention and reset passed.');
} finally { rmSync(temporary, { recursive: true, force: true }); }
