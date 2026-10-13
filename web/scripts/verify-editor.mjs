// Editor data contract and UI smoke tests. No browser, network, or extra packages required.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../node_modules/vite/dist/node/index.js';
import { readPng } from './pixel-png.mjs';

const rootPath = fileURLToPath(new URL('../..', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'tagquest-editor-'));
const originalRandom = Math.random;
Math.random = () => 0.999999; // Existing movement tests avoid the sample castle's 10% encounter.
try {
  await build({ configFile: false, logLevel: 'silent', build: {
    lib: { entry: {
      model: join(rootPath, 'web/src/editor/model.ts'), decoder: join(rootPath, 'web/src/codec/scenes.ts'),
      editor: join(rootPath, 'web/src/editor/editor.ts'),
      renderer: join(rootPath, 'web/src/renderer/compiled-scene.ts'),
      player: join(rootPath, 'web/src/data/player-placement.ts'),
      walking: join(rootPath, 'web/src/game/walking.ts'),
      gallery: join(rootPath, 'web/src/game/gallery-play.ts'),
      battle: join(rootPath, 'web/src/game/battle-view.ts'),
      battleEngine: join(rootPath, 'web/src/game/battle.ts'),
      playerMenus: join(rootPath, 'web/src/game/player-menu.ts'),
      play: join(rootPath, 'web/src/game/play-view.ts'),
      combatConfig: join(rootPath, 'web/src/data/encounters/combat-config.ts'),
      skills: join(rootPath, 'web/src/data/skills.ts'),
      enemyPixels: join(rootPath, 'web/src/data/encounters/enemy-pixels.ts'),
      worldEngine: join(rootPath, 'web/src/game/world.ts'),
      adventure: join(rootPath, 'web/src/editor/adventure.ts'),
      materials: join(rootPath, 'web/src/renderer/adventure-materials.ts'),
      kingDirections: join(rootPath, 'web/src/data/characters/king-directions.ts'),
    }, formats: ['es'], fileName: (_, name) => `${name}.mjs` }, outDir: temporary, emptyOutDir: false,
  } });
  const model = await import(pathToFileURL(join(temporary, 'model.mjs')).href);
  const { decodeScenes } = await import(pathToFileURL(join(temporary, 'decoder.mjs')).href);
  const { entityFrame, entityDrawingFrame, entityCollisionFrame, drawCompiledScene } = await import(pathToFileURL(join(temporary, 'renderer.mjs')).href);
  const { playerFrame, playerCollisionFrame, playerDrawingPosition, fitPlayerPosition } = await import(pathToFileURL(join(temporary, 'player.mjs')).href);
  const { initialWorld, clone, encodeWorld, paint, compactFloor, resize, parseWorld, History, toSceneData, makeEntity } = model;
  const npcKinds = ['king', 'weapon-merchant', 'armor-merchant', 'item-merchant', 'traveler', 'resident', 'elder', 'cave-witch', 'forest-fairy', 'demon-lord'];
  const { adventureMaterials } = await import(pathToFileURL(join(temporary, 'materials.mjs')).href);
  const { makeKingDirection } = await import(pathToFileURL(join(temporary, 'kingDirections.mjs')).href);
  const heroSheet = readPng(join(rootPath, 'web/src/assets/player/hero-sheet-64.png'));
  for (const [direction, sourceX, sourceY] of [['back', 64, 0], ['left', 0, 64], ['right', 64, 64]]) {
    const source = new Uint8ClampedArray(64 * 64 * 4);
    for (let y = 0; y < 64; y++) source.set(heroSheet.rgba.subarray(((y + sourceY) * 128 + sourceX) * 4, ((y + sourceY) * 128 + sourceX + 64) * 4), y * 64 * 4);
    const originalPixels = source.slice(), royalPixels = makeKingDirection(source, direction);
    assert.deepEqual(source, originalPixels, 'the original hero artwork is preserved');
    assert.deepEqual(royalPixels.slice(48 * 64 * 4), source.slice(48 * 64 * 4), 'trousers and boots retain their original pixels');
    let eyes = 0;
    for (let y = 16; y <= 23; y++) for (let x = 0; x < 64; x++) {
      const index = (y * 64 + x) * 4, [r, g, b, a] = source.subarray(index, index + 4);
      if (a && b - g >= 40 && g > 40 && r < 100) {
        assert.deepEqual(royalPixels.subarray(index, index + 4), source.subarray(index, index + 4), 'blue eyes remain readable');
        eyes++;
      }
      if (a && r > g * 1.25 && g > b && r > 120) assert.deepEqual(royalPixels.subarray(index, index + 4), source.subarray(index, index + 4), 'skin color is preserved');
    }
    if (direction !== 'back') assert.ok(eyes > 0, `${direction} eye pixels were checked`);
  }
  for (const { sprite } of Object.values(adventureMaterials)) {
    assert.equal(sprite.pixels.length, sprite.height);
    for (const row of sprite.pixels) {
      assert.equal(row.length, sprite.width);
      for (const code of row) if (code !== '.') assert.ok(parseInt(code, 36) < sprite.palette.length);
    }
  }
  const { canStand, createWalkingGame } = await import(pathToFileURL(join(temporary, 'walking.mjs')).href);
  const { createWorldGame } = await import(pathToFileURL(join(temporary, 'worldEngine.mjs')).href);
  const { enemyCatalog, playerConfig } = await import(pathToFileURL(join(temporary, 'combatConfig.mjs')).href);
  const { createAdventureWorld, appendAdventureSample } = await import(pathToFileURL(join(temporary, 'adventure.mjs')).href);
  const { startGalleryPlay } = await import(pathToFileURL(join(temporary, 'gallery.mjs')).href);
  const original = initialWorld();
  assert.deepEqual(playerFrame(original.stages[0].spawn), { x: 48, y: 64, width: 16, height: 32 });
  assert.deepEqual(playerCollisionFrame(original.stages[0].spawn), { x: 48, y: 80, width: 16, height: 16 });
  assert.deepEqual(playerDrawingPosition(original.stages[0].spawn), { x: 40, y: 64 });
  // A one-cell-wide field accepts the placement frame even though the artwork is wider.
  assert.deepEqual(fitPlayerPosition({ x: 30, y: 40 }, 1, 2), { x: 0, y: 0 });
  assert.deepEqual(playerDrawingPosition({ x: 0, y: 0 }), { x: -8, y: 0 });
  assert.throws(() => fitPlayerPosition({ x: 0, y: 0 }, 1, 1));
  const legacyWorld = clone(original);
  for (const s of legacyWorld.stages) delete s.spawnAnchor;
  legacyWorld.stages[0].spawn.x -= 8;
  assert.deepEqual(parseWorld(legacyWorld), original);
  const legacyResidents = clone(original);
  for (const s of legacyResidents.stages) {
    delete s.npcAnchor;
    delete s.residentAnchor;
    for (const e of s.entities) if (npcKinds.includes(e.kind)) e.x -= 8;
  }
  assert.deepEqual(parseWorld(legacyResidents), original);
  const legacyV3 = clone(original);
  for (const s of legacyV3.stages) {
    delete s.npcAnchor;
    for (const e of s.entities) if (npcKinds.slice(0, 4).includes(e.kind)) e.x -= 8;
  }
  assert.deepEqual(parseWorld(legacyV3), original);
  for (const kind of npcKinds) {
    const e = makeEntity(kind, 48, 32, original.stages[0]);
    assert.deepEqual(entityFrame(e), { x: 48, y: 32, width: 16, height: 32 });
    assert.deepEqual(entityDrawingFrame(e), { x: 40, y: 32, width: 32, height: 32 });
    assert.deepEqual(entityCollisionFrame(e), { x: 48, y: 48, width: 16, height: 16 });
  }
  assert.deepEqual(entityFrame(original.stages[0].entities[1]), { x: 48, y: 32, width: 16, height: 32 });
  assert.deepEqual(entityFrame(original.stages[0].entities[0]), { x: 32, y: 16, width: 48, height: 32 });
  assert.deepEqual(entityFrame(original.stages[0].entities[2]), { x: 16, y: 32, width: 16, height: 32 });
  assert.deepEqual(Buffer.from(encodeWorld(original).bytes), readFileSync(join(rootPath, 'web/src/data/generated/scenes.bin')));

  const painted = clone(original);
  const stage = painted.stages[1];
  paint(stage, 'grass', 0, 0, 13, 31);
  paint(stage, 'brick', 4, 2, 3, 15);
  const beforeCompaction = toSceneData(stage).tiles;
  compactFloor(stage);
  assert.deepEqual(toSceneData(stage).tiles, beforeCompaction);
  assert.ok(stage.floor.rectangles.length <= 2);
  resize(stage, 32, 32);
  assert.equal(toSceneData(stage).tiles[2 * 32 + 4], 9);
  assert.equal(toSceneData(stage).tiles[31 * 32 + 31], 7);
  stage.entities.push({ kind: 'king', x: 510, y: 510, parameters: [0] });
  resize(stage, 8, 8);
  assert.ok(stage.entities.every(e => e.x < 128 && e.y < 128));
  assert.equal(stage.spawn, null);

  const checker = { id: 2, name: 'checker', width: 32, height: 32, spawn: { x: 496, y: 480 }, spawnAnchor: 'frame',
    floor: { default: 'grass', rectangles: [] }, entities: [] };
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if ((x + y) % 2) paint(checker, 'brick', x, y);
  compactFloor(checker);
  assert.equal(checker.floor.rectangles.length, 512);
  const checkerWorld = parseWorld([checker]);
  assert.equal(encodeWorld(checkerWorld).reports[0].codec, 'RAW');
  const editedWorld = parseWorld([...painted.stages, checker]);
  const narrowWorld = parseWorld(npcKinds.map((kind, i) => ({
    id: i, name: kind, width: 1, height: 2, spawn: null, npcAnchor: 'frame',
    floor: { default: 'grass', rectangles: [] }, entities: [{ kind, x: 0, y: 0, parameters: kind === 'king' ? [1] : [] }],
  })));
  const emptyWorld = parseWorld([{ id: 0, name: '空白', width: 4, height: 3, spawn: null,
    floor: { default: 'empty', rectangles: [] }, entities: [] }]);
  // A transparent floor never paints pixels; replacing a floor does not remove separate objects.
  drawCompiledScene({ fillRect() { assert.fail('Empty tiles must not draw pixels'); } }, toSceneData(emptyWorld.stages[0]));
  paint(emptyWorld.stages[0], 'grass', 1, 1, 2, 1);
  paint(emptyWorld.stages[0], 'empty', 1, 1);
  const emptyTiles = toSceneData(emptyWorld.stages[0]).tiles;
  compactFloor(emptyWorld.stages[0]);
  assert.deepEqual(toSceneData(emptyWorld.stages[0]).tiles, emptyTiles);
  assert.equal(emptyTiles[5], 12);
  assert.equal(emptyTiles[6], 7);
  const forestWorld = parseWorld([{ id: 2, name: '森', width: 7, height: 7,
    spawn: { x: 48, y: 48 }, spawnAnchor: 'frame', floor: { default: 'forest-ground', rectangles: [
      { tile: 'grass', x: 0, y: 0, width: 2, height: 7 }, { tile: 'dirt', x: 3, y: 0, width: 1, height: 7 },
    ] }, entities: [{ kind: 'tree', x: 32, y: 16, parameters: [], dialogue: { type: 'custom', text: '大きな木だ。' }, itemId: 0 }] }]);
  const forestScene = toSceneData(forestWorld.stages[0]);
  const forestGame = createWalkingGame(forestScene);
  assert.equal(forestGame.move('back'), false, 'the trunk stops walking along the path');
  assert.equal(forestGame.move('left'), true, 'the player can pass beside the trunk');
  assert.equal(forestGame.move('back'), true, 'canopy overhang never blocks the adjacent path');
  assert.equal(forestGame.move('back'), true);
  assert.equal(forestGame.move('right'), true, 'the ground under the canopy remains walkable');
  const beneathTree = createWalkingGame(forestScene);
  beneathTree.move('back'); beneathTree.interact();
  assert.equal(beneathTree.message.text, '大きな木だ。');
  beneathTree.interact(); assert.equal(beneathTree.message.text, 'やくそうを手に入れた！');
  assert.deepEqual(entityCollisionFrame(forestScene.entities[0]), { x: 48, y: 48, width: 16, height: 16 });
  // Composite actual tree pixels over an opaque character to check visible occlusion.
  {
    const sourceBefore = structuredClone(forestScene), size = 112, heroColor = 0xff00ff;
    const actor = { image: {}, sourceX: 0, sourceY: 0, width: 32, height: 32,
      pixelCorrections: [{ x: 20, y: 18, color: '#fe0101' }] };
    const kingActor = { ...actor, image: {} };
    function renderTreeLayer(position, entities = forestScene.entities) {
      const pixels = new Uint32Array(size * size);
      const fill = (x, y, w, h, color) => {
        for (let row = Math.max(0, y); row < Math.min(size, y + h); row++) {
          for (let col = Math.max(0, x); col < Math.min(size, x + w); col++) pixels[row * size + col] = color;
        }
      };
      drawCompiledScene({ fillStyle: '',
        fillRect(x, y, w, h) { fill(x, y, w, h, parseInt(this.fillStyle.slice(1), 16)); },
        drawImage(...args) { fill(args[5], args[6], args[7], args[8], args[0] === kingActor.image ? 0x00ffff : heroColor); },
      }, { ...forestScene, spawn: position, entities }, { king: kingActor, player: actor });
      return pixels;
    }
    const treeOnly = renderTreeLayer(null);
    const behind = renderTreeLayer({ x: 48, y: 16 });
    assert.equal(behind[34 * size + 60], treeOnly[34 * size + 60], 'leaves cover the player and face corrections behind the root');
    assert.equal(behind[17 * size + 40], heroColor, 'transparent corners do not hide the player');
    const front = renderTreeLayer({ x: 48, y: 48 });
    assert.notEqual(treeOnly[49 * size + 60], heroColor);
    assert.equal(front[49 * size + 60], heroColor, 'the player draws over leaves when in front of the root');
    const beside = renderTreeLayer({ x: 32, y: 32 });
    assert.equal(beside[40 * size + 40], heroColor, 'equal depth keeps the player visible beside the trunk');
    const overlapping = [{ kind: 'tree', x: 32, y: 16, parameters: [] }, { kind: 'tree', x: 16, y: 0, parameters: [] }];
    assert.deepEqual(renderTreeLayer(null, overlapping), renderTreeLayer(null, [...overlapping].reverse()), 'near trees cover far trees regardless of placement order');
    const ground = renderTreeLayer(null, []);
    for (const kind of npcKinds) {
      const npc = { kind, x: 48, y: 32, parameters: kind === 'king' ? [0] : [] };
      const only = renderTreeLayer(null, [npc]);
      const rear = renderTreeLayer({ x: 48, y: 16 }, [npc]);
      let covered = 0;
      for (let y = 32; y < 48; y++) for (let x = 40; x < 72; x++) {
        const i = y * size + x;
        if (only[i] !== ground[i]) { assert.equal(rear[i], only[i], `${kind} covers the player behind its feet`); covered++; }
      }
      assert.ok(covered > 0);
      const near = renderTreeLayer({ x: 48, y: 48 }, [npc]);
      assert.equal(near[55 * size + 55], heroColor, `${kind} is covered by the player in front`);
      const same = renderTreeLayer({ x: 32, y: 32 }, [npc]);
      assert.equal(same[42 * size + 52], heroColor, `${kind} equal depth keeps the player in front`);
      const mixed = [{ kind: 'tree', x: 32, y: 16, parameters: [] }, npc];
      // Different feet depths are sorted across NPC and tree categories.
      mixed[1] = { ...npc, y: 16 };
      assert.deepEqual(renderTreeLayer(null, mixed), renderTreeLayer(null, [...mixed].reverse()));
    }
    for (const kind of ['weapon', 'armor', 'item']) {
      const shop = { kind: `${kind}-shop`, x: 0, y: 0, parameters: [] };
      const merchant = { kind: `${kind}-merchant`, x: 32, y: 30, parameters: [] };
      const shopOnly = renderTreeLayer(null, [shop]);
      const withMerchant = renderTreeLayer(null, [shop, merchant]);
      assert.equal(withMerchant[59 * size + 35], shopOnly[59 * size + 35], `${kind} counter covers the merchant's legs`);
    }
    assert.deepEqual(forestScene, sourceBefore);
  }
  const worldDraft = parseWorld(JSON.parse(readFileSync(join(rootPath, 'compiler/maps/world.json'), 'utf8')));
  const overworld = toSceneData(worldDraft.stages[0]);
  const at = (x, y) => ({ x: x * 16, y: y * 16 - 16 });
  assert.equal(canStand(overworld, at(0, 0)), false, 'sea blocks walking');
  assert.equal(canStand(overworld, at(16, 2)), true, 'the beach is walkable');
  assert.equal(canStand(overworld, at(16, 3)), false, 'mountains block walking');
  assert.equal(canStand(overworld, at(6, 11)), true, 'forest markers preserve walking');
  assert.equal(canStand(overworld, at(19, 6)), true, 'the river bridge is walkable');
  const reachable = new Set(), queue = [overworld.spawn];
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i], key = `${p.x},${p.y}`;
    if (reachable.has(key) || !canStand(overworld, p)) continue;
    reachable.add(key);
    for (const [dx, dy] of [[0,-16], [0,16], [-16,0], [16,0]]) queue.push({ x: p.x + dx, y: p.y + dy });
  }
  assert.ok(reachable.has(`${20 * 16},${5 * 16}`), 'the bridge connects the opposite river bank to the starting plain');
  const locationKinds = ['world-town', 'world-forest-entrance', 'world-cave', 'world-demon-castle'];
  for (const kind of locationKinds) {
    const location = overworld.entities.find(entity => entity.kind === kind);
    assert.ok(location, `${kind} is placed`);
    assert.ok(reachable.has(`${location.x},${location.y - 16}`), `${kind} can be reached from the starting plain`);
    assert.deepEqual(entityFrame(location), { x: location.x, y: location.y, width: 16, height: 16 });
    assert.deepEqual(entityDrawingFrame(location), { x: location.x - 8, y: location.y - 16, width: 32, height: 32 });
    assert.equal(canStand(overworld, { x: location.x, y: location.y - 16 }), true, 'the entrance never blocks its own exit');
    const inSea = { ...overworld, entities: [...overworld.entities, { ...location, x: 0, y: 0 }] };
    assert.equal(canStand(inSea, at(0, 0)), false, 'a marker cannot make the sea walkable');
    // Destination maps are test fixtures only. The actual sample still has no interior connections.
    const portalStage = clone(worldDraft.stages[0]);
    portalStage.spawn = { x: location.x, y: location.y };
    portalStage.exits = [{ x: location.x / 16, y: location.y / 16, targetStageId: 3, targetX: 1, targetY: 1, direction: 'front' }];
    const interior = { id: 3, name: '入口の検証', width: 3, height: 3, spawn: null,
      floor: { default: 'grass', rectangles: [] }, entities: [],
      exits: [{ x: 1, y: 2, targetStageId: 2, targetX: location.x / 16, targetY: location.y / 16 + 1, direction: 'front' }] };
    const portalWorld = parseWorld([portalStage, interior]);
    const portalGame = createWorldGame(decodeScenes(encodeWorld(portalWorld).bytes), 2);
    assert.equal(portalGame.move('back'), true);
    assert.equal(portalGame.scene.id, 3, `${kind} accepts a transparent exit on its 1x1 entrance`);
    assert.equal(portalGame.move('front'), true);
    assert.equal(portalGame.scene.id, 2);
    assert.deepEqual(portalGame.position, portalStage.spawn, 'returning places the player beside the entrance');
  }
  const worldWithoutBridge = { ...overworld, tiles: new Uint8Array(overworld.tiles) };
  worldWithoutBridge.tiles[6 * 32 + 19] = 14;
  assert.equal(canStand(worldWithoutBridge, at(19, 6)), false);
  const adventureWorld = createAdventureWorld();
  const adventureData = decodeScenes(encodeWorld(adventureWorld).bytes);
  const adventureGame = createWorldGame(adventureData, 2, () => 1);
  assert.equal(adventureGame.move('back'), true);
  assert.equal(adventureGame.scene.id, 1);
  assert.deepEqual(adventureGame.position, { x: 192, y: 288 });
  assert.equal(adventureGame.move('front'), true);
  assert.equal(adventureGame.scene.id, 2);
  assert.deepEqual(adventureGame.position, { x: 128, y: 240 });
  for (const direction of ['left', 'back', 'back', 'back']) assert.equal(adventureGame.move(direction), true);
  assert.equal(adventureGame.scene.id, 3);
  assert.deepEqual(adventureGame.position, { x: 144, y: 224 });
  function walkAdventureTo(x, y) {
    const positions = [{ ...adventureGame.position, path: [] }], seen = new Set();
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i], key = `${p.x},${p.y}`;
      if (seen.has(key)) continue; seen.add(key);
      if (p.x === x && p.y === y) { for (const direction of p.path) assert.equal(adventureGame.move(direction), true); return; }
      for (const [direction, dx, dy] of [['back',0,-16], ['front',0,16], ['left',-16,0], ['right',16,0]]) {
        const next = { x: p.x + dx, y: p.y + dy };
        if (canStand(adventureGame.scene, next)) positions.push({ ...next, path: [...p.path, direction] });
      }
    }
    assert.fail('The forest path must connect the entrance and clearing.');
  }
  walkAdventureTo(128, 48);
  assert.match(adventureGame.message.text, /やくそう/);
  assert.deepEqual(adventureGame.inventory, [{ itemId: 0, count: 1 }]);
  adventureGame.interact();
  walkAdventureTo(144, 224);
  assert.equal(adventureGame.move('front'), true);
  assert.equal(adventureGame.scene.id, 2);
  assert.deepEqual(adventureGame.position, { x: 112, y: 208 });
  assert.deepEqual(adventureGame.inventory, [{ itemId: 0, count: 1 }]);
  assert.equal(adventureGame.move('back'), true);
  assert.equal(adventureGame.scene.id, 3);
  assert.equal(adventureGame.visibleEntities.some(entity => entity.kind === 'loot'), false, 'the forest pickup stays collected after reentry');
  adventureGame.reset();
  assert.equal(adventureGame.scene.id, 2);
  assert.deepEqual(adventureGame.inventory, []);
  const quietForestGame = createWorldGame(adventureData, 3, () => 0);
  assert.equal(quietForestGame.move('back'), true);
  assert.equal(quietForestGame.encounter.enemyId, 1, 'the demo forest now draws from its monster table');
  const configuredAdventure = clone(adventureWorld);
  configuredAdventure.stages.find(stage => stage.id === 3).encounter = { enabled: true, rate: 100, enemyId: 3 };
  const wolfGame = createWorldGame(decodeScenes(encodeWorld(configuredAdventure).bytes), 3, () => 0);
  wolfGame.move('back'); assert.equal(wolfGame.encounter.enemyId, 3);
  const existingWorld = clone(original);
  existingWorld.stages.push({ ...clone(worldDraft.stages[0]), id: 2 }, { ...clone(worldDraft.stages[0]), id: 3 });
  const beforeAppend = clone(existingWorld);
  const entryId = appendAdventureSample(existingWorld);
  assert.equal(entryId, 6);
  assert.deepEqual(existingWorld.stages.slice(0, 4), beforeAppend.stages, 'sample addition never changes edited stages');
  assert.deepEqual(existingWorld.stages.slice(4).map(stage => stage.id), [4,5,6,7,8,9]);
  const remapped = decodeScenes(encodeWorld(parseWorld(existingWorld)).bytes);
  const remappedGame = createWorldGame(remapped, entryId, () => 1);
  remappedGame.move('back'); assert.equal(remappedGame.scene.id, 5, 'the new field links to its own remapped town');
  for (const [index, world] of [original, editedWorld, checkerWorld, narrowWorld, emptyWorld, forestWorld, worldDraft, adventureWorld, existingWorld].entries()) {
    const source = join(temporary, `world-${index}.json`), binary = join(temporary, `world-${index}.bin`);
    writeFileSync(source, JSON.stringify(world));
    execFileSync('python3', ['compiler/build.py', '--maps', source, '--out', binary], { cwd: rootPath });
    const encoded = encodeWorld(world).bytes;
    assert.deepEqual(Buffer.from(encoded), readFileSync(binary));
    assert.deepEqual(decodeScenes(encoded), world.stages.map(s => {
      const { id, width, height, spawn, tiles, entities, exits, encounter } = toSceneData(s);
      return { id, width, height, spawn, tiles, entities, ...(exits ? { exits } : {}), ...(encounter ? { encounter } : {}) };
    }));
  }
  const history = new History(clone(original));
  const before = clone(history.world);
  history.world.stages[0].name = '変更';
  history.commit(before); history.undo(); assert.deepEqual(history.world, original);
  history.redo(); assert.equal(history.world.stages[0].name, '変更');
  for (const mutate of [s => s.width = 33, s => s.entities[0].x = 1, s => s.spawn.x = 510,
    s => s.entities[1].parameters = [2], s => s.floor.default = 'missing']) {
    const bad = clone(original); mutate(bad.stages[0]); assert.throws(() => parseWorld(bad));
  }
  assert.throws(() => parseWorld([original.stages[0], original.stages[0]]));

  const field = toSceneData(parseWorld({ id: 0, name: '歩行', width: 3, height: 5,
    spawn: { x: 16, y: 48 }, spawnAnchor: 'frame', npcAnchor: 'frame',
    floor: { default: 'grass', rectangles: [] }, entities: [] }).stages[0]);
  const fieldBefore = structuredClone(field);
  const game = createWalkingGame(field);
  assert.equal(game.move('right'), true); assert.deepEqual(game.position, { x: 32, y: 48 });
  assert.equal(game.move('right'), false); assert.equal(game.direction, 'right');
  game.reset(); assert.deepEqual(game.position, field.spawn); assert.equal(game.direction, 'front');
  for (let i = 0; i < 4; i++) assert.equal(game.move('back'), true);
  assert.equal(game.move('back'), false); assert.deepEqual(game.position, { x: 16, y: -16 });
  assert.deepEqual(field, fieldBefore);
  field.tiles.fill(12); // The runtime owns a snapshot, independent of later source edits.
  assert.equal(game.move('front'), true);
  const catalog = JSON.parse(readFileSync(join(rootPath, 'web/src/data/scene-catalog.json')));
  for (const [id, name] of catalog.tiles.entries()) {
    const sample = { ...fieldBefore, tiles: new Uint8Array(15).fill(id) };
    assert.equal(canStand(sample, sample.spawn), ['marble', 'carpet', 'grass', 'dirt', 'brick', 'bridge', 'forest-ground', 'sand', 'cave-floor', 'demon-floor', 'demon-carpet', 'world-forest', 'meadow-flowers', 'ruins-floor'].includes(name), name);
  }
  const corridor = structuredClone(fieldBefore);
  for (let y = 0; y < 5; y++) { corridor.tiles[y * 3] = 3; corridor.tiles[y * 3 + 2] = 4; }
  const narrowGame = createWalkingGame(corridor);
  assert.equal(narrowGame.move('back'), true);
  assert.equal(narrowGame.move('left'), false); assert.equal(narrowGame.move('right'), false);
  // A horizontal corridor only one tile high: walls can overlap the head, never the feet.
  const horizontal = toSceneData(parseWorld({ id: 0, name: '横道', width: 5, height: 4,
    spawn: { x: 0, y: 16 }, spawnAnchor: 'frame', npcAnchor: 'frame',
    floor: { default: 'wall-top', rectangles: [{ tile: 'grass', x: 0, y: 2, width: 5, height: 1 }] }, entities: [] }).stages[0]);
  const horizontalGame = createWalkingGame(horizontal);
  for (let i = 0; i < 4; i++) assert.equal(horizontalGame.move('right'), true);
  assert.equal(horizontalGame.move('right'), false);
  assert.equal(horizontalGame.move('back'), false); assert.equal(horizontalGame.move('front'), false);
  for (const headTile of [2, 10, 12]) {
    const sample = structuredClone(fieldBefore);
    sample.tiles[3 * 3 + 1] = headTile;
    assert.equal(canStand(sample, sample.spawn), true, 'head tile never blocks standing');
    sample.tiles[4 * 3 + 1] = headTile;
    assert.equal(canStand(sample, sample.spawn), false, 'feet tile blocks standing');
  }
  const headPillar = makeEntity('pillar', 16, 16, original.stages[0]);
  assert.equal(canStand({ ...fieldBefore, entities: [headPillar] }, { x: 16, y: 32 }), true);
  assert.equal(canStand({ ...fieldBefore, entities: [headPillar] }, { x: 16, y: 16 }), false);
  const castleWalk = toSceneData(original.stages[0]);
  // Above either pillar is 1 tile of floor; the side walls touch the pillars.
  for (const x of [16, 80]) {
    assert.equal(canStand(castleWalk, { x, y: 0 }), true);
    assert.equal(canStand(castleWalk, { x, y: 32 }), false);
    assert.equal(canStand(castleWalk, { x, y: 48 }), true, 'head may overlap the pillar');
  }
  for (const x of [0, 96]) assert.equal(canStand(castleWalk, { x, y: 32 }), false);
  for (const kind of npcKinds) {
    const npc = { kind, x: 32, y: 32, parameters: kind === 'king' ? [0] : [] };
    const sample = { ...fieldBefore, spawn: { x: 16, y: 32 }, entities: [npc] };
    assert.equal(createWalkingGame(sample).move('right'), false, kind);
    assert.equal(canStand(sample, { x: 16, y: 32 }), true, `${kind} artwork overhang is not a collider`);
    assert.equal(createWalkingGame({ ...sample, entities: [{ ...npc, x: 34 }] }).move('right'), false, `${kind} 2px placement`);
    assert.equal(canStand(sample, { x: 32, y: 16 }), true, `${kind} head is passable`);
    const headPassage = createWalkingGame({ ...sample, spawn: { x: 16, y: 16 } });
    assert.equal(headPassage.move('right'), true, `${kind} can be walked behind`);
    assert.equal(headPassage.move('front'), false, `${kind} feet stop movement`);
    for (const [position, direction] of [[{ x: 32, y: 16 }, 'front'], [{ x: 32, y: 48 }, 'back'],
      [{ x: 16, y: 32 }, 'right'], [{ x: 48, y: 32 }, 'left']]) {
      const talk = createWalkingGame({ ...sample, width: 5, tiles: new Uint8Array(25).fill(7),
        entities: [{ ...npc, dialogue: { type: 'custom', text: '足元から会話' } }] }, { position, direction });
      talk.interact(); assert.equal(talk.message?.text, '足元から会話', `${kind} ${direction}`);
    }
  }
  for (const kind of ['pillar', 'well', 'castle', 'weapon-shop', 'armor-shop', 'item-shop', 'house-red', 'house-slate']) {
    const sample = { ...fieldBefore, entities: [makeEntity(kind, 16, 32, original.stages[1])] };
    const house = kind.startsWith('house-');
    assert.equal(canStand(sample, { x: 16, y: 32 }), house, `${kind}: upper house artwork is passable`);
    if (house) assert.equal(canStand(sample, { x: 16, y: 48 }), false, `${kind}: lower walls stop movement`);
  }
  const throneScene = structuredClone(castleWalk);
  throneScene.entities = throneScene.entities.filter(e => e.kind !== 'king');
  const chair = throneScene.entities.find(e => e.kind === 'throne');
  assert.deepEqual(entityFrame(chair), { x: 32, y: 16, width: 48, height: 32 }); // editor placement unchanged
  assert.deepEqual(entityDrawingFrame(chair), { x: 44, y: 16, width: 24, height: 24 }); // artwork unchanged
  assert.deepEqual(entityCollisionFrame(chair), { x: 48, y: 16, width: 16, height: 32 });
  for (const x of [32, 64]) for (const y of [0, 16]) assert.equal(canStand(throneScene, { x, y }), true, 'chair sides are passable');
  assert.equal(canStand(throneScene, { x: 48, y: 16 }), false);
  const investigateChair = createWalkingGame(throneScene);
  assert.equal(investigateChair.move('back'), true); assert.equal(investigateChair.move('back'), true);
  assert.equal(investigateChair.move('back'), false); investigateChair.interact();
  assert.match(investigateChair.message.text, /玉座だ/); investigateChair.interact();
  assert.equal(investigateChair.message, null);
  const sideChair = createWalkingGame(throneScene, { position: { x: 32, y: 16 }, direction: 'right' });
  sideChair.interact(); assert.equal(sideChair.message, null);
  const occludedChair = createWalkingGame(castleWalk);
  occludedChair.move('back'); occludedChair.move('back'); occludedChair.interact();
  assert.match(occludedChair.message.text, /勇者/); // the king blocks reaching/inspecting the throne
  for (const kind of ['loot', 'moat-inner-bank', 'moat-outer-bank']) {
    const sample = { ...fieldBefore, entities: [{ kind, x: 16, y: 32, parameters: kind === 'loot' ? [0] : [8, 16] }] };
    assert.equal(canStand(sample, sample.spawn), true, kind);
  }
  assert.throws(() => createWalkingGame({ ...fieldBefore, spawn: null }), /開始位置/);
  assert.throws(() => createWalkingGame({ ...fieldBefore, tiles: new Uint8Array(15).fill(12) }), /重なっています/);

  // Small DOM double exercises the actual editor's event handlers and download contents.
  const storage = new Map();
  const downloads = [];
  class Element {
    children = []; listeners = new Map(); attributes = {}; style = {}; hidden = false; images = []; fills = [];
    disabled = false; value = ''; checked = false; dataset = {}; textContent = '';
    constructor(tag = 'div', attributes = {}) {
      this.tagName = tag.toUpperCase(); this.attributes = attributes;
      this.id = attributes.id; this.value = attributes.value ?? ''; this.checked = 'checked' in attributes;
      this.hidden = 'hidden' in attributes;
      for (const [key, value] of Object.entries(attributes)) if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
      const classes = new Set((attributes.class ?? '').split(' '));
      this.classList = { toggle: (name, on) => on ? classes.add(name) : classes.delete(name), add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) };
    }
    get innerHTML() { return this.html ?? ''; }
    set innerHTML(html) {
      this.html = html;
      this.children = [];
      const stack = [this];
      for (const match of html.matchAll(/<\/?([\w-]+)([^>]*)>/g)) {
        if (match[0].startsWith('</')) { stack.pop(); continue; }
        const attributes = {};
        for (const a of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) attributes[a[1]] = a[2] ?? '';
        const Child = match[1] === 'input' ? Input : match[1] === 'select' ? Select : match[1] === 'textarea' ? Textarea : Element;
        const child = new Child(match[1], attributes);
        stack.at(-1).children.push(child);
        if (!['input', 'br', 'hr', 'img'].includes(match[1])) stack.push(child);
      }
    }
    querySelectorAll(selector) {
      const result = [];
      for (const child of this.children) {
        if (selector.startsWith('#') ? child.id === selector.slice(1) : selector.startsWith('[')
          ? (() => { const attr=selector.slice(1,-1).match(/^([\w-]+)(?:="([^"]*)")?$/); return attr && attr[1] in child.attributes && (attr[2]===undefined || child.attributes[attr[1]]===attr[2]); })() : child.tagName.toLowerCase() === selector) result.push(child);
        result.push(...child.querySelectorAll(selector));
      }
      return result;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
    contains(element) { return element === this || this.children.some(child => child.contains(element)); }
    addEventListener(name, callback) { const list = this.listeners.get(name) ?? []; list.push(callback); this.listeners.set(name, list); }
    removeEventListener(name, callback) { this.listeners.set(name, (this.listeners.get(name) ?? []).filter(fn => fn !== callback)); }
    async dispatch(name, extra = {}) { for (const callback of this.listeners.get(name) ?? []) await callback({ target: this, preventDefault() {}, ...extra }); }
    click() { if (!this.disabled) return this.dispatch('click'); }
    setAttribute(name, value) { this.attributes[name] = value; }
    removeAttribute(name) { delete this.attributes[name]; }
    getContext() {
      const context = { canvas: this, drawImage: (...args) => this.images.push(args), fillRect: (x, y, width, height) => {
        if ('data-battle-canvas' in this.attributes) this.fills.push({ x, y, width, height, color: context.fillStyle });
      } };
      return new Proxy(context, { get: (target, name) => name in target ? target[name] : () => {}, set: (target, name, value) => (target[name] = value, true) });
    }
    getBoundingClientRect() { return { left: 0, top: 0, width: parseFloat(this.style.width), height: parseFloat(this.style.height) }; }
    focus() {} setPointerCapture() {} clientWidth = 640; clientHeight = 640;
  }
  class Input extends Element {} class Select extends Element {} class Textarea extends Element {}
  globalThis.HTMLInputElement = Input; globalThis.HTMLSelectElement = Select; globalThis.HTMLTextAreaElement = Textarea;
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  const frames = new Map(); let frameId = 0;
  globalThis.window = new Element();
  let confirmAnswer = false;
  const confirmations = [];
  window.confirm = message => { confirmations.push(message); return confirmAnswer; };
  window.setTimeout = callback => callback();
  window.requestAnimationFrame = callback => { frames.set(++frameId, callback); return frameId; };
  window.cancelAnimationFrame = id => frames.delete(id);
  function tick(time) { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(time)); }
  let blob;
  URL.createObjectURL = value => { blob = value; return 'blob:test'; };
  URL.revokeObjectURL = () => {};
  globalThis.document = new Element();
  document.createElement = () => ({ click() { downloads.push({ name: this.download, blob }); } });
  const { startEditor } = await import(pathToFileURL(join(temporary, 'editor.mjs')).href);
  const page = new Element();
  const character = { image: {}, sourceX: 0, sourceY: 0, width: 64, height: 64 };
  const characters = { king: { ...character, image: {} }, player: character, players: {
    front: character, back: { ...character, sourceX: 64 },
    left: { ...character, sourceY: 64 }, right: { ...character, sourceX: 64, sourceY: 64 },
  } };
  characters.kings = { front: { ...character, image: {} }, ...Object.fromEntries(['back', 'left', 'right'].map(direction =>
    [direction, { image: {}, sourceX: 0, sourceY: 0, width: 64, height: 64 }])) };
  {
    const { mountPlayView } = await import(pathToFileURL(join(temporary, 'play.mjs')));
    const root = new Element(); let visible = true;
    const play = mountPlayView(root, characters, () => visible);
    const field = { id: 0, width: 8, height: 8, spawn: { x: 48, y: 48 }, tiles: new Uint8Array(64).fill(7), entities: [] };
    const viewport = root.querySelector('[data-play-viewport]'), canvas = root.querySelector('[data-play-canvas]');
    const position = () => canvas.images.at(-1).slice(5, 7);
    const pointer = (name, extra = {}) => viewport.dispatch(name, { pointerType: 'touch', button: 0, pointerId: 71, clientX: 100, clientY: 100, ...extra });
    play.start(field); assert.deepEqual(position(), [40, 48]);
    assert.equal(root.querySelector('[data-play-stage]').textContent, '草原');
    assert.equal(root.querySelector('[data-play-objective]').hidden, true, 'custom maps without story roles have no empty goal header');
    await pointer('pointerdown'); await pointer('pointermove', { clientX: 108 });
    assert.deepEqual(position(), [40, 48], 'small finger motion does not move');
    await pointer('pointermove', { clientX: 130 }); assert.deepEqual(position(), [56, 48]);
    await pointer('pointermove', { pointerId: 72, clientY: 140 }); assert.deepEqual(position(), [56, 48], 'another finger cannot change the active direction');
    tick(performance.now() + 200); assert.deepEqual(position(), [72, 48], 'holding a swipe repeats movement');
    await pointer('pointermove', { clientY: 130 }); assert.deepEqual(position(), [72, 64], 'dominant vertical motion changes direction');
    await pointer('pointermove'); tick(performance.now() + 400); assert.deepEqual(position(), [72, 64], 'returning to the dead zone stops movement');
    await pointer('pointermove', { clientX: 130 }); const released = position();
    await pointer('pointerup'); tick(performance.now() + 600); assert.deepEqual(position(), released, 'release stops repeat');
    await pointer('pointerdown'); await pointer('pointermove', { clientX: 70 }); const cancelled = position();
    await pointer('pointercancel'); tick(performance.now() + 800); assert.deepEqual(position(), cancelled, 'cancel stops repeat');
    await pointer('pointerdown'); await pointer('pointermove', { clientY: 70 }); const blurred = position();
    await window.dispatch('blur'); tick(performance.now() + 1000); assert.deepEqual(position(), blurred);
    const menu = root.querySelector('[data-play-inventory]'); menu.open = true; await menu.dispatch('toggle');
    await pointer('pointerdown'); await pointer('pointermove', { clientX: 130 }); assert.deepEqual(position(), blurred, 'menus block swiping');
    menu.open = false; await menu.dispatch('toggle'); visible = false;
    await pointer('pointerdown'); await pointer('pointermove', { clientX: 130 }); assert.deepEqual(position(), blurred, 'inactive pages block swiping');
    visible = true; play.stop(); play.start(field); assert.deepEqual(position(), [40, 48]);
    tick(performance.now() + 2000); assert.deepEqual(position(), [40, 48], 'starting again clears the old gesture');
    play.start(adventureData[0], true, adventureData);
    assert.equal(root.querySelector('[data-play-stage]').textContent, 'お城');
    assert.equal(root.querySelector('[data-play-objective]').hidden, false);
    assert.match(root.querySelector('[data-play-objective-text]').textContent, /森の妖精と洞窟の魔女/);
    const forest = adventureData.find(scene => scene.id === 3), fairy = forest.entities.find(entity => entity.kind === 'forest-fairy');
    const cave = adventureData.find(scene => scene.id === 4), witch = cave.entities.find(entity => entity.kind === 'cave-witch');
    const dialogueScenes = [fairy, witch].map((entity, index) => ({ ...field, id: 80 + index, entities: [{ ...entity, x: 48, y: 32 }],
      exits: index ? [] : [{ x: 4, y: 4, targetStageId: 81, targetX: 3, targetY: 4, direction: 'back' }] }));
    play.start(dialogueScenes[0], true, dialogueScenes);
    await root.dispatch('keydown', { key: 'ArrowUp' }); await window.dispatch('keyup', { key: 'ArrowUp' });
    await root.querySelector('[data-play-interact]').click();
    await root.querySelector('[data-play-advance]').click();
    await root.dispatch('keydown', { key: 'ArrowRight' }); await window.dispatch('keyup', { key: 'ArrowRight' });
    assert.equal(root.querySelector('[data-play-stage]').textContent, '洞窟');
    await root.dispatch('keydown', { key: 'ArrowUp' }); await window.dispatch('keyup', { key: 'ArrowUp' });
    await root.querySelector('[data-play-interact]').click();
    assert.match(root.querySelector('[data-play-objective-text]').textContent, /魔王城/, 'the shared field goal updates after both testimonies');
    await root.querySelector('[data-play-advance]').click();
    confirmAnswer = true;
    await root.querySelector('[data-play-reset]').click();
    confirmAnswer = false;
    confirmations.pop();
    assert.match(root.querySelector('[data-play-objective-text]').textContent, /森の妖精と洞窟の魔女/, 'reset restores the initial goal');
    play.stop(); assert.equal(root.querySelector('[data-play-objective]').hidden, true);
    for (const [width, viewportWidth, expectedScale] of [[7, 360, 3], [9, 432, 3], [10, 480, 3], [9, 360, 2], [10, 160, 1], [11, 528, 2], [9, 900, 4]]) {
      viewport.clientWidth = viewportWidth;
      play.start({ ...field, width, tiles: new Uint8Array(width * field.height).fill(7) });
      assert.equal(canvas.style.width, `${width * 16 * expectedScale}px`, `a ${width}-cell map uses an integer scale within the ${viewportWidth}px viewport`);
      assert.equal(canvas.style.height, `${field.height * 16 * expectedScale}px`);
    }
    const labelledRoot = new Element(), labelled = mountPlayView(labelledRoot, characters, () => true, () => '作者の名前');
    labelled.start(field); assert.equal(labelledRoot.querySelector('[data-play-stage]').textContent, '作者の名前'); labelled.dispose();
    play.dispose();
  }
  const images = [];
  drawCompiledScene({ fillRect() {}, drawImage(...args) { images.push(args); } }, toSceneData(original.stages[0]), { king: character, player: character });
  assert.deepEqual(images.at(-1).slice(5), [40, 64, 32, 32]);
  const dispose = startEditor(page, characters);
  const control = id => { const result = page.querySelector(`#editor-${id}`); assert.ok(result, id); return result; };
  assert.equal(control('byte-count').textContent, `バイナリ ${encodeWorld(original, true).bytes.length} B`);
  assert.equal(control('base-url').value, 'https://tag-quest-kappa.vercel.app/');
  control('tag-type').value = 'ntag213'; await control('tag-type').dispatch('change');
  assert.equal(control('tag-budget').value, '144'); assert.match(control('tag-count').textContent, /144 B.*超過/);
  assert.equal(control('export-url').disabled, true);
  const blockedDownloads = downloads.length;
  await control('export-url').click(); assert.equal(downloads.length, blockedDownloads);
  control('tag-type').value = 'ntag215'; await control('tag-type').dispatch('change');
  assert.equal(control('tag-budget').value, '496'); assert.equal(control('budget').max, 496);
  assert.equal(control('export-url').disabled, false);
  await control('export-url').click();
  assert.equal(downloads.length, blockedDownloads + 1); assert.equal(downloads.at(-1).name, 'tagquest.url.txt');
  assert.equal(await downloads.at(-1).blob.text(), control('game-url').value + '\n');
  assert.match(control('ndef-detail').textContent, /NDEF・TLV・終端/);
  control('tag-reserved').value = '5'; await control('tag-reserved').dispatch('change');
  assert.match(control('ndef-detail').textContent, /予約 5 B/);
  control('tag-reserved').value = '0'; await control('tag-reserved').dispatch('change');
  // A focused field can change without a change event before the export click.
  const beforeUncommitted = downloads.length;
  control('tag-reserved').value = '496'; await control('export-url').click();
  assert.equal(downloads.length, beforeUncommitted); assert.equal(control('export-url').disabled, true);
  assert.match(control('url-export-status').textContent, /容量を.*減らす/);
  control('tag-reserved').value = '0'; await control('tag-reserved').dispatch('change');
  control('base-url').value = 'invalid'; await control('base-url').dispatch('change');
  assert.equal(control('export-url').disabled, true);
  control('base-url').value = 'https://tagquest.vercel.app/'; await control('base-url').dispatch('change');
  const wallMaterials = control('palette').querySelectorAll('[data-material]').map(button => button.dataset.material);
  assert.ok(wallMaterials.includes('wall-top')); assert.ok(wallMaterials.includes('demon-wall-top'));
  assert.equal(wallMaterials.length, 21, 'floor palette shows one choice per wall material and the new exploration floors');
  for (const old of ['wall-left', 'wall-right', 'wall-top-left', 'wall-top-right', 'demon-wall-left', 'demon-wall-right', 'demon-wall-top-left', 'demon-wall-top-right']) {
    assert.equal(wallMaterials.includes(old), false, 'manual wall directions are hidden');
  }
  const board = control('canvas');
  async function pointer(name, x, y) { await board.dispatch(name, { button: 0, pointerId: 1, clientX: x * 2, clientY: y * 2 }); }
  const savedKey = 'tagquest.world-editor.v1';
  await control('play').click();
  assert.equal(control('workspace').hidden, true);
  assert.equal(control('play-session').hidden, false);
  assert.equal(control('import').disabled, true);
  const beforePlayingClear = storage.get(savedKey);
  await control('clear-world').click();
  assert.equal(confirmations.length, 0, 'bulk deletion is unavailable while playing');
  assert.equal(storage.get(savedKey), beforePlayingClear);
  const playRoot = control('play-view'), playCanvas = playRoot.querySelector('[data-play-canvas]');
  const playerDraw = () => playCanvas.images.findLast(args => args[0] === character.image);
  assert.deepEqual(playerDraw().slice(5), [40, 64, 32, 32]);
  await playRoot.dispatch('keydown', { key: 'ArrowLeft' });
  assert.deepEqual(playerDraw().slice(5), [24, 64, 32, 32]);
  assert.equal(playerDraw()[2], 64); // left-facing source row
  await window.dispatch('keyup', { key: 'ArrowLeft' });
  await playRoot.dispatch('keydown', { key: 'ArrowUp' });
  assert.deepEqual(playerDraw().slice(5), [24, 48, 32, 32]);
  assert.equal(playerDraw()[1], 64); assert.equal(playerDraw()[2], 0);
  await window.dispatch('keyup', { key: 'ArrowUp' });
  await playRoot.dispatch('keydown', { key: 'ArrowUp' }); // head overlaps throne, feet remain on floor
  assert.deepEqual(playerDraw().slice(5), [24, 32, 32, 32]);
  await window.dispatch('keyup', { key: 'ArrowUp' });
  await playRoot.dispatch('keydown', { key: 'ArrowRight' }); // blocked by the king's 1-cell-wide frame
  assert.deepEqual(playerDraw().slice(5), [24, 32, 32, 32]);
  assert.equal(playerDraw()[1], 64); assert.equal(playerDraw()[2], 64);
  await window.dispatch('keyup', { key: 'ArrowRight' });
  await playRoot.dispatch('keydown', { key: 'ArrowUp' }); // pass along the throne's left side
  assert.deepEqual(playerDraw().slice(5), [24, 16, 32, 32]);
  await window.dispatch('keyup', { key: 'ArrowUp' });
  const drawsBefore = playCanvas.images.length;
  await playRoot.dispatch('keydown', { key: 'z', ctrlKey: true });
  assert.equal(playCanvas.images.length, drawsBefore);
  await playRoot.querySelector('[data-play-reset]').click();
  assert.deepEqual(playerDraw().slice(5), [24, 16, 32, 32], 'cancel preserves position');
  assert.match(confirmations.at(-1), /レベル・お金・所持品・装備・進行/);
  confirmAnswer = true;
  await playRoot.querySelector('[data-play-reset]').click();
  assert.deepEqual(playerDraw().slice(5), [40, 64, 32, 32]);
  confirmAnswer = false;
  assert.equal(storage.has(savedKey), false); // walking and reset never write the edited world
  await control('stop-play').click();
  assert.equal(control('workspace').hidden, false); assert.equal(frames.size, 0);
  assert.equal(control('import').disabled, false);
  await control('select-player').click();
  assert.equal(control('player-x').value, '48');
  await pointer('pointerdown', 56, 72); await pointer('pointermove', 72, 72); await pointer('pointerup', 72, 72);
  assert.deepEqual(JSON.parse(storage.get(savedKey)).stages[0].spawn, { x: 64, y: 64 });
  await control('undo').click();
  assert.deepEqual(JSON.parse(storage.get(savedKey)), original);
  await page.querySelector('[data-category]').click();
  await page.querySelectorAll('[data-material]').find(e => e.dataset.material === 'empty').click();
  await pointer('pointerdown', 48, 32); await pointer('pointerup', 48, 32);
  const afterEmpty = JSON.parse(storage.get(savedKey));
  assert.equal(toSceneData(afterEmpty.stages[0]).tiles[2 * 7 + 3], 12);
  assert.deepEqual(afterEmpty.stages[0].entities, original.stages[0].entities);
  await control('undo').click(); assert.deepEqual(JSON.parse(storage.get(savedKey)), original);
  await control('redo').click(); assert.deepEqual(JSON.parse(storage.get(savedKey)), afterEmpty);
  await control('undo').click();
  await page.querySelectorAll('[data-material]').find(e => e.dataset.material === 'grass').click();
  await pointer('pointerdown', 16, 32); await pointer('pointermove', 80, 32); await pointer('pointerup', 80, 32);
  assert.ok(storage.has(savedKey));
  const afterStroke = JSON.parse(storage.get(savedKey));
  assert.equal(toSceneData(afterStroke.stages[0]).tiles[2 * 7 + 3], 7);
  await control('undo').click(); assert.deepEqual(JSON.parse(storage.get(savedKey)), original);
  await control('redo').click(); assert.deepEqual(JSON.parse(storage.get(savedKey)), afterStroke);
  const npcCategory = page.querySelectorAll('[data-category]').find(e => e.dataset.category === 'npc');
  await npcCategory.click(); await pointer('pointerdown', 16, 48); await pointer('pointerup', 16, 48);
  assert.equal(JSON.parse(storage.get(savedKey)).stages[0].entities.at(-1).kind, 'king');
  control('entity-x').value = '18'; await control('entity-form').dispatch('submit');
  assert.equal(JSON.parse(storage.get(savedKey)).stages[0].entities.at(-1).x, 18);
  control('entity-x').value = '19'; await control('entity-form').dispatch('submit');
  assert.equal(control('error').hidden, false);
  assert.equal(JSON.parse(storage.get(savedKey)).stages[0].entities.at(-1).x, 18);
  await control('align').click();
  assert.deepEqual(entityFrame(JSON.parse(storage.get(savedKey)).stages[0].entities.at(-1)), { x: 16, y: 48, width: 16, height: 32 });
  await control('undo').click();
  await page.querySelectorAll('[data-tool]').find(e => e.dataset.tool === 'select').click();
  await pointer('pointerdown', 30, 60); await pointer('pointermove', 46, 76); await pointer('pointerup', 46, 76);
  assert.equal(JSON.parse(storage.get(savedKey)).stages[0].entities.at(-1).x, 32);
  assert.equal(JSON.parse(storage.get(savedKey)).stages[0].entities.at(-1).y, 64);
  await pointer('pointerdown', 36, 72); await pointer('pointermove', 52, 72); await board.dispatch('pointercancel');
  assert.equal(JSON.parse(storage.get(savedKey)).stages[0].entities.at(-1).x, 32);
  await control('delete-entity').click();
  assert.equal(JSON.parse(storage.get(savedKey)).stages[0].entities.length, 4);
  await page.querySelectorAll('[data-tool]').find(e => e.dataset.tool === 'rectangle').click();
  await page.querySelectorAll('[data-material]').find(e => e.dataset.material === 'carpet').click();
  await pointer('pointerdown', 16, 16); await pointer('pointermove', 48, 32); await pointer('pointerup', 48, 32);
  assert.equal(toSceneData(JSON.parse(storage.get(savedKey)).stages[0]).tiles[2 * 7 + 3], 1);
  await npcCategory.click();
  await pointer('pointerdown', 111, 95); await pointer('pointerup', 111, 95);
  assert.deepEqual(entityFrame(JSON.parse(storage.get(savedKey)).stages[0].entities.at(-1)), { x: 96, y: 64, width: 16, height: 32 });
  await control('undo').click();
  await control('add-stage').click();
  assert.equal(JSON.parse(storage.get(savedKey)).stages.length, 3);
  const beforeWorldSample = JSON.parse(storage.get(savedKey));
  await control('add-world-sample').click();
  const withWorldSample = JSON.parse(storage.get(savedKey));
  assert.deepEqual(withWorldSample.stages.slice(0, -1), beforeWorldSample.stages, 'adding the world preserves edited maps');
  assert.equal(withWorldSample.stages.at(-1).id, 3, 'the sample receives an unused stage ID');
  assert.equal(withWorldSample.stages.at(-1).width, 32);
  await page.querySelectorAll('[data-category]').find(button => button.dataset.category === 'object').click();
  for (const kind of locationKinds) {
    const choice = page.querySelectorAll('[data-material]').find(button => button.dataset.material === kind);
    assert.ok(choice, `${kind} is available in the editor`);
    assert.equal(choice.querySelector('[data-footprint]').textContent, '1×1マス');
  }
  await control('play').click();
  assert.equal(control('error').hidden, true);
  assert.equal(control('workspace').hidden, true);
  await control('stop-play').click();
  await control('undo').click();
  assert.deepEqual(JSON.parse(storage.get(savedKey)), beforeWorldSample, 'undo removes only the added sample');
  await page.querySelectorAll('[data-stage]').find(button => button.dataset.stage === '2').click();
  const beforeAdventureSample = JSON.parse(storage.get(savedKey));
  for (const [size, count] of [['large', 15], ['small', 6]]) {
    await control(`add-${size}-sample`).click();
    const added = JSON.parse(storage.get(savedKey));
    assert.deepEqual(added.stages.slice(0, -count), beforeAdventureSample.stages);
    assert.equal(added.stages.length, beforeAdventureSample.stages.length + count);
    await control('play').click();
    assert.equal(control('error').hidden, true);
    assert.match(control('play-view').querySelector('[data-play-stage]').textContent, /城/);
    await control('stop-play').click();
    await control('undo').click();
    assert.deepEqual(JSON.parse(storage.get(savedKey)), beforeAdventureSample);
    await control('redo').click(); assert.deepEqual(JSON.parse(storage.get(savedKey)), added);
    await control('undo').click();
  }
  await control('add-adventure-sample').click();
  const withAdventureSample = JSON.parse(storage.get(savedKey));
  assert.deepEqual(withAdventureSample.stages.slice(0, -6), beforeAdventureSample.stages);
  assert.equal(withAdventureSample.stages.length, beforeAdventureSample.stages.length + 6);
  await control('play').click();
  assert.equal(control('error').hidden, true);
  const adventureView = control('play-view');
  await adventureView.dispatch('keydown', { key: 'ArrowUp' });
  assert.equal(adventureView.querySelector('[data-play-stage]').textContent, '街');
  await window.dispatch('keyup', { key: 'ArrowUp' });
  await control('stop-play').click();
  const beforeClear = storage.get(savedKey);
  const beforeClearName = control('map-name').value;
  const beforeClearUndo = control('undo').disabled;
  const beforeClearRedo = control('redo').disabled;
  await control('clear-world').click();
  assert.match(confirmations.at(-1), new RegExp(`${withAdventureSample.stages.length}枚`));
  assert.match(confirmations.at(-1), /本当に削除しますか？/);
  assert.equal(storage.get(savedKey), beforeClear, 'cancel leaves saved maps unchanged');
  assert.equal(control('map-name').value, beforeClearName);
  assert.equal(control('undo').disabled, beforeClearUndo);
  assert.equal(control('redo').disabled, beforeClearRedo);
  confirmAnswer = true;
  await control('clear-world').click();
  const clearedWorld = JSON.parse(storage.get(savedKey));
  assert.equal(clearedWorld.stages.length, 1);
  assert.deepEqual(clearedWorld.stages[0], {
    id: 0, name: '空のマップ', width: 16, height: 16, spawn: null,
    spawnAnchor: 'frame', residentAnchor: 'frame', npcAnchor: 'frame', buildingAnchor: 'frame',
    floor: { default: 'empty', rectangles: [] }, entities: [], exits: [],
  });
  assert.equal(control('map-name').value, '空のマップ');
  assert.equal(control('remove-stage').disabled, true);
  const clearedScene = decodeScenes(encodeWorld(parseWorld(clearedWorld)).bytes)[0];
  assert.ok(clearedScene.tiles.every(tile => tile === 12));
  assert.equal(clearedScene.entities.length, 0);
  assert.equal((clearedScene.exits ?? []).length, 0);
  assert.equal(clearedScene.encounter, undefined);
  const reloadedPage = new Element();
  const disposeReloaded = startEditor(reloadedPage, characters);
  assert.equal(reloadedPage.querySelector('#editor-map-name').value, '空のマップ', 'reload retains the cleared world');
  assert.equal(reloadedPage.querySelectorAll('[data-stage]').length, 1);
  disposeReloaded();
  await control('add-small-sample').click();
  const smallOnly = JSON.parse(storage.get(savedKey));
  assert.equal(smallOnly.stages.length, 6, 'the untouched clear-world placeholder is replaced instead of taking NFC space');
  assert.ok(encodeWorld(parseWorld(smallOnly), true).bytes.length <= 337);
  assert.equal(control('export-url').disabled, false);
  await control('undo').click(); assert.deepEqual(JSON.parse(storage.get(savedKey)), clearedWorld);
  await control('undo').click();
  assert.equal(storage.get(savedKey), beforeClear, 'undo restores all maps and settings');
  await control('redo').click();
  assert.deepEqual(JSON.parse(storage.get(savedKey)), clearedWorld);
  await control('undo').click();
  assert.equal(storage.get(savedKey), beforeClear);
  confirmAnswer = false;
  await control('undo').click();
  assert.deepEqual(JSON.parse(storage.get(savedKey)), beforeAdventureSample);
  await page.querySelectorAll('[data-stage]').find(button => button.dataset.stage === '2').click();
  await page.querySelectorAll('[data-category]').find(button => button.dataset.category === 'npc').click();
  const beforeNoSpawn = storage.get(savedKey);
  await control('play').click();
  assert.equal(control('error').hidden, false); assert.match(control('error').textContent, /開始位置/);
  assert.equal(control('workspace').hidden, false); assert.equal(storage.get(savedKey), beforeNoSpawn);
  control('width').value = '24'; control('height').value = '20'; await control('map-form').dispatch('submit');
  assert.equal(control('map-count').textContent, '24 × 20 = 480マス · 配置 0個');
  confirmAnswer = true;
  control('width').value = '2'; control('height').value = '1'; await control('map-form').dispatch('submit');
  await pointer('pointerdown', 0, 0); await pointer('pointerup', 0, 0);
  assert.equal(control('error').hidden, false);
  assert.equal(JSON.parse(storage.get(savedKey)).stages.at(-1).entities.length, 0);
  await control('undo').click();
  const useTool = async name => page.querySelectorAll('[data-tool]').find(e => e.dataset.tool === name).click();
  // The spawn tool and drag both fit to the 1x2 frame, including on a 1-cell-wide map.
  control('width').value = '1'; control('height').value = '3'; await control('map-form').dispatch('submit');
  await useTool('spawn');
  await pointer('pointerdown', 15, 47); await pointer('pointerup', 15, 47);
  assert.deepEqual(JSON.parse(storage.get(savedKey)).stages.at(-1).spawn, { x: 0, y: 16 });
  control('player-y').value = '18'; await control('player-form').dispatch('submit');
  assert.equal(control('error').hidden, false);
  assert.deepEqual(JSON.parse(storage.get(savedKey)).stages.at(-1).spawn, { x: 0, y: 16 });
  // All NPCs fit in one column while their 32px artwork can overhang.
  control('height').value = '2'; await control('map-form').dispatch('submit');
  for (const kind of npcKinds) {
    await npcCategory.click();
    const choice = page.querySelectorAll('[data-material]').find(e => e.dataset.material === kind);
    assert.equal(choice.querySelector('[data-footprint]').textContent, '1×2マス');
    await choice.click();
    await pointer('pointerdown', 15, 31); await pointer('pointerup', 15, 31);
    const resident = JSON.parse(storage.get(savedKey)).stages.at(-1).entities.at(-1);
    assert.deepEqual(entityFrame(resident), { x: 0, y: 0, width: 16, height: 32 });
    assert.deepEqual(entityDrawingFrame(resident), { x: -8, y: 0, width: 32, height: 32 });
    await control('delete-entity').click();
  }
  for (let i = 0; i < npcKinds.length * 2 + 1; i++) await control('undo').click();
  await control('undo').click(); await control('undo').click();
  await control('export-world').click();
  const downloadedWorld = JSON.parse(await downloads.at(-1).blob.text());
  assert.deepEqual(downloadedWorld, JSON.parse(storage.get(savedKey)));
  await control('export-binary').click();
  assert.deepEqual(new Uint8Array(await downloads.at(-1).blob.arrayBuffer()), encodeWorld(downloadedWorld, true).bytes);
  control('file').files = [{ size: 100, text: async () => JSON.stringify(original) }];
  await control('file').dispatch('change');
  assert.deepEqual(JSON.parse(storage.get(savedKey)), original);
  await control('undo').click(); assert.equal(JSON.parse(storage.get(savedKey)).stages.length, 3);
  dispose();
  const restored = new Element(); startEditor(restored, characters)();
  assert.equal(restored.querySelectorAll('[data-stage]').length, 3);
  // Add/edit/delete connections through the actual editor and preserve undo and exports.
  storage.set(savedKey, JSON.stringify(original));
  const exitPage = new Element(), disposeExits = startEditor(exitPage, characters);
  const exitUi = name => exitPage.querySelector(`#editor-${name}`);
  await exitPage.querySelectorAll('[data-tool]').find(button => button.dataset.tool === 'exit').click();
  await exitUi('canvas').dispatch('pointerdown', { button: 0, pointerId: 1, clientX: 64, clientY: 160 }); // column 3, row 6 (1-based)
  assert.equal(JSON.parse(storage.get(savedKey)).stages[0].exits.length, 2);
  exitUi('exit-target').value = '1'; exitUi('exit-target-x').value = '7'; exitUi('exit-target-y').value = '8';
  exitUi('exit-direction').value = 'front'; await exitUi('exit-form').dispatch('submit');
  const configuredExit = JSON.parse(storage.get(savedKey)).stages[0].exits[1];
  assert.deepEqual(configuredExit, { x: 2, y: 5, targetStageId: 1, targetX: 6, targetY: 7, direction: 'front' });
  exitUi('exit-target-x').value = '32'; await exitUi('exit-form').dispatch('submit');
  assert.equal(exitUi('error').hidden, false); // outside the destination map rolls back
  assert.deepEqual(JSON.parse(storage.get(savedKey)).stages[0].exits[1], configuredExit);
  await exitUi('export-world').click(); const exitExport = JSON.parse(await downloads.at(-1).blob.text());
  assert.deepEqual(exitExport.stages[0].exits[1], configuredExit);
  await exitUi('delete-exit').click(); assert.equal(JSON.parse(storage.get(savedKey)).stages[0].exits.length, 1);
  await exitUi('undo').click(); assert.equal(JSON.parse(storage.get(savedKey)).stages[0].exits.length, 2);
  await exitUi('redo').click(); assert.equal(JSON.parse(storage.get(savedKey)).stages[0].exits.length, 1);
  await exitUi('play').click();
  const exitPlay = exitUi('play-view'), exitCanvas = exitPlay.querySelector('[data-play-canvas]');
  await exitPlay.dispatch('keydown', { key: 'ArrowDown' });
  assert.equal(exitPlay.querySelector('[data-play-stage]').textContent, '街'); assert.equal(exitCanvas.width, 13 * 16 * 4);
  tick(performance.now() + 200); // held input clears on transition
  assert.deepEqual(exitCanvas.images.at(-1).slice(5), [88, 96, 32, 32]);
  await exitPlay.dispatch('keydown', { key: 'ArrowUp' }); await window.dispatch('keyup', { key: 'ArrowUp' });
  assert.equal(exitPlay.querySelector('[data-play-stage]').textContent, '城'); assert.equal(exitCanvas.width, 7 * 16 * 4);
  assert.deepEqual(exitCanvas.images.at(-1).slice(5), [40, 64, 32, 32]);
  await exitUi('stop-play').click();
  await exitPage.querySelectorAll('[data-stage]')[1].click(); await exitUi('remove-stage').click();
  assert.equal(JSON.parse(storage.get(savedKey)).stages[0].exits.length, 0); // incoming connections removed with the map
  await exitUi('undo').click(); assert.equal(JSON.parse(storage.get(savedKey)).stages[0].exits.length, 1);
  disposeExits();
  // Configure both interaction modes and a loot item through the actual editor controls.
  const interactionWorld = parseWorld({ id: 0, name: '会話とキラキラ', width: 5, height: 6,
    spawn: { x: 16, y: 48 }, spawnAnchor: 'frame', npcAnchor: 'frame',
    floor: { default: 'grass', rectangles: [] }, entities: [
      { kind: 'resident', x: 16, y: 32, parameters: [] },
      { kind: 'loot', x: 48, y: 64, parameters: [0] },
    ] });
  storage.set(savedKey, JSON.stringify(interactionWorld));
  const interactionPage = new Element();
  const disposeInteractions = startEditor(interactionPage, characters);
  const ui = name => interactionPage.querySelector(`#editor-${name}`);
  await interactionPage.querySelectorAll('[data-entity]')[0].click();
  ui('dialogue-mode').value = 'template'; await ui('dialogue-mode').dispatch('change');
  assert.equal(ui('template-field').hidden, false); assert.equal(ui('custom-field').hidden, true);
  ui('dialogue-template').value = '0'; await ui('entity-form').dispatch('submit');
  assert.deepEqual(JSON.parse(storage.get(savedKey)).stages[0].entities[0].dialogue, { type: 'template', id: 0 });
  ui('dialogue-mode').value = 'custom'; await ui('dialogue-mode').dispatch('change');
  assert.equal(ui('template-field').hidden, true); assert.equal(ui('custom-field').hidden, false);
  const customText = 'はじめまして。\n<勇者>&😀';
  ui('dialogue-text').value = customText; await ui('dialogue-text').dispatch('input');
  assert.match(ui('dialogue-cost').textContent, new RegExp(`本文 ${new TextEncoder().encode(customText).length} / 1024 B`));
  ui('dialogue-text').value = 'あ'.repeat(342); await ui('dialogue-text').dispatch('input'); assert.match(ui('dialogue-cost').textContent, /上限超過/);
  ui('dialogue-text').value = customText; await ui('entity-form').dispatch('submit');
  assert.equal(JSON.parse(storage.get(savedKey)).stages[0].entities[0].dialogue.text, customText);
  const customCapacity = encodeWorld(parseWorld(JSON.parse(storage.get(savedKey))), true).bytes.length;
  assert.equal(ui('byte-count').textContent, `バイナリ ${customCapacity} B`);
  ui('dialogue-text').value = ''; await ui('entity-form').dispatch('submit');
  assert.equal(ui('error').hidden, false);
  assert.equal(JSON.parse(storage.get(savedKey)).stages[0].entities[0].dialogue.text, customText);
  await interactionPage.querySelectorAll('[data-entity]')[1].click();
  ui('item-id').value = '2'; await ui('entity-form').dispatch('submit');
  assert.equal(JSON.parse(storage.get(savedKey)).stages[0].entities[1].itemId, 2);
  await ui('undo').click(); assert.equal(JSON.parse(storage.get(savedKey)).stages[0].entities[1].itemId, undefined);
  await ui('redo').click();
  const configured = storage.get(savedKey);
  await ui('export-world').click(); assert.equal(JSON.parse(await downloads.at(-1).blob.text()).stages[0].entities[1].itemId, 2);
  await ui('play').click();
  const interactiveView = ui('play-view'), interactiveCanvas = interactiveView.querySelector('[data-play-canvas]');
  const message = interactiveView.querySelector('[data-play-message]');
  const messageText = interactiveView.querySelector('[data-play-text]');
  await interactiveView.dispatch('keydown', { key: 'ArrowUp' }); await window.dispatch('keyup', { key: 'ArrowUp' });
  await interactiveView.dispatch('keydown', { key: 'e' });
  assert.equal(message.hidden, false); assert.equal(messageText.textContent, customText);
  assert.equal(messageText.querySelector('img'), null); // content stays text, never HTML
  const beforeDialogueMove = interactiveCanvas.images.at(-1).slice(5);
  await interactiveView.dispatch('keydown', { key: 'ArrowRight' });
  assert.deepEqual(interactiveCanvas.images.at(-1).slice(5), beforeDialogueMove);
  await interactiveView.dispatch('keydown', { key: 'Enter', repeat: true }); assert.equal(message.hidden, false);
  await interactiveView.dispatch('keydown', { key: 'Enter' }); assert.equal(message.hidden, true);
  for (let i = 0; i < 2; i++) {
    await interactiveView.dispatch('keydown', { key: 'ArrowRight' }); await window.dispatch('keyup', { key: 'ArrowRight' });
  }
  assert.equal(messageText.textContent, 'まほうの水を手に入れた！');
  assert.equal(interactiveView.querySelector('[data-play-items]').textContent, 'まほうの水 ×1');
  await interactiveView.querySelector('[data-play-advance]').click(); assert.equal(message.hidden, true);
  for (const key of ['ArrowLeft', 'ArrowRight']) {
    await interactiveView.dispatch('keydown', { key }); await window.dispatch('keyup', { key });
  }
  assert.equal(message.hidden, true); assert.equal(interactiveView.querySelector('[data-play-items]').textContent, 'まほうの水 ×1');
  await interactiveView.querySelector('[data-play-reset]').click();
  assert.equal(interactiveView.querySelector('[data-play-items]').textContent, 'なし');
  assert.equal(storage.get(savedKey), configured);
  await ui('stop-play').click(); disposeInteractions();
  // Objects expose both message and item controls; edits survive exports and encoded gameplay.
  const objectWorld = parseWorld({ id: 0, name: '調べる', width: 10, height: 12,
    spawn: { x: 48, y: 32 }, spawnAnchor: 'frame', floor: { default: 'grass', rectangles: [] }, entities: [
      { kind: 'throne', x: 44, y: 16, parameters: [] },
      { kind: 'well', x: 96, y: 64, parameters: [] },
      { kind: 'house-red', x: 16, y: 128, parameters: [] },
    ] });
  storage.set(savedKey, JSON.stringify(objectWorld));
  const objectPage = new Element(), disposeObjects = startEditor(objectPage, characters);
  const objectUi = name => objectPage.querySelector(`#editor-${name}`);
  await objectPage.querySelectorAll('[data-entity]')[0].click();
  objectUi('dialogue-mode').value = 'custom'; await objectUi('dialogue-mode').dispatch('change');
  const objectText = '玉座の下に何かある。\n<宝物> & 😀';
  objectUi('dialogue-text').value = objectText; objectUi('item-id').value = '2';
  await objectUi('entity-form').dispatch('submit');
  const configuredObject = JSON.parse(storage.get(savedKey)).stages[0].entities[0];
  assert.equal(configuredObject.dialogue.text, objectText); assert.equal(configuredObject.itemId, 2);
  await objectUi('undo').click(); assert.equal(JSON.parse(storage.get(savedKey)).stages[0].entities[0].itemId, undefined);
  await objectUi('redo').click();
  await objectUi('export-world').click(); const objectSaved = storage.get(savedKey);
  assert.equal(JSON.parse(await downloads.at(-1).blob.text()).stages[0].entities[0].dialogue.text, objectText);
  await objectUi('export-binary').click();
  const objectBinary = new Uint8Array(await downloads.at(-1).blob.arrayBuffer());
  assert.equal(objectBinary[2], 14); assert.equal(decodeScenes(objectBinary)[0].entities[0].itemId, 2);
  await objectUi('play').click();
  const objectPlay = objectUi('play-view'), objectCanvas = objectPlay.querySelector('[data-play-canvas]');
  await objectPlay.dispatch('keydown', { key: 'ArrowUp' }); await window.dispatch('keyup', { key: 'ArrowUp' });
  const beforeObjectPlayer = objectCanvas.images.at(-1).slice(5);
  await objectPlay.querySelector('[data-play-interact]').click();
  assert.equal(objectPlay.querySelector('[data-play-text]').textContent, objectText);
  await objectPlay.querySelector('[data-play-advance]').click();
  assert.equal(objectPlay.querySelector('[data-play-text]').textContent, 'まほうの水を手に入れた！');
  await objectPlay.querySelector('[data-play-advance]').click();
  assert.equal(objectPlay.querySelector('[data-play-items]').textContent, 'まほうの水 ×1');
  await objectPlay.dispatch('keydown', { key: 'ArrowUp' }); await window.dispatch('keyup', { key: 'ArrowUp' });
  assert.deepEqual(objectCanvas.images.at(-1).slice(5), beforeObjectPlayer); // throne remains an obstacle after taking its item
  await objectPlay.querySelector('[data-play-interact]').click();
  assert.equal(objectPlay.querySelector('[data-play-text]').textContent, 'もうここには何もないようだ。');
  await objectPlay.querySelector('[data-play-advance]').click();
  assert.equal(objectPlay.querySelector('[data-play-message]').hidden, true);
  assert.equal(objectPlay.querySelector('[data-play-items]').textContent, 'まほうの水 ×1');
  await objectPlay.querySelector('[data-play-reset]').click();
  assert.equal(objectPlay.querySelector('[data-play-items]').textContent, 'なし');
  assert.equal(storage.get(savedKey), objectSaved);
  await objectUi('stop-play').click();
  await objectPage.querySelectorAll('[data-entity]')[1].click();
  objectUi('dialogue-mode').value = 'template'; objectUi('dialogue-template').value = '0'; objectUi('item-id').value = '1';
  await objectUi('entity-form').dispatch('submit');
  assert.deepEqual(JSON.parse(storage.get(savedKey)).stages[0].entities[1].dialogue, { type: 'template', id: 0 });
  await objectPage.querySelectorAll('[data-entity]')[2].click();
  assert.ok(objectUi('dialogue-mode')); assert.ok(objectUi('item-id'));
  disposeObjects();
  // New materials are placeable/configurable and the touch inspection grants the chest item once.
  const materialsWorld = parseWorld({ id: 0, name: '宝箱・魔女・妖精', width: 6, height: 6,
    spawn: { x: 16, y: 48 }, spawnAnchor: 'frame', npcAnchor: 'frame', floor: { default: 'cave-floor', rectangles: [] },
    entities: [makeEntity('treasure-chest', 16, 48, original.stages[0]),
      makeEntity('cave-witch', 48, 16, original.stages[0]), makeEntity('forest-fairy', 64, 16, original.stages[0]),
      makeEntity('demon-lord', 80, 16, original.stages[0])] });
  storage.set(savedKey, JSON.stringify(materialsWorld));
  const materialsPage = new Element(), disposeMaterials = startEditor(materialsPage, characters);
  const materialUi = id => materialsPage.querySelector(`#editor-${id}`);
  await materialsPage.querySelectorAll('[data-category]').find(button => button.dataset.category === 'object').click();
  const chestChoice = materialsPage.querySelectorAll('[data-material]').find(button => button.dataset.material === 'treasure-chest');
  assert.equal(chestChoice.querySelector('[data-footprint]').textContent, '1×1マス');
  await materialsPage.querySelectorAll('[data-entity]')[0].click();
  materialUi('item-id').value = '0'; await materialUi('entity-form').dispatch('submit');
  for (const [index, id] of [[1, 7], [2, 8], [3, 9]]) {
    await materialsPage.querySelectorAll('[data-entity]')[index].click();
    materialUi('dialogue-mode').value = 'template'; await materialUi('dialogue-mode').dispatch('change');
    materialUi('dialogue-template').value = String(id); await materialUi('entity-form').dispatch('submit');
    assert.deepEqual(JSON.parse(storage.get(savedKey)).stages[0].entities[index].dialogue, { type: 'template', id });
  }
  const materialsSaved = storage.get(savedKey);
  await materialUi('export-binary').click();
  const materialsBinary = new Uint8Array(await downloads.at(-1).blob.arrayBuffer());
  assert.equal(materialsBinary[2], 11); assert.equal(decodeScenes(materialsBinary)[0].entities[0].itemId, 0);
  await materialUi('play').click();
  const materialsPlay = materialUi('play-view');
  await materialsPlay.dispatch('keydown', { key: 'ArrowUp' }); await window.dispatch('keyup', { key: 'ArrowUp' });
  await materialsPlay.querySelector('[data-play-interact]').click();
  assert.equal(materialsPlay.querySelector('[data-play-text]').textContent, 'やくそうを手に入れた！');
  await materialsPlay.querySelector('[data-play-advance]').click();
  await materialsPlay.querySelector('[data-play-interact]').click();
  assert.equal(materialsPlay.querySelector('[data-play-text]').textContent, '宝箱は空っぽだった。');
  assert.equal(materialsPlay.querySelector('[data-play-items]').textContent, 'やくそう ×1');
  assert.equal(storage.get(savedKey), materialsSaved, 'opening the chest never modifies the editor world');
  await materialUi('stop-play').click(); disposeMaterials();
  // Trial overrides are used by the actual editor start/reset, without changing NFC/export data.
  storage.set(savedKey,JSON.stringify(parseWorld({id:0,name:'試遊',width:5,height:5,spawn:{x:16,y:16},spawnAnchor:'frame',npcAnchor:'frame',floor:{default:'grass',rectangles:[]},entities:[]})));
  const trialPage=new Element(),disposeTrial=startEditor(trialPage,characters),trialUi=name=>trialPage.querySelector(`#editor-${name}`);
  const trialSaved=storage.get(savedKey);trialUi('trial-enabled').checked=true;trialUi('trial-level').value='10';trialUi('trial-gold').value='5000';
  trialUi('trial-head').value='9';trialUi('trial-armor').value='10';trialUi('trial-weapon').value='12';
  trialPage.querySelector('[data-trial-item="0"]').value='3';
  await trialUi('play').click();assert.equal(trialUi('error').hidden,true);
  const trialView=trialUi('play-view');assert.match(trialView.querySelector('[data-play-status]').textContent,/Lv 10/);assert.match(trialView.querySelector('[data-play-status]').textContent,/5000G/);
  assert.equal(trialView.querySelector('[data-field-hp-bar]').value,535);assert.equal(trialView.querySelector('[data-field-mp-bar]').value,228);
  assert.match(trialView.querySelector('[data-play-items]').textContent,/やくそう ×3/);
  await trialView.querySelector('[data-play-reset]').click();assert.equal(trialView.querySelector('[data-field-hp-bar]').value,535);
  assert.equal(storage.get(savedKey),trialSaved);await trialUi('stop-play').click();
  trialUi('trial-level').value='0';await trialUi('play').click();assert.equal(trialUi('error').hidden,false);assert.equal(trialUi('workspace').hidden,false);
  trialUi('trial-enabled').checked=false;await trialUi('play').click();assert.equal(trialView.querySelector('[data-field-hp-bar]').value,40);
  await trialUi('stop-play').click();disposeTrial();
  // Stage encounter settings and the touch/game-window flow share the actual editor runtime.
  const encounterWorld = parseWorld({ id: 0, name: '遭遇テスト', width: 5, height: 6,
    spawn: { x: 16, y: 48 }, spawnAnchor: 'frame', npcAnchor: 'frame', floor: { default: 'grass', rectangles: [] },
    entities: [{ kind: 'king', x: 16, y: 32, parameters: [0], dialogue: { type: 'template', id: 1 } }] });
  storage.set(savedKey, JSON.stringify(encounterWorld));
  const encounterPage = new Element(), disposeEncounters = startEditor(encounterPage, characters);
  const encounterUi = name => encounterPage.querySelector(`#editor-${name}`);
  assert.equal(encounterUi('encounter-rate').disabled, true);
  encounterUi('encounter-enemy').value = 'mixed'; await encounterUi('encounter-enemy').dispatch('change');
  assert.equal(encounterUi('encounter-table').hidden,false);
  for(const [id,weight] of [[1,60],[2,30],[3,10]]) encounterPage.querySelector(`[data-encounter-weight="${id}"]`).value=String(weight);
  encounterUi('encounter-enabled').checked=true;await encounterUi('encounter-form').dispatch('submit');
  assert.deepEqual(JSON.parse(storage.get(savedKey)).stages[0].encounter.enemies,[{enemyId:1,weight:60},{enemyId:2,weight:30},{enemyId:3,weight:10}]);
  encounterPage.querySelector('[data-encounter-weight="1"]').value='256';const mixedSaved=storage.get(savedKey);
  await encounterUi('encounter-form').dispatch('submit');assert.equal(storage.get(savedKey),mixedSaved);
  await encounterUi('undo').click();

  encounterUi('encounter-enemy').value = '0'; await encounterUi('encounter-enemy').dispatch('change');
  assert.equal(encounterUi('encounter-rate').disabled, false);
  encounterUi('encounter-enabled').checked = true; encounterUi('encounter-rate').value = '100';
  await encounterUi('encounter-form').dispatch('submit');
  assert.deepEqual(JSON.parse(storage.get(savedKey)).stages[0].encounter, { enabled: true, enemyId: 0, rate: 100 });
  encounterUi('encounter-rate').value = '101'; await encounterUi('encounter-form').dispatch('submit');
  assert.equal(encounterUi('error').hidden, false);
  assert.equal(JSON.parse(storage.get(savedKey)).stages[0].encounter.rate, 100);
  await encounterUi('undo').click(); assert.equal(JSON.parse(storage.get(savedKey)).stages[0].encounter, undefined);
  await encounterUi('redo').click();
  await encounterUi('export-world').click(); assert.equal(JSON.parse(await downloads.at(-1).blob.text()).stages[0].encounter.rate, 100);
  const encounterSaved = storage.get(savedKey);
  // This fixture exercises escape/retry UI with an explicitly escapable king.
  const kingCanEscape = enemyCatalog[0].canEscape; enemyCatalog[0].canEscape = true;
  let uiDraws = 0; Math.random = () => { uiDraws++; return 0.999999; };
  await encounterUi('play').click(); assert.equal(uiDraws, 0);
  const encounterView = encounterUi('play-view'), encounterCanvas = encounterView.querySelector('[data-play-canvas]');
  const encounterMenu = encounterView.querySelector('[data-play-inventory]');
  const encounterRight = encounterView.querySelectorAll('[data-direction]').find(button => button.dataset.direction === 'right');
  encounterMenu.open = true; await encounterMenu.dispatch('toggle');
  await encounterRight.dispatch('pointerdown', { button: 0, pointerId: 1 }); await encounterRight.dispatch('pointerup');
  assert.equal(uiDraws, 0);
  await encounterView.querySelector('[data-play-close-items]').click();
  await encounterView.dispatch('keydown', { key: 'ArrowUp' }); await window.dispatch('keyup', { key: 'ArrowUp' });
  await encounterView.querySelector('[data-play-interact]').click();
  assert.match(encounterView.querySelector('[data-play-text]').textContent, /よく来た/);
  await encounterRight.dispatch('pointerdown', { button: 0, pointerId: 2 }); await encounterRight.dispatch('pointerup');
  assert.equal(uiDraws, 0); await encounterView.querySelector('[data-play-advance]').click();
  const beforeEncounter = encounterCanvas.images.length;
  await encounterRight.dispatch('pointerdown', { button: 0, pointerId: 3 });
  assert.equal(uiDraws, 1);
  const battle = encounterView.querySelector('[data-play-battle]');
  const battleCommands = battle.querySelectorAll('[data-battle-command]');
  const battleLog = battle.querySelector('[data-battle-log]');
  const battleEnemy = battle.querySelector('[data-battle-enemy]');
  const battleNext = battle.querySelector('[data-battle-next]');
  const battleSpeech = battle.querySelector('[data-battle-speech]');
  const battleSpeechText = battle.querySelector('[data-battle-speech-text]');
  const battleHpBar = battle.querySelector('[data-battle-player-hp-bar]');
  const battleHealth = battle.querySelector('[data-battle-player-health]');
  const effect = encounterView.querySelector('[data-play-encounter]');
  const effectStart = performance.now();
  assert.equal(effect.hidden, false); assert.equal(effect.dataset.phase, 'flash'); assert.equal(battle.hidden, true);
  assert.equal(encounterView.querySelector('[data-play-screen]').hidden, false);
  assert.equal(encounterView.querySelector('[data-play-controls]').inert, true);
  let effectPrevented = false;
  await encounterView.dispatch('keydown', { key: 'Enter', target: battleCommands[0], preventDefault() { effectPrevented = true; } });
  assert.equal(effectPrevented, true);
  await battleCommands[2].click(); assert.equal(battleLog.textContent, '');
  tick(effectStart + 60); assert.ok(Number(encounterView.querySelector('[data-encounter-flash]').style.opacity) > 0);
  tick(effectStart + 200); assert.equal(effect.dataset.phase, 'close'); assert.equal(battle.hidden, true);
  await window.dispatch('resize'); assert.equal(effect.dataset.phase, 'close');
  assert.equal(encounterView.querySelector('[data-play-console]').attributes['aria-busy'], 'true');
  tick(effectStart + 445); assert.equal(effect.dataset.phase, 'reveal'); assert.equal(battle.hidden, false);
  assert.equal(battle.inert, true); assert.equal(encounterView.querySelector('[data-encounter-top]').style.transform, 'scaleY(1)');
  const beforeEffectCommand = battleLog.textContent;
  await battleCommands[2].click(); assert.equal(battleLog.textContent, beforeEffectCommand);
  tick(effectStart + 800); assert.equal(effect.hidden, true); assert.equal(battle.inert, false);
  assert.equal(encounterView.querySelector('[data-play-console]').attributes['aria-busy'], 'false');
  assert.equal(battle.hidden, false); assert.match(battleLog.textContent, /王様があらわれた！/); assert.match(battleLog.textContent, /よく来た/);
  assert.equal(battleSpeech.hidden, false); assert.equal(battleSpeechText.textContent, 'よく来たのう、勇者よ。');
  assert.equal(battleHpBar.max, 40); assert.equal(battleHpBar.value, 40); assert.equal(battleHealth.dataset.health, 'normal');
  assert.equal(battle.querySelector('[data-battle-player-mp-bar]').max, 10);
  assert.equal(battle.querySelector('[data-battle-player-mp-bar]').value, 10);
  assert.equal(encounterView.querySelector('[data-play-screen]').hidden, true);
  assert.equal(encounterView.querySelector('[data-play-controls]').hidden, true);
  assert.equal(encounterView.querySelector('[data-play-message]').hidden, true);
  assert.equal(battle.querySelector('[data-battle-enemy-name]').textContent, '王様'); assert.equal(battleEnemy.disabled, true);
  assert.deepEqual(battle.querySelector('[data-battle-canvas]').images.at(-1).slice(5), [112, 64, 96, 96]);
  const battlePlayer = encounterCanvas.images.at(-1).slice(5);
  await encounterView.querySelector('[data-play-advance]').click();
  assert.equal(battle.hidden, false); // the old message button does not end the encounter
  encounterMenu.open = true; await encounterMenu.dispatch('toggle'); assert.equal(encounterMenu.open, false);
  assert.equal(encounterCanvas.images.slice(beforeEncounter).some(args => JSON.stringify(args.slice(5)) === JSON.stringify([8, 32, 32, 32])), true);
  tick(performance.now() + 200); assert.equal(uiDraws, 1); // held movement stops at the encounter
  await encounterRight.dispatch('pointerup');
  await battleCommands[2].click(); await battleNext.click();
  assert.match(battleLog.textContent, /よく来た/);
  assert.equal(battle.querySelector('[data-battle-player-hp]').textContent, 'HP 40 / 40');
  await encounterView.dispatch('keydown', { key: 'Escape' }); assert.match(battleLog.textContent, /よく来た/);
  await battleNext.click();
  await battleCommands[0].click(); assert.equal(battleEnemy.disabled, false);
  assert.equal(battleSpeech.hidden, true);
  assert.equal(battle.querySelector('[data-battle-target]').hidden, false);
  let repeatPrevented = false;
  await encounterView.dispatch('keydown', { key: 'Enter', target: battleEnemy, repeat: true, preventDefault() { repeatPrevented = true; } });
  assert.equal(repeatPrevented, true); // native buttons must also suppress a held Enter
  await encounterView.dispatch('keydown', { key: 'Enter', repeat: true });
  assert.equal(battleEnemy.disabled, false); // repeats must not attack accidentally
  await encounterView.dispatch('keydown', { key: 'Escape' }); assert.equal(battleEnemy.disabled, true);
  await battleCommands[0].click(); await battleEnemy.click();
  assert.equal(battleLog.textContent, 'ゆうしゃは王様にこうげき！\n10のダメージ！');
  assert.equal(battle.querySelector('[data-battle-damage-enemy]').textContent,'10');
  assert.equal(battle.querySelector('[data-battle-damage-enemy]').hidden,false);
  assert.equal(battleSpeech.hidden, true); assert.equal(battleSpeechText.textContent, '');
  assert.equal(battle.querySelector('[data-battle-enemy-hp]').textContent, 'HP 20 / 30');
  assert.equal(battleEnemy.disabled, true); assert.equal(battleNext.hidden, false);
  tick(performance.now() + 400); assert.equal(battleLog.textContent, 'ゆうしゃは王様にこうげき！\n10のダメージ！');
  await window.dispatch('resize'); assert.equal(battle.querySelector('[data-battle-enemy-hp]').textContent, 'HP 20 / 30');
  await battleNext.click();
  assert.match(battleLog.textContent, /何をするんじゃ！！！/);
  assert.match(battleLog.textContent, /6のダメージ/);
  assert.equal(battle.querySelector('[data-battle-player-hp]').textContent, 'HP 34 / 40');
  assert.equal(battleHpBar.value, 34); assert.equal(battleSpeech.hidden, false); assert.equal(battleSpeechText.textContent, '何をするんじゃ！！！');
  await encounterView.dispatch('keydown', { key: 'Escape' }); assert.match(battleLog.textContent, /6のダメージ/);
  await battleNext.click();
  await battleCommands[1].click(); assert.equal(battleLog.textContent, 'どうぐを持っていない。');
  assert.equal(battleSpeech.hidden, true);
  await battle.querySelector('[data-battle-back]').click();
  await battleCommands[2].click(); assert.equal(battleLog.textContent, 'ゆうしゃは身をまもっている。');
  assert.equal(battle.querySelector('[data-battle-enemy-hp]').textContent, 'HP 20 / 30');
  await battleNext.click();
  assert.match(battleLog.textContent, /4のダメージ/); // stronger 9-damage light attack reduced by guard
  assert.equal(battle.querySelector('[data-battle-player-hp]').textContent, 'HP 30 / 40');
  assert.equal(battleSpeechText.textContent, '無礼者め！'); assert.equal(battleSpeech.hidden, false);
  await battleNext.click();
  await encounterView.dispatch('keydown', { key: 'ArrowLeft' });
  assert.equal(battleCommands[1].dataset.selected, 'true'); // keyboard command navigation
  await encounterView.dispatch('keydown', { key: 'ArrowDown' });
  assert.equal(battleCommands[3].dataset.selected, 'true');
  await encounterView.dispatch('keydown', { key: 'e' });
  assert.equal(battleLog.textContent, 'ゆうしゃはにげだした！');
  assert.deepEqual(encounterCanvas.images.at(-1).slice(5), battlePlayer); // command arrows never walk
  assert.equal(uiDraws, 1); assert.equal(battleNext.textContent, 'フィールドに戻る');
  await battleNext.click();
  assert.equal(battle.hidden, true); assert.equal(encounterView.querySelector('[data-play-screen]').hidden, false);
  assert.equal(encounterView.querySelector('[data-play-controls]').hidden, false);
  assert.equal(encounterCanvas.images.slice(-2).some(args => JSON.stringify(args.slice(5)) === JSON.stringify([8, 32, 32, 32])), true); // escape leaves king visible
  await encounterRight.dispatch('pointerdown', { button: 0, pointerId: 4 }); await encounterRight.dispatch('pointerup');
  assert.equal(uiDraws, 2); assert.equal(storage.get(savedKey), encounterSaved);
  assert.equal(effect.hidden, false); tick(performance.now() + 800); assert.equal(effect.hidden, true);
  assert.equal(battle.querySelector('[data-battle-enemy-hp]').textContent, 'HP 30 / 30'); // a fresh battle after escape
  assert.equal(battle.querySelector('[data-battle-player-hp]').textContent, 'HP 30 / 40'); // hero damage is retained
  assert.match(battleLog.textContent, /何をするんじゃ！！！/); // king stays angry
  for (const hp of [20, 10, 0]) {
    await battleCommands[0].click(); await battleEnemy.click();
    assert.equal(battle.querySelector('[data-battle-enemy-hp]').textContent, `HP ${hp} / 30`);
    if (hp) { await battleNext.click(); assert.match(battleLog.textContent, /のダメージ/); await battleNext.click(); }
  }
  assert.match(battleLog.textContent, /王様をたおした！/);
  assert.equal(battleEnemy.hidden, true);
  await encounterView.dispatch('keydown', { key: 'Escape' }); // a victory cannot be cancelled into another attack/escape
  assert.match(battleLog.textContent, /たおした/);
  const beforeVictoryReturn = encounterCanvas.images.length;
  await battleNext.click(); assert.equal(battle.hidden, true);
  assert.equal(encounterCanvas.images.slice(beforeVictoryReturn).some(args => JSON.stringify(args.slice(5)) === JSON.stringify([8, 32, 32, 32])), false);
  assert.equal(encounterCanvas.images.at(-1)[0], characters.kings.right.image, 'victory draws the king in the retained walking direction');
  assert.equal(encounterView.querySelector('[data-field-hp]').textContent, 'HP 535 / 535');
  assert.equal(encounterView.querySelector('[data-field-mp]').textContent, 'MP 228 / 228');
  assert.equal(encounterView.querySelector('[data-field-hp-bar]').value, 535);
  assert.equal(encounterView.querySelector('[data-field-mp-bar]').value, 228);
  await encounterRight.dispatch('pointerdown', { button: 0, pointerId: 6 }); await encounterRight.dispatch('pointerup');
  assert.equal(uiDraws, 2); // victory prevents any more encounter draws
  await encounterView.querySelector('[data-play-reset]').click();
  assert.equal(encounterCanvas.images.at(-1)[0], character.image, 'reset restores the hero sprite');
  await encounterRight.dispatch('pointerdown', { button: 0, pointerId: 5 }); await encounterRight.dispatch('pointerup');
  assert.equal(uiDraws, 3);
  tick(performance.now() + 800);
  assert.equal(battle.querySelector('[data-battle-player-hp]').textContent, 'HP 40 / 40');
  assert.match(battleLog.textContent, /よく来た/);
  await battleCommands[0].click(); await battleEnemy.click(); await battleNext.click(); await battleNext.click();
  for (let turn = 0; turn < 20; turn++) {
    await battleCommands[2].click(); await battleNext.click();
    if (battleNext.textContent === '復活する') break;
    await battleNext.click();
  }
  assert.equal(battleNext.textContent, '復活する');
  assert.equal(battle.querySelector('[data-battle-player-hp]').textContent, 'HP 0 / 40');
  assert.equal(battleHpBar.value, 0); assert.equal(battleHealth.dataset.health, 'danger');
  await encounterView.dispatch('keydown', { key: 'Escape' }); assert.equal(battleNext.textContent, '復活する');
  await battleNext.click(); assert.equal(battle.hidden, true);
  assert.deepEqual(encounterCanvas.images.at(-1).slice(5), [8, 48, 32, 32]); // same stage's original spawn
  assert.match(encounterView.querySelector('[data-play-text]').textContent, /50Gを失った.*残り50G/);
  await encounterView.querySelector('[data-play-advance]').click();
  await encounterRight.dispatch('pointerdown', { button: 0, pointerId: 7 }); await encounterRight.dispatch('pointerup');
  tick(performance.now() + 800);
  assert.equal(uiDraws, 4); assert.equal(battle.querySelector('[data-battle-player-hp]').textContent, 'HP 40 / 40');
  assert.equal(battleHpBar.value, 40); assert.equal(battleHealth.dataset.health, 'normal');
  assert.match(battleLog.textContent, /何をするんじゃ！！！/);
  await encounterUi('stop-play').click();
  assert.equal(battle.hidden, true);
  // Reset/stop cancel an unfinished effect; a paused tab cannot skip it or advance combat.
  await encounterUi('play').click();
  await encounterRight.dispatch('pointerdown', { button: 0, pointerId: 8 }); await encounterRight.dispatch('pointerup');
  assert.equal(effect.hidden, false);
  document.hidden = true; await document.dispatch('visibilitychange'); tick(performance.now() + 10000);
  document.hidden = false; await document.dispatch('visibilitychange'); tick(performance.now() + 11000);
  assert.equal(effect.dataset.phase, 'flash'); assert.equal(battle.hidden, true);
  await encounterView.querySelector('[data-play-reset]').click(); assert.equal(effect.hidden, true);
  assert.equal(encounterView.querySelector('[data-play-controls]').inert, false);
  await encounterRight.dispatch('pointerdown', { button: 0, pointerId: 9 }); await encounterRight.dispatch('pointerup');
  assert.equal(effect.hidden, false); await encounterUi('stop-play').click();
  assert.equal(effect.hidden, true); tick(performance.now() + 20000); assert.equal(battle.hidden, true);
  // Reduced motion uses a short fade without the bright flash or moving shutters.
  window.matchMedia = query => ({ matches: query === '(prefers-reduced-motion: reduce)' });
  await encounterUi('play').click();
  await encounterRight.dispatch('pointerdown', { button: 0, pointerId: 10 }); await encounterRight.dispatch('pointerup');
  const reducedStart = performance.now();
  tick(reducedStart + 80); assert.equal(effect.dataset.phase, 'close'); assert.equal(battle.hidden, true);
  assert.equal(encounterView.querySelector('[data-encounter-flash]').style.opacity, '0');
  assert.equal(encounterView.querySelector('[data-encounter-top]').style.transform, 'scaleY(1)');
  assert.ok(Number(effect.style.opacity) > 0 && Number(effect.style.opacity) < 1);
  tick(reducedStart + 165); assert.equal(effect.dataset.phase, 'reveal'); assert.equal(battle.hidden, false);
  tick(reducedStart + 330); assert.equal(effect.hidden, true);
  await encounterUi('stop-play').click(); delete window.matchMedia;
  encounterUi('encounter-enemy').value = ''; await encounterUi('encounter-form').dispatch('submit');
  assert.equal(JSON.parse(storage.get(savedKey)).stages[0].encounter, undefined);
  disposeEncounters(); Math.random = () => 0.999999;
  // Battle inventory is read-only until item effects exist; inactive controls cannot act.
  const { mountBattleView } = await import(pathToFileURL(join(temporary, 'battle.mjs')).href);
  const battleRoot = new Element(); let battleActive = true, escaped = 0;
  const battleView = mountBattleView(battleRoot, character, () => battleActive, () => escaped++);
  const event = { enemyId: 0, name: '王様', stageId: 0 }, owned = [{ itemId: 0, count: 2 }];
  battleView.sync(event, owned);
  const ownedCommands = battleRoot.querySelectorAll('[data-battle-command]');
  await ownedCommands[1].click(); assert.equal(battleRoot.querySelector('[data-battle-items]').textContent, 'やくそう ×2');
  battleView.sync(event, owned); assert.equal(battleRoot.querySelector('[data-battle-items]').hidden, false);
  assert.deepEqual(owned, [{ itemId: 0, count: 2 }]);
  await battleRoot.querySelector('[data-battle-back]').click();
  battleActive = false; await ownedCommands[3].click(); assert.equal(escaped, 0);
  assert.equal(battleRoot.querySelector('[data-battle-commands]').hidden, false);
  battleActive = true; await ownedCommands[3].click(); await battleRoot.querySelector('[data-battle-next]').click();
  assert.equal(escaped, 1); battleView.sync(null, []); assert.equal(battleRoot.hidden, true);
  enemyCatalog[0].canEscape = kingCanEscape;
  // Actual menu buttons connect merchant purchases, selling, equipment and status.
  const economyFixture = parseWorld([{ id: 0, name: '買い物', width: 10, height: 7, spawn: { x: 16, y: 48 }, spawnAnchor: 'frame', npcAnchor: 'frame',
    floor: { default: 'grass', rectangles: [] }, entities: [
      { kind: 'item-merchant', x: 16, y: 32, parameters: [] },
      { kind: 'weapon-merchant', x: 64, y: 32, parameters: [] },
      { kind: 'armor-merchant', x: 112, y: 32, parameters: [] },
    ] }]);
  storage.set(savedKey, JSON.stringify(economyFixture));
  const economyPage = new Element(), disposeEconomy = startEditor(economyPage, characters);
  const economyControl = id => economyPage.querySelector(`#editor-${id}`);
  await economyControl('play').click();
  const economyView = economyControl('play-view'), shopWindow = economyView.querySelector('[data-play-shop]');
  const pocket = economyView.querySelector('[data-play-inventory]');
  const pocketWindow = economyView.querySelector('[data-play-inventory-window]');
  const menuAction = (root, action, id) => root.querySelectorAll('[data-menu-action]').find(button => button.dataset.menuAction === action && Number(button.dataset.menuItem) === id);
  async function economyMove(key) { await economyView.dispatch('keydown', { key }); await window.dispatch('keyup', { key }); }
  async function talkShop() { await economyMove('ArrowUp'); await economyView.querySelector('[data-play-interact]').click(); await economyView.querySelector('[data-play-advance]').click(); }
  await talkShop(); assert.equal(shopWindow.hidden, false); assert.equal(shopWindow.querySelector('[data-menu-title]').textContent, '道具屋');
  assert.equal(economyView.querySelector('[data-play-controls]').inert, true);
  const beforeShopMove = economyView.querySelector('[data-play-canvas]').images.at(-1).slice(5);
  await economyMove('ArrowRight'); assert.deepEqual(economyView.querySelector('[data-play-canvas]').images.at(-1).slice(5), beforeShopMove);
  assert.equal(shopWindow.querySelectorAll('[data-player-tab]').find(button => button.dataset.playerTab === 'sell').attributes['aria-pressed'], 'true');
  await economyMove('ArrowLeft');
  assert.match(shopWindow.querySelector('[data-player-list]').innerHTML, /やくそう.*所持 0個/);
  await menuAction(shopWindow, 'buy', 0).click(); await menuAction(shopWindow, 'buy', 0).click();
  assert.match(shopWindow.querySelector('[data-player-list]').innerHTML, /やくそう.*所持 2個/);
  assert.match(shopWindow.querySelector('[data-player-stats]').textContent, /84G/);
  await shopWindow.querySelectorAll('[data-player-tab]').find(button => button.dataset.playerTab === 'sell').click();
  await menuAction(shopWindow, 'sell', 0).click(); assert.match(shopWindow.querySelector('[data-player-stats]').textContent, /88G/);
  await shopWindow.querySelectorAll('[data-player-tab]').find(button => button.dataset.playerTab === 'buy').click();
  assert.match(shopWindow.querySelector('[data-player-list]').innerHTML, /やくそう.*所持 1個/);
  await shopWindow.querySelector('[data-shop-close]').click(); assert.equal(shopWindow.hidden, true);
  pocket.open = true; await pocket.dispatch('toggle'); assert.equal(pocketWindow.querySelector('[data-play-items]').textContent, 'やくそう ×1');
  await menuAction(pocketWindow, 'use', 0).click(); assert.match(pocketWindow.querySelector('[data-player-feedback]').textContent, /必要がない/);
  assert.equal(pocketWindow.querySelector('[data-play-items]').textContent, 'やくそう ×1');
  await pocketWindow.querySelector('[data-play-close-items]').click();
  for (let i = 0; i < 3; i++) await economyMove('ArrowRight'); await talkShop();
  assert.equal(shopWindow.querySelector('[data-menu-title]').textContent, '武器屋');
  await menuAction(shopWindow, 'buy', 3).click(); await shopWindow.querySelector('[data-shop-close]').click();
  pocket.open = true; await pocket.dispatch('toggle');
  await pocketWindow.querySelectorAll('[data-player-tab]').find(button => button.dataset.playerTab === 'equipment').click();
  await menuAction(pocketWindow, 'equip', 3).click(); assert.match(pocketWindow.querySelector('[data-player-stats]').textContent, /攻撃力 13/);
  await pocketWindow.querySelector('[data-play-close-items]').click();
  for (let i = 0; i < 3; i++) await economyMove('ArrowRight'); await talkShop();
  assert.equal(shopWindow.querySelector('[data-menu-title]').textContent, '防具屋');
  await menuAction(shopWindow, 'buy', 5).click();
  await shopWindow.querySelectorAll('[data-player-tab]').find(button => button.dataset.playerTab === 'sell').click();
  await menuAction(shopWindow, 'sell', 3).click(); assert.match(shopWindow.querySelector('[data-player-feedback]').textContent, /装備を外して/);
  assert.match(shopWindow.querySelector('[data-player-stats]').textContent, /48G/);
  await economyView.dispatch('keydown', { key: 'Escape' }); assert.equal(shopWindow.hidden, true);
  pocket.open = true; await pocket.dispatch('toggle'); await menuAction(pocketWindow, 'equip', 5).click();
  assert.match(pocketWindow.querySelector('[data-player-stats]').textContent, /防御力 2/);
  await pocketWindow.querySelectorAll('[data-player-tab]').find(button => button.dataset.playerTab === 'status').click();
  await pocketWindow.querySelectorAll('[data-player-tab]').find(button => button.dataset.playerTab === 'collection').click();
  assert.equal(pocketWindow.querySelector('[data-menu-title]').textContent, 'アイテムずかん');
  assert.match(pocketWindow.querySelector('[data-player-list]').innerHTML, /やくそう|木の剣|布の服/);
  assert.doesNotMatch(pocketWindow.querySelector('[data-player-list]').innerHTML, /王の王冠|王のローブ|王の剣|王の杖/);
  assert.match(pocketWindow.querySelector('[data-player-list]').innerHTML, /未入手/);
  await pocketWindow.querySelectorAll('[data-player-tab]').find(button => button.dataset.playerTab === 'status').click();
  assert.equal(pocketWindow.querySelector('[data-menu-title]').textContent, 'つよさ');
  assert.match(pocketWindow.querySelector('[data-player-stats]').textContent, /攻撃力 13　防御力 2/);
  assert.match(pocketWindow.querySelector('[data-player-stats]').textContent, /Lv 1/);
  assert.match(pocketWindow.querySelector('[data-player-stats]').textContent, /経験値 0　次まで 20/);
  await pocketWindow.querySelector('[data-play-close-items]').click(); await economyView.querySelector('[data-play-reset]').click();
  assert.match(economyView.querySelector('[data-play-status]').textContent, /100G/);
  assert.equal(economyView.querySelector('[data-field-hp-bar]').value, 40);
  assert.equal(economyView.querySelector('[data-field-mp-bar]').value, 10);
  assert.equal(pocketWindow.querySelector('[data-menu-mp-bar]').value, 10);
  assert.equal(pocketWindow.querySelector('[data-play-items]').textContent, 'なし');
  await economyControl('stop-play').click(); disposeEconomy();
  // Keyboard tabs, empty lists, native button focus and changing item counts.
  {
    const { mountPlayerMenus } = await import(pathToFileURL(join(temporary, 'playerMenus.mjs')).href);
    const menuScene = { id: 0, width: 6, height: 6, spawn: { x: 16, y: 32 }, tiles: new Uint8Array(36).fill(7), entities: [] };
    const emptyMenuGame = createWorldGame([menuScene], 0, () => 0, { player: { ...playerConfig, skills: [], initialItems: [] } });
    const menuRoot = new Element(), shopRoot = new Element();
    let selectedGame = emptyMenuGame, closed = 0, enabled = true, focused;
    const originalFocus = Element.prototype.focus;
    Element.prototype.focus = function () { focused = this; };
    const menus = mountPlayerMenus(menuRoot, shopRoot, () => selectedGame, () => enabled, () => menus.sync(), () => closed++);
    const key = (name, extra = {}) => menus.keydown({ key: name, preventDefault() {}, ...extra });
    try {
      menus.sync();
      key('ArrowRight'); assert.equal(menuRoot.querySelector('[data-menu-title]').textContent, 'まほう');
      key('ArrowRight'); assert.equal(menuRoot.querySelector('[data-menu-title]').textContent, 'そうび');
      key('ArrowRight'); assert.equal(menuRoot.querySelector('[data-menu-title]').textContent, 'つよさ');
      assert.equal(menuRoot.querySelectorAll('[data-menu-action]').length, 0);
      assert.equal(focused, menuRoot.querySelector('[data-play-close-items]'));
      key('ArrowDown'); key('Enter'); assert.equal(closed, 1);
      key('ArrowRight'); assert.equal(menuRoot.querySelector('[data-menu-title]').textContent, 'アイテムずかん');
      assert.equal(focused, menuRoot.querySelector('[data-play-close-items]'), 'collection without actions remains keyboard-accessible');
      key('ArrowRight'); assert.equal(menuRoot.querySelector('[data-menu-title]').textContent, 'どうぐ', 'tabs wrap');
      key('ArrowLeft'); assert.equal(menuRoot.querySelector('[data-menu-title]').textContent, 'アイテムずかん');
      key('ArrowLeft', { repeat: true }); assert.equal(menuRoot.querySelector('[data-menu-title]').textContent, 'アイテムずかん');
      key('Escape'); assert.equal(closed, 2);
      const nativeTab = menuRoot.querySelectorAll('[data-player-tab]').find(button => button.dataset.playerTab === 'items');
      key('Enter', { target: nativeTab }); assert.equal(menuRoot.querySelector('[data-menu-title]').textContent, 'どうぐ');
      key(' ', { target: menuRoot.querySelector('[data-play-close-items]') }); assert.equal(closed, 3);
      enabled = false; key('ArrowRight'); key('Escape'); assert.equal(closed, 3);
      assert.equal(menuRoot.querySelector('[data-menu-title]').textContent, 'どうぐ'); enabled = true;

      selectedGame = createWorldGame([{ ...menuScene, encounter: { enabled: true, rate: 100, enemyId: 1 } }], 0, () => 0,
        { player: { ...playerConfig, initialItems: [{ itemId: 0, quantity: 1 }, { itemId: 2, quantity: 1 }] } });
      selectedGame.move('right'); selectedGame.battle.useSkill(1); selectedGame.battle.advance(); selectedGame.battle.advance();
      selectedGame.battle.escape(); selectedGame.finishEncounter('escape');
      menus.reset(); menus.sync(); key('ArrowDown'); key('E');
      assert.equal(selectedGame.status.mp, 10); assert.deepEqual(selectedGame.inventory, [{ itemId: 0, count: 1 }]);
      assert.equal(focused, menuRoot.querySelector('[data-play-close-items]'), 'a removed final entry now selects a valid close button');
      key('ArrowUp'); key('e'); assert.equal(selectedGame.status.hp, 40); assert.deepEqual(selectedGame.inventory, []);
      assert.equal(focused, menuRoot.querySelector('[data-play-close-items]')); key('e'); assert.equal(closed, 4);

      selectedGame = createWorldGame([{ ...menuScene, entities: [{ kind: 'item-merchant', x: 16, y: 0, parameters: [] }] }], 0);
      selectedGame.move('back'); selectedGame.interact(); selectedGame.interact(); assert.ok(selectedGame.shop);
      menus.reset(); menus.sync(); assert.equal(shopRoot.hidden, false);
      key('ArrowRight'); assert.equal(shopRoot.querySelectorAll('[data-player-tab]').find(button => button.dataset.playerTab === 'sell').attributes['aria-pressed'], 'true');
      assert.equal(focused, shopRoot.querySelector('[data-shop-close]'));
      key('Enter'); assert.equal(selectedGame.shop, null); assert.equal(shopRoot.hidden, true);
      selectedGame.interact(); selectedGame.interact(); menus.sync(); assert.ok(selectedGame.shop);
      key('Escape'); assert.equal(selectedGame.shop, null);
      selectedGame = createWorldGame([{ ...menuScene, entities: [{ kind: 'weapon-merchant', x: 16, y: 0, parameters: [] }] }], 0, undefined,
        { player: { ...playerConfig, initialItems: [{ itemId: 3, quantity: 2 }] } });
      assert.equal(selectedGame.equip(3).ok, true);
      selectedGame.move('back'); selectedGame.interact(); selectedGame.interact(); menus.reset(); menus.sync();
      assert.match(shopRoot.querySelector('[data-player-list]').innerHTML, /木の剣.*所持 2個（装備中）/);
      assert.equal(selectedGame.sell(3).ok, true); menus.sync();
      assert.match(shopRoot.querySelector('[data-player-list]').innerHTML, /木の剣.*所持 1個（装備中）/);
      key('Escape'); assert.equal(selectedGame.unequip('weapon').ok, true);
      selectedGame.interact(); selectedGame.interact(); menus.reset(); menus.sync();
      assert.match(shopRoot.querySelector('[data-player-list]').innerHTML, /木の剣.*所持 1個<small>/);
      key('Escape');
      // Material exchange uses the same touch/keyboard shop menu and collection.
      selectedGame = createWorldGame([{ ...menuScene, entities: [{ kind: 'item-merchant', x: 16, y: 0, parameters: [] }] }], 0, undefined,
        { player: { ...playerConfig, initialItems: [{ itemId: 13, quantity: 2 }] } });
      selectedGame.move('back'); selectedGame.interact(); selectedGame.interact(); menus.reset(); menus.sync();
      key('ArrowRight'); key('ArrowRight');
      assert.equal(shopRoot.querySelectorAll('[data-player-tab]').find(button => button.dataset.playerTab === 'exchange').attributes['aria-pressed'], 'true');
      assert.match(shopRoot.querySelector('[data-player-list]').innerHTML, /上やくそう.*若葉のしずく 2\/2個.*4G/);
      const beforeDisabled = selectedGame.inventory; enabled = false;
      await menuAction(shopRoot, 'exchange', 0).click(); assert.deepEqual(selectedGame.inventory, beforeDisabled); enabled = true;
      key('Enter');
      assert.deepEqual(selectedGame.inventory, [{ itemId: 19, count: 1 }]); assert.equal(selectedGame.status.gold, 96);
      assert.match(shopRoot.querySelector('[data-player-feedback]').textContent, /上やくそうを1個手に入れた/);
      assert.match(shopRoot.querySelector('[data-player-list]').innerHTML, /若葉のしずく 0\/2個/);
      await menuAction(shopRoot, 'exchange', 0).click(); assert.match(shopRoot.querySelector('[data-player-feedback]').textContent, /2個足りない/);
      assert.equal(selectedGame.status.gold, 96); key('Escape');
      await menuRoot.querySelectorAll('[data-player-tab]').find(button => button.dataset.playerTab === 'collection').click();
      assert.match(menuRoot.querySelector('[data-player-list]').innerHTML, /上やくそう/);
      assert.match(menuRoot.querySelector('[data-player-list]').innerHTML, /若葉のしずく.*所持 0個/);
    } finally { Element.prototype.focus = originalFocus; }
  }
  // The shared play UI displays growth and learning after the victory return.
  const { findSkill } = await import(pathToFileURL(join(temporary, 'skills.mjs')).href);
  // Royal items are selectable in the real phone menu, including the new head slot and HP/MP bars.
  const royalMenuFixture = parseWorld({ id: 0, name: '王の装備', width: 5, height: 6,
    spawn: { x: 16, y: 48 }, spawnAnchor: 'frame', npcAnchor: 'frame', floor: { default: 'grass', rectangles: [] },
    entities: [9, 10, 11, 12].map(itemId => ({ kind: 'loot', x: 16, y: 64, parameters: [0], itemId })) });
  storage.set(savedKey, JSON.stringify(royalMenuFixture));
  const royalMenuPage = new Element(), disposeRoyalMenu = startEditor(royalMenuPage, characters);
  await royalMenuPage.querySelector('#editor-play').click();
  const royalView = royalMenuPage.querySelector('#editor-play-view');
  const royalCanvas = royalView.querySelector('[data-play-canvas]');
  for (let i = 0; i < 4; i++) await royalView.querySelector('[data-play-advance]').click();
  const royalPocket = royalView.querySelector('[data-play-inventory]');
  royalPocket.open = true; await royalPocket.dispatch('toggle');
  const royalWindow = royalView.querySelector('[data-play-inventory-window]');
  await royalWindow.querySelectorAll('[data-player-tab]').find(button => button.dataset.playerTab === 'equipment').click();
  for (const id of [9, 10, 11]) {
    await menuAction(royalWindow, 'equip', id).click();
    assert.equal(royalCanvas.images.at(-1)[0], id === 11 ? characters.kings.front.image : character.image);
  }
  assert.deepEqual(royalCanvas.images.at(-1).slice(5), [8, 48, 32, 32], 'appearance preserves the player drawing size and center');
  assert.equal(royalWindow.querySelector('[data-menu-hp]').textContent, 'HP 40 / 440');
  assert.equal(royalWindow.querySelector('[data-menu-mp]').textContent, 'MP 10 / 360');
  assert.match(royalWindow.querySelector('[data-player-stats]').textContent, /攻撃力 260.*防御力 250/);
  await menuAction(royalWindow, 'equip', 12).click();
  assert.equal(royalCanvas.images.at(-1)[0], characters.kings.front.image);
  assert.equal(royalWindow.querySelector('[data-menu-hp-bar]').max, 490);
  assert.equal(royalWindow.querySelector('[data-menu-mp-bar]').max, 210);
  assert.match(royalWindow.querySelector('[data-player-stats]').textContent, /攻撃力 310.*防御力 250/);
  const removeCrown = royalWindow.querySelectorAll('[data-menu-action]').find(button => button.dataset.menuAction === 'unequip' && button.dataset.menuSlot === 'head');
  assert.ok(removeCrown); await removeCrown.click();
  assert.equal(royalCanvas.images.at(-1)[0], character.image);
  assert.equal(royalWindow.querySelector('[data-menu-hp-bar]').max, 390);
  assert.equal(royalWindow.querySelector('[data-menu-mp-bar]').max, 110);
  await royalView.querySelector('[data-play-close-items]').click();
  // Re-equip the set, then walk all four ways. Only appearance changes, not placement or collision.
  royalPocket.open = true; await royalPocket.dispatch('toggle');
  await royalWindow.querySelectorAll('[data-player-tab]').find(button => button.dataset.playerTab === 'equipment').click();
  await menuAction(royalWindow, 'equip', 9).click();
  await royalView.querySelector('[data-play-close-items]').click();
  for (const [key, direction, position] of [
    ['ArrowUp', 'back', [8, 32, 32, 32]], ['ArrowRight', 'right', [24, 32, 32, 32]],
    ['ArrowDown', 'front', [24, 48, 32, 32]], ['ArrowLeft', 'left', [8, 48, 32, 32]],
  ]) {
    await royalView.dispatch('keydown', { key }); await royalView.dispatch('keyup', { key });
    assert.equal(royalCanvas.images.at(-1)[0], characters.kings[direction].image);
    assert.deepEqual(royalCanvas.images.at(-1).slice(5), position);
  }
  royalPocket.open = true; await royalPocket.dispatch('toggle');
  await royalWindow.querySelectorAll('[data-menu-action]').find(button => button.dataset.menuAction === 'unequip' && button.dataset.menuSlot === 'head').click();
  assert.equal(royalCanvas.images.at(-1)[0], characters.players.left.image);
  assert.deepEqual(royalCanvas.images.at(-1).slice(1, 5), [0, 64, 64, 64], 'unequipping restores the hero facing the same way');
  await royalMenuPage.querySelector('#editor-stop-play').click(); disposeRoyalMenu();
  const priorReward = enemyCatalog[0].reward, priorLearnLevel = findSkill(1).learnLevel;
  try {
    enemyCatalog[0].reward = { gold: 0, experience: 60, items: [] }; findSkill(1).learnLevel = 3;
    const growthFixture = parseWorld({ id: 0, name: '成長テスト', width: 5, height: 6,
      spawn: { x: 16, y: 48 }, spawnAnchor: 'frame', npcAnchor: 'frame', floor: { default: 'grass', rectangles: [] },
      entities: [], encounter: { enabled: true, rate: 100, enemyId: 0 } });
    storage.set(savedKey, JSON.stringify(growthFixture));
    const growthPage = new Element(), disposeGrowth = startEditor(growthPage, characters);
    await growthPage.querySelector('#editor-play').click();
    const view = growthPage.querySelector('#editor-play-view'), fight = view.querySelector('[data-play-battle]');
    await view.dispatch('keydown', { key: 'ArrowRight' }); await window.dispatch('keyup', { key: 'ArrowRight' });
    tick(performance.now() + 800);
    assert.match(fight.querySelector('[data-battle-player-name]').textContent, /Lv 1/);
    await fight.querySelectorAll('[data-battle-command]').find(b => b.dataset.battleCommand === 'spells').click();
    assert.equal(fight.querySelectorAll('[data-battle-skill]').some(b => b.dataset.battleSkill === '1'), false);
    await fight.querySelector('[data-battle-back]').click();
    for (let index = 0; index < 3; index++) {
      await fight.querySelectorAll('[data-battle-command]')[0].click(); await fight.querySelector('[data-battle-enemy]').click();
      if (index < 2) { await fight.querySelector('[data-battle-next]').click(); await fight.querySelector('[data-battle-next]').click(); }
    }
    await fight.querySelector('[data-battle-next]').click();
    assert.equal(fight.hidden, true); assert.match(view.querySelector('[data-play-text]').textContent, /レベル3/);
    assert.match(view.querySelector('[data-play-text]').textContent, /火の玉を覚えた/);
    assert.match(view.querySelector('[data-play-status]').textContent, /Lv 3/);
    assert.equal(view.querySelector('[data-field-hp-bar]').max, 50);
    assert.equal(view.querySelector('[data-field-mp-bar]').max, 14);
    await view.querySelector('[data-play-advance]').click();
    const growthPocket = view.querySelector('[data-play-inventory]'); growthPocket.open = true; await growthPocket.dispatch('toggle');
    assert.match(view.querySelector('[data-player-stats]').textContent, /経験値 60　次まで 60/);
    await growthPage.querySelector('#editor-stop-play').click(); disposeGrowth();
  } finally { enemyCatalog[0].reward = priorReward; findSkill(1).learnLevel = priorLearnLevel; }
  const illustrations = Object.fromEntries(enemyCatalog.filter(enemy => enemy.battleImage).map(enemy => [enemy.battleImage,
    { name: enemy.battleImage, naturalWidth: enemy.id === 3 ? 1280 : 1024, naturalHeight: 1024 }]));
  const { enemyPixelSprites } = await import(pathToFileURL(join(temporary, 'enemyPixels.mjs')).href);
  for (const monster of enemyCatalog.filter(enemy => enemy.battleImage)) {
    const sprite = enemyPixelSprites[monster.battleImage];
    assert.ok(sprite); assert.ok(sprite.palette.length <= 16);
    assert.equal(sprite.pixels.length, sprite.height);
    assert.ok(sprite.pixels.every(row => row.length === sprite.width && [...row].every(code => code === '.' || parseInt(code, 36) < sprite.palette.length)));
    assert.ok(sprite.palette.every(color => /^#[a-f\d]{6}$/i.test(color)));
    const count = sprite.pixels.join('').replaceAll('.', '').length;
    assert.ok(count > sprite.width * sprite.height * 0.2); assert.ok(count < sprite.width * sprite.height * 0.8);
    storage.set(savedKey, JSON.stringify(parseWorld({ id: 0, name: '野外の遭遇', width: 5, height: 6,
      spawn: { x: 16, y: 48 }, spawnAnchor: 'frame', npcAnchor: 'frame', floor: { default: 'grass', rectangles: [] },
      entities: monster.id === 2 ? [{ kind: 'loot', x: 16, y: 64, parameters: [0], itemId: 1 }] : [], encounter: { enabled: true, rate: 100, enemyId: monster.id } })));
    const monsterPage = new Element(), disposeMonster = startEditor(monsterPage, { ...characters, enemyIllustrations: illustrations });
    assert.ok(monsterPage.querySelector('#editor-encounter-enemy').querySelectorAll('option').some(option => option.value === String(monster.id)));
    await monsterPage.querySelector('#editor-play').click();
    const view = monsterPage.querySelector('#editor-play-view'), fight = view.querySelector('[data-play-battle]');
    if (monster.id === 2) await view.querySelector('[data-play-advance]').click();
    await view.dispatch('keydown', { key: 'ArrowRight' }); await window.dispatch('keyup', { key: 'ArrowRight' }); tick(performance.now() + 800);
    assert.equal(fight.querySelector('[data-battle-enemy-name]').textContent, monster.name);
    assert.equal(fight.querySelector('[data-battle-art]').dataset.illustrated, 'false');
    assert.equal(fight.querySelector('[data-battle-art]').dataset.monster, 'true');
    const picture = fight.querySelector('[data-battle-canvas]'); assert.equal(picture.width, 320); assert.equal(picture.height, 192);
    assert.equal(picture.images.length, 0); // pixels take priority even when original reference images are supplied
    const shadows = picture.fills.slice(-count - 2, -count);
    assert.equal(shadows.length, 2);
    for (const shadow of shadows) {
      assert.equal(shadow.color, '#263f33');
      assert.ok(Math.abs(shadow.x + shadow.width / 2 - 160) <= 0.5, 'the shadow is centered');
      assert.ok(shadow.width >= sprite.width * 2 * 0.55 && shadow.width <= sprite.width * 2, 'the shadow follows the drawn monster width');
    }
    const dots = picture.fills.slice(-count), x = (320 - sprite.width * 2) / 2, y = 176 - sprite.height * 2;
    assert.equal(dots.length, count);
    assert.ok(dots.every(dot => dot.width === 2 && dot.height === 2 && Number.isInteger(dot.x) && Number.isInteger(dot.y)
      && dot.x >= x && dot.x < x + sprite.width * 2 && dot.y >= y && dot.y < 176 && sprite.palette.includes(dot.color)));
    await fight.querySelectorAll('[data-battle-command]')[2].click(); await fight.querySelector('[data-battle-next]').click();
    assert.match(fight.querySelector('[data-battle-log]').textContent, /ダメージ/);
    await fight.querySelector('[data-battle-next]').click();
    if (monster.id === 2) {
      await fight.querySelectorAll('[data-battle-command]')[2].click(); await fight.querySelector('[data-battle-next]').click();
      assert.match(fight.querySelector('[data-battle-log]').textContent, /毒を受けた/);
      assert.match(fight.querySelector('[data-battle-player-name]').textContent, /毒/);
      await fight.querySelector('[data-battle-next]').click();
    }
    await fight.querySelectorAll('[data-battle-command]')[3].click();
    if (monster.canEscape === false && !monster.canEscapeBeforeAttacked) {
      assert.match(fight.querySelector('[data-battle-log]').textContent, /逃げられない/);
      assert.equal(fight.querySelector('[data-battle-commands]').hidden, false);
      assert.equal(fight.querySelector('[data-battle-panel]').hidden, true);
      assert.equal(fight.hidden, false);
      const hpBeforeEscape = fight.querySelector('[data-battle-player-hp]').textContent;
      await view.dispatch('keydown', { key: 'e' });
      await view.dispatch('keydown', { key: 'Escape' });
      assert.equal(fight.querySelector('[data-battle-player-hp]').textContent, hpBeforeEscape);
      assert.equal(fight.querySelector('[data-battle-commands]').hidden, false);
      await fight.querySelectorAll('[data-battle-command]')[0].click();
      assert.equal(fight.querySelector('[data-battle-target]').hidden, false);
      await view.dispatch('keydown', { key: 'Escape' });
    } else {
      await fight.querySelector('[data-battle-next]').click(); assert.equal(fight.hidden, true);
    }
    if (monster.id === 2) {
      assert.match(view.querySelector('[data-play-status]').textContent, /毒/);
      const pocket = view.querySelector('[data-play-inventory]'), menu = view.querySelector('[data-play-inventory-window]');
      pocket.open = true; await pocket.dispatch('toggle');
      await menu.querySelectorAll('[data-player-tab]').find(b => b.dataset.playerTab === 'spells').click();
      assert.equal(menu.querySelectorAll('[data-menu-action]').length, 1, 'only learned healing spells appear in the field menu');
      await menuAction(menu, 'spell', 2).click(); assert.match(menu.querySelector('[data-player-feedback]').textContent, /HPが6回復/);
      assert.equal(view.querySelector('[data-field-hp-bar]').value, 40); assert.equal(view.querySelector('[data-field-mp-bar]').value, 7);
      await menuAction(menu, 'spell', 2).click(); assert.match(menu.querySelector('[data-player-feedback]').textContent, /全快/);
      assert.equal(view.querySelector('[data-field-mp-bar]').value, 7);
      await menu.querySelectorAll('[data-player-tab]').find(b => b.dataset.playerTab === 'items').click();
      await menuAction(menu, 'use', 1).click(); assert.match(menu.querySelector('[data-player-feedback]').textContent, /毒が治った/);
      assert.doesNotMatch(view.querySelector('[data-play-status]').textContent, /毒/);
    }
    await monsterPage.querySelector('#editor-stop-play').click(); disposeMonster();
  }
  const { createBattle } = await import(pathToFileURL(join(temporary, 'battleEngine.mjs')).href);
  const healingRoot = new Element(); let herbs = 2;
  const healingSession = createBattle({ id: 0, name: '王様', characterId: 'king', stats: { hp: 30, attack: 6, defense: 0 },
    patterns: { beforeAttacked: [{ type: 'say', text: 'よく来た' }], afterAttacked: [{ type: 'attack', text: '反撃', power: 1 }] } },
    { playerHp: 10, wasAttacked: true, consumeItem: id => id === 0 && herbs > 0 && Boolean(herbs--) });
  const healingView = mountBattleView(healingRoot, character, () => true, () => {}, {
    inventory: () => herbs ? [{ itemId: 0, count: herbs }] : [], gold: () => 92,
  });
  healingView.sync({ ...event }, [{ itemId: 0, count: 2 }], healingSession);
  await healingRoot.querySelectorAll('[data-battle-command]')[1].click();
  await healingRoot.querySelector('[data-battle-item]').click();
  assert.equal(herbs, 1); assert.equal(healingRoot.querySelector('[data-battle-player-hp]').textContent, 'HP 30 / 40');
  assert.match(healingRoot.querySelector('[data-battle-log]').textContent, /HPが20回復/);
  await healingRoot.querySelector('[data-battle-next]').click(); assert.equal(healingRoot.querySelector('[data-battle-player-hp]').textContent, 'HP 24 / 40');
  await healingRoot.querySelector('[data-battle-next]').click(); await healingRoot.querySelectorAll('[data-battle-command]')[1].click();
  assert.equal(healingRoot.querySelector('[data-battle-items]').textContent, 'やくそう ×1');
  assert.match(healingRoot.querySelector('[data-battle-resources]').textContent, /92G/);
  await healingRoot.querySelector('[data-battle-back]').click();
  const skillCommand = kind => healingRoot.querySelectorAll('[data-battle-command]').find(button => button.dataset.battleCommand === kind);
  const skillButton = id => healingRoot.querySelectorAll('[data-battle-skill]').find(button => Number(button.dataset.battleSkill) === id);
  await skillCommand('spells').click(); await skillButton(1).click();
  assert.equal(healingRoot.querySelector('[data-battle-target]').hidden, false); assert.equal(healingSession.playerMp, 10);
  healingView.keydown({ key: 'Escape', preventDefault() {} }); assert.equal(healingSession.playerMp, 10);
  assert.equal(healingRoot.querySelector('[data-battle-skill-list]').hidden, false);
  await skillButton(1).click(); await healingRoot.querySelector('[data-battle-enemy]').click();
  assert.equal(healingSession.playerMp, 7); assert.equal(healingSession.enemyHp, 18);
  assert.equal(healingRoot.querySelector('[data-battle-player-mp-bar]').value, 7);
  assert.equal(healingRoot.querySelector('[data-battle-player-mp]').textContent, 'MP 7 / 10');
  await healingRoot.querySelector('[data-battle-next]').click(); await healingRoot.querySelector('[data-battle-next]').click();
  await skillCommand('spells').click(); await skillButton(2).click();
  assert.equal(healingSession.playerHp, 38); assert.equal(healingSession.playerMp, 4);
  assert.equal(healingRoot.querySelector('[data-battle-player-hp-bar]').value, 38);
  const emptySkills = createBattle(healingSession.enemy, { player: { ...healingSession.player, skills: [], maxMp: 0 } });
  healingView.sync({ ...event }, [], emptySkills); await skillCommand('techniques').click();
  assert.equal(healingRoot.querySelector('[data-battle-log]').textContent, 'まだ覚えていない。');
  assert.equal(healingRoot.querySelector('[data-battle-player-mp-bar]').value, 0);
  assert.equal(healingRoot.querySelector('[data-battle-player-mp-bar]').attributes['aria-valuetext'], '0 / 0');
  for (const kind of ['techniques', 'spells']) for (const key of ['Enter', ' ', 'e']) {
    await skillCommand(kind).click();
    assert.equal(healingRoot.querySelectorAll('[data-battle-skill]').length, 0);
    healingView.keydown({ key, preventDefault() {} });
    assert.equal(healingRoot.querySelector('[data-battle-commands]').hidden, false);
    assert.equal(healingRoot.querySelector('[data-battle-panel]').hidden, true);
    assert.equal(emptySkills.phase, 'commands');
  }
  for (const inventory of [[], [{ itemId: 3, count: 1 }]]) for (const key of ['Enter', ' ', 'e']) {
    const root = new Element(), session = createBattle(healingSession.enemy);
    const view = mountBattleView(root, character, () => true, () => {});
    view.sync({ ...event }, inventory, session);
    await root.querySelectorAll('[data-battle-command]').find(b => b.dataset.battleCommand === 'items').click();
    assert.ok(root.querySelectorAll('[data-battle-item]').every(b => b.disabled));
    const hp = session.playerHp, mp = session.playerMp;
    view.keydown({ key, preventDefault() {} });
    assert.equal(root.querySelector('[data-battle-commands]').hidden, false);
    assert.equal(root.querySelector('[data-battle-panel]').hidden, true);
    assert.equal(session.phase, 'commands'); assert.equal(session.playerHp, hp); assert.equal(session.playerMp, mp);
    await root.querySelectorAll('[data-battle-command]').find(b => b.dataset.battleCommand === 'items').click();
    await root.querySelector('[data-battle-back]').click();
    assert.equal(root.querySelector('[data-battle-commands]').hidden, false);
    view.sync(null, []);
  }
  const lowMana = createBattle(healingSession.enemy, { playerMp: 1 });
  healingView.sync({ ...event }, [], lowMana); await skillCommand('spells').click();
  assert.equal(skillButton(1).disabled, true); assert.equal(skillButton(2).disabled, true);
  healingView.keydown({ key: 'Enter', preventDefault() {} }); assert.equal(lowMana.phase, 'commands'); assert.equal(lowMana.playerMp, 1);
  assert.equal(healingRoot.querySelector('[data-battle-commands]').hidden, false);
  for (const kind of ['techniques', 'spells']) for (const key of ['Enter', ' ', 'e']) {
    healingView.sync({ ...event }, [], createBattle(healingSession.enemy, { playerMp: 0 }));
    await skillCommand(kind).click();
    assert.ok(healingRoot.querySelectorAll('[data-battle-skill]').every(button => button.disabled));
    healingView.keydown({ key, preventDefault() {} });
    assert.equal(healingRoot.querySelector('[data-battle-commands]').hidden, false);
  }
  const changedSkills = createBattle(healingSession.enemy, { playerHp: 10 });
  healingView.sync({ ...event }, [], changedSkills); await skillCommand('spells').click();
  healingView.keydown({ key: 'ArrowDown', preventDefault() {} });
  skillButton(1).disabled = true; // Enabled-button count changed after the selected index was set.
  healingView.keydown({ key: 'Enter', preventDefault() {} });
  assert.equal(changedSkills.playerHp, 30); assert.equal(changedSkills.playerMp, 7);
  healingView.sync(null, []);
  const gallery = new Element();
  gallery.innerHTML = readFileSync(join(rootPath, 'web/index.html'), 'utf8').match(/<section id="gallery-walking"[\s\S]*?<\/section>/)[0];
  let galleryActive = true;
  const demoScenes = { castle: adventureData[0], town: adventureData[1], world: adventureData[2], forest: adventureData[3], cave: adventureData[4], demonCastle: adventureData[5] };
  const demoBefore = structuredClone(demoScenes);
  const disposeGallery = startGalleryPlay(gallery, demoScenes, characters, () => galleryActive);
  const galleryToggle = gallery.querySelector('#gallery-play-toggle');
  const galleryMap = gallery.querySelector('#gallery-play-map');
  const galleryView = gallery.querySelector('#gallery-play-view');
  const galleryCanvas = galleryView.querySelector('[data-play-canvas]');
  await galleryToggle.click();
  assert.equal(galleryToggle.textContent, '停止'); assert.equal(galleryView.hidden, false);
  const touchUp = galleryView.querySelectorAll('[data-direction]').find(button => button.dataset.direction === 'back');
  for (let step = 0; step < 4; step++) {
    await touchUp.dispatch('pointerdown', { button: 0, pointerId: 1 });
    await touchUp.dispatch('pointerup');
  }
  await galleryView.querySelector('[data-play-interact]').click();
  assert.match(galleryView.querySelector('[data-play-text]').textContent, /勇者/);
  await galleryView.querySelector('[data-play-advance]').click();
  await galleryView.querySelector('[data-play-reset]').click();
  const mobileViewport = galleryView.querySelector('[data-play-viewport]');
  mobileViewport.clientWidth = 264; mobileViewport.clientHeight = 300;
  await window.dispatch('resize');
  assert.equal(galleryCanvas.style.width, '416px'); // enlarged castle uses the scrolling 2x camera
  assert.equal(galleryCanvas.style.height, '384px');
  const inventoryPanel = galleryView.querySelector('[data-play-inventory]');
  const inventorySummary = inventoryPanel.querySelector('summary');
  inventoryPanel.open = true; await inventoryPanel.dispatch('toggle');
  const beforeInventory = galleryCanvas.images.length;
  await touchUp.dispatch('pointerdown', { button: 0, pointerId: 2 });
  tick(performance.now() + 150);
  assert.equal(galleryCanvas.images.length, beforeInventory); // touching movement cannot walk under an open menu
  await touchUp.dispatch('pointerup');
  await galleryView.dispatch('keydown', { key: 'Enter', target: inventorySummary,
    preventDefault() { assert.fail('Native summary activation must be preserved'); } });
  await galleryView.querySelector('[data-play-close-items]').click();
  assert.equal(inventoryPanel.open, false);
  inventoryPanel.open = true; await galleryView.dispatch('keydown', { key: 'Escape' });
  assert.equal(inventoryPanel.open, false);
  mobileViewport.clientWidth = 640;
  await window.dispatch('resize');
  assert.equal(galleryCanvas.style.width, '416px');
  await galleryView.dispatch('keydown', { key: 'A' });
  assert.deepEqual(galleryCanvas.images.at(-1).slice(5), [72, 128, 32, 32]);
  tick(performance.now() + 150);
  assert.deepEqual(galleryCanvas.images.at(-1).slice(5), [56, 128, 32, 32]); // the main aisle is clear; holding the key repeats movement
  await window.dispatch('blur');
  const afterBlur = galleryCanvas.images.at(-1).slice(5); tick(performance.now() + 300);
  assert.deepEqual(galleryCanvas.images.at(-1).slice(5), afterBlur);
  await galleryView.dispatch('keydown', { key: 'd' });
  await galleryView.dispatch('focusout', { relatedTarget: null });
  const afterFocusout = galleryCanvas.images.at(-1).slice(5); tick(performance.now() + 350);
  assert.deepEqual(galleryCanvas.images.at(-1).slice(5), afterFocusout);
  await galleryView.dispatch('keydown', { key: 'd' });
  galleryActive = false;
  const beforeHidden = galleryCanvas.images.length; tick(performance.now() + 450);
  assert.equal(galleryCanvas.images.length, beforeHidden);
  galleryActive = true;
  galleryMap.value = 'town'; await galleryMap.dispatch('change');
  assert.equal(frames.size, 0); assert.equal(galleryView.hidden, true);
  await galleryToggle.click();
  assert.deepEqual(galleryCanvas.images.at(-1).slice(5), [184, 288, 32, 32]);
  const up = galleryView.querySelectorAll('[data-direction]').find(button => button.dataset.direction === 'back');
  await up.dispatch('pointerdown', { button: 0, pointerId: 1 });
  assert.deepEqual(galleryCanvas.images.at(-1).slice(5), [184, 272, 32, 32]);
  await up.dispatch('pointercancel');
  await galleryView.querySelector('[data-play-reset]').click();
  assert.deepEqual(galleryCanvas.images.at(-1).slice(5), [184, 288, 32, 32]);
  galleryMap.value = 'castle'; await galleryMap.dispatch('change'); await galleryToggle.click();
  const touchDown = galleryView.querySelectorAll('[data-direction]').find(button => button.dataset.direction === 'front');
  for (let step = 0; step < 2; step++) {
    await touchDown.dispatch('pointerdown', { button: 0, pointerId: 5 }); await touchDown.dispatch('pointerup');
  }
  assert.equal(galleryView.querySelector('[data-play-stage]').textContent, '街');
  assert.equal(galleryCanvas.height, 21 * 16 * 4);
  await up.dispatch('pointerdown', { button: 0, pointerId: 6 }); await up.dispatch('pointerup');
  assert.equal(galleryView.querySelector('[data-play-stage]').textContent, '城');
  assert.equal(galleryCanvas.height, 12 * 16 * 4);
  galleryMap.value = 'world'; await galleryMap.dispatch('change'); await galleryToggle.click();
  assert.equal(galleryView.querySelector('[data-play-stage]').textContent, '全体マップ');
  assert.equal(galleryCanvas.width, 32 * 16 * 4);
  assert.equal(galleryCanvas.height, 24 * 16 * 4);
  assert.deepEqual(galleryCanvas.images.at(-1).slice(5), [120, 240, 32, 32]);
  await galleryView.dispatch('keydown', { key: 'ArrowLeft' });
  assert.deepEqual(galleryCanvas.images.at(-1).slice(5), [104, 240, 32, 32]);
  await window.dispatch('keyup', { key: 'ArrowLeft' });
  for (let i = 0; i < 3; i++) {
    await galleryView.dispatch('keydown', { key: 'ArrowUp' });
    await window.dispatch('keyup', { key: 'ArrowUp' });
  }
  assert.equal(galleryView.querySelector('[data-play-stage]').textContent, '森');
  assert.equal(galleryCanvas.width, 19 * 16 * 4);
  assert.equal(galleryCanvas.height, 17 * 16 * 4);
  await galleryView.dispatch('keydown', { key: 'ArrowDown' });
  await window.dispatch('keyup', { key: 'ArrowDown' });
  assert.equal(galleryView.querySelector('[data-play-stage]').textContent, '全体マップ');
  galleryMap.value = 'forest'; await galleryMap.dispatch('change'); await galleryToggle.click();
  assert.equal(galleryView.querySelector('[data-play-stage]').textContent, '森');
  assert.deepEqual(galleryCanvas.images.at(-1).slice(5), [136, 224, 32, 32]);
  galleryMap.value = 'cave'; await galleryMap.dispatch('change'); await galleryToggle.click();
  assert.equal(galleryView.querySelector('[data-play-stage]').textContent, '洞窟');
  assert.equal(galleryCanvas.width, 19 * 16 * 4);
  assert.equal(galleryCanvas.height, 17 * 16 * 4);
  assert.deepEqual(galleryCanvas.images.at(-1).slice(5), [136, 224, 32, 32]);
  await galleryView.dispatch('keydown', { key: 'ArrowDown' });
  await window.dispatch('keyup', { key: 'ArrowDown' });
  assert.equal(galleryView.querySelector('[data-play-stage]').textContent, '全体マップ');
  galleryMap.value = 'demon-castle'; await galleryMap.dispatch('change'); await galleryToggle.click();
  assert.equal(galleryView.querySelector('[data-play-stage]').textContent, '魔王城');
  assert.equal(galleryCanvas.width, 17 * 16 * 4);
  assert.equal(galleryCanvas.height, 19 * 16 * 4);
  assert.deepEqual(galleryCanvas.images.at(-1).slice(5), [120, 256, 32, 32]);
  await galleryView.dispatch('keydown', { key: 'ArrowDown' });
  await window.dispatch('keyup', { key: 'ArrowDown' });
  assert.equal(galleryView.querySelector('[data-play-stage]').textContent, '全体マップ');
  assert.deepEqual(demoScenes, demoBefore);
  const gallerySize = gallery.querySelector('#gallery-play-size');
  gallerySize.value = 'large'; await gallerySize.dispatch('change');
  assert.equal(frames.size, 0); assert.equal(galleryView.hidden, true);
  assert.equal(galleryMap.querySelectorAll('option').length, 15);
  assert.match(gallery.querySelector('#gallery-play-budget').textContent, /15マップ.*容量を超えます/);
  galleryMap.value = 'stage-9'; await galleryMap.dispatch('change'); await galleryToggle.click();
  assert.equal(galleryView.querySelector('[data-play-stage]').textContent, '水晶の洞窟');
  assert.equal(galleryCanvas.width, 31 * 16 * 4); assert.equal(galleryCanvas.height, 29 * 16 * 4);
  await up.dispatch('pointerdown', { button: 0, pointerId: 15 });
  gallerySize.value = 'small'; await gallerySize.dispatch('change');
  assert.equal(frames.size, 0); assert.equal(galleryView.hidden, true);
  assert.equal(galleryMap.value, 'castle'); assert.equal(galleryMap.querySelectorAll('option').length, 6);
  assert.match(gallery.querySelector('#gallery-play-budget').textContent, /6マップ.*残り\d+B/);
  assert.match(gallery.querySelector('#gallery-play-url').href, /^https:\/\/tag-quest-kappa\.vercel\.app\/#VFE/);
  await galleryToggle.click();
  assert.equal(galleryView.querySelector('[data-play-stage]').textContent, '小さな城');
  assert.deepEqual(galleryCanvas.images.at(-1).slice(5), [40, 64, 32, 32]);
  inventoryPanel.open = true; await inventoryPanel.dispatch('toggle');
  await galleryView.querySelectorAll('[data-player-tab]').find(button => button.dataset.playerTab === 'status').click();
  assert.match(galleryView.querySelector('[data-player-list]').innerHTML, /data-story-objective>冒険：消えた灯火.*森の妖精と洞窟の魔女/s);
  await galleryView.querySelector('[data-play-close-items]').click();
  const beforeSwitchTick = galleryCanvas.images.at(-1).slice(5); tick(performance.now() + 650);
  assert.deepEqual(galleryCanvas.images.at(-1).slice(5), beforeSwitchTick, 'a held direction cannot leak into the newly selected world');
  await touchDown.dispatch('pointerdown', { button: 0, pointerId: 16 }); await touchDown.dispatch('pointerup');
  assert.equal(galleryView.querySelector('[data-play-stage]').textContent, '小さな街');
  gallerySize.value = 'normal'; await gallerySize.dispatch('change');
  assert.equal(galleryMap.querySelectorAll('option').length, 6);
  assert.deepEqual(demoScenes, demoBefore, 'switching demos leaves the original source unchanged');
  disposeGallery(); assert.equal(frames.size, 0);
  assert.equal(gallerySize.listeners.get('change').length, 0);
  assert.equal(window.listeners.get('resize').length, 0);
  assert.equal(window.listeners.get('keyup').length, 0);
  assert.equal(document.listeners.get('visibilitychange').length, 0);
  const bossEditorWorld = parseWorld({ id: 0, name: 'ボス', width: 5, height: 5, spawn: { x: 16, y: 32 }, spawnAnchor: 'frame', npcAnchor: 'frame', floor: { default: 'grass', rectangles: [] }, entities: [{ kind: 'demon-lord', x: 16, y: 0, parameters: [], dialogue: { type: 'template', id: 9 } }] });
  storage.set(savedKey, JSON.stringify(bossEditorWorld));
  const bossPage = new Element(), disposeBossPage = startEditor(bossPage, characters), bossUi = id => bossPage.querySelector(`#editor-${id}`);
  await bossPage.querySelectorAll('[data-entity]')[0].click();
  bossUi('battle-enemy').value = '1'; bossUi('battle-once').checked = true; bossUi('battle-clear').checked = true;
  await bossUi('entity-form').dispatch('submit');
  assert.deepEqual(JSON.parse(storage.get(savedKey)).stages[0].entities[0].battleEvent, { enemyId: 1, once: true, clear: true });
  await bossUi('undo').click(); assert.equal(JSON.parse(storage.get(savedKey)).stages[0].entities[0].battleEvent, undefined); await bossUi('redo').click();
  bossUi('base-url').value = 'https://example.com/g'; await bossUi('base-url').dispatch('change'); assert.match(bossUi('game-url').value, /^https:\/\/example.com\/g#VFE/); assert.match(bossUi('tag-count').textContent, /残り/);
  await bossUi('validate').click(); assert.equal(bossUi('issues').textContent, '問題は見つかりませんでした。');
  const panViewport=bossUi('viewport'); panViewport.scrollLeft=100; panViewport.scrollTop=100;
  await bossPage.querySelectorAll('[data-tool]').find(b=>b.dataset.tool==='pan').click();
  const bossBoard=bossUi('canvas'); await bossBoard.dispatch('pointerdown',{button:0,pointerId:1,clientX:60,clientY:60}); await bossBoard.dispatch('pointermove',{pointerId:1,clientX:40,clientY:30}); await bossBoard.dispatch('pointerup',{pointerId:1});
  assert.equal(panViewport.scrollLeft,120); assert.equal(panViewport.scrollTop,130);
  const beforeBossPlay=storage.get(savedKey); await bossUi('play').click();
  const bossPlay=bossUi('play-view'); await bossPlay.dispatch('keydown',{key:'ArrowUp'}); await window.dispatch('keyup',{key:'ArrowUp'});
  await bossPlay.querySelector('[data-play-interact]').click(); assert.match(bossPlay.querySelector('[data-play-text]').textContent,/./);
  assert.equal(bossPlay.querySelector('[data-play-cancel-battle]').hidden,false);
  await bossPlay.querySelector('[data-play-cancel-battle]').click(); assert.equal(bossPlay.querySelector('[data-play-message]').hidden,true);
  await bossPlay.querySelector('[data-play-interact]').click();
  await bossPlay.querySelector('[data-play-advance]').click(); tick(performance.now()+800);
  const bossFight=bossPlay.querySelector('[data-play-battle]'); assert.equal(bossFight.hidden,false);
  for(let hit=0;hit<2;hit++) {
    await bossFight.querySelectorAll('[data-battle-command]').find(b=>b.dataset.battleCommand==='attack').click(); await bossFight.querySelector('[data-battle-enemy]').click();
    await bossFight.querySelector('[data-battle-next]').click();
    if(hit===0) await bossFight.querySelector('[data-battle-next]').click();
  }
  await bossFight.querySelector('[data-battle-next]').click(); assert.equal(bossFight.hidden,true); assert.match(bossPlay.querySelector('[data-play-text]').textContent,/GAME CLEAR/); assert.equal(bossPlay.querySelector('[data-play-clear]').hidden,false);
  await bossPlay.querySelector('[data-play-advance]').click(); assert.equal(bossPlay.querySelector('[data-play-message]').hidden,true);
  const postClearPosition=bossPlay.querySelector('[data-play-canvas]').images.at(-1).slice(5);
  await bossPlay.dispatch('keydown',{key:'ArrowRight'}); await window.dispatch('keyup',{key:'ArrowRight'});
  assert.notDeepEqual(bossPlay.querySelector('[data-play-canvas]').images.at(-1).slice(5),postClearPosition);
  assert.equal(bossPlay.querySelector('[data-play-clear]').hidden,false);
  await bossPlay.querySelector('[data-play-reset]').click(); assert.equal(bossPlay.querySelector('[data-play-clear]').hidden,true);
  assert.equal(storage.get(savedKey),beforeBossPlay); await bossUi('stop-play').click(); disposeBossPage();
  const auditNames = ['marble','carpet','wall-top','grass','dirt','brick','water','bridge','empty','forest-ground','sea','sand','cave-floor','cave-wall','demon-floor','demon-carpet','demon-wall-top'];
  const auditValid = parseWorld({id:0,name:'audit',width:5,height:5,spawn:null,npcAnchor:'frame',
    floor:{default:'marble',rectangles:auditNames.slice(1,16).map((tile,i)=>({tile,x:i%5,y:Math.floor(i/5),width:1,height:1}))},entities:[]});
  storage.set(savedKey,JSON.stringify(auditValid));
  const auditPage = new Element(), disposeAudit = startEditor(auditPage,characters);
  await auditPage.querySelectorAll('[data-material]').find(e=>e.dataset.material==='demon-wall-top').click();
  const auditCanvas = auditPage.querySelector('#editor-canvas');
  await auditCanvas.dispatch('pointerdown',{button:0,pointerId:1,clientX:136,clientY:136});
  await auditCanvas.dispatch('pointerup',{button:0,pointerId:1,clientX:136,clientY:136});
  assert.match(auditPage.querySelector('#editor-error').textContent, /16種類/);
  assert.deepEqual(JSON.parse(storage.get(savedKey)), auditValid);
  assert.equal(auditPage.querySelector('#editor-undo').disabled, true);
  disposeAudit();
  const broken = structuredClone(auditValid);
  broken.stages[0].floor.rectangles.push({ tile: 'demon-wall-top', x: 4, y: 4, width: 1, height: 1 });
  storage.set(savedKey + '.last-good', JSON.stringify(auditValid)); storage.set(savedKey, JSON.stringify(broken));
  const recoveredPage = new Element(), disposeRecovery = startEditor(recoveredPage, characters);
  assert.match(recoveredPage.querySelector('#editor-error').textContent, /退避/);
  assert.equal(storage.get(savedKey + '.recovery'), JSON.stringify(broken));
  await recoveredPage.querySelector('#editor-export-world').click();
  assert.deepEqual(JSON.parse(await downloads.at(-1).blob.text()), auditValid);
  disposeRecovery();
  console.log('Save regression: 17th floor rolls back without modifying storage/history; corrupt saved data is backed up and last-good data restored.');
  console.log('Walking: 1x1 feet collision, head overlap, one-cell corridors, castle pillars, four directions, isolated editor play and gallery castle/town passed.');
  console.log('Editor: empty floors, all NPC 1x2 frames, legacy import, placement and undo passed; 9 worlds match Python byte for byte.');
  console.log('Adventure: field/town/forest round trips, clearing route, loot persistence/reset, three-species forest and data-configured encounter, remapped sample IDs and undo passed.');
  console.log('Overworld: sea/mountain blocking, forest/beach passage, bridge route, preserved edits and reversible sample addition passed.');
  console.log('Locations: four reachable 1x1 entrances, centered overhang, editor palette, serialized exit overlays and return routes passed.');
  console.log('Forest: walkable ground, trunk-only collision, canopy passage, tree messages/items and new IDs round-trip passed.');
  console.log('Tree layers: rear occlusion, front/same-depth visibility, transparent corners, face corrections, sorted overlapping trees and immutable scene passed.');
  console.log('NPCs: 1x1 feet collision, head passage, four-sided conversation, shared tree depth and new pixel materials passed.');
  console.log('Objects: message and item forms, undo/export/v8 decode, literal text, one-time pickup, retained collision and play/editor isolation passed.');
  console.log('Battle: peaceful/angry enemy turns, HP/guard, turn locks, escape/retry, defeat/respawn, victory-only disappearance, reset and touch/keyboard selection passed.');
} finally {
  Math.random = originalRandom;
  rmSync(temporary, { recursive: true, force: true });
}
