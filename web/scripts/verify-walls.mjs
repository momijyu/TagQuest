// Automatic wall appearance, legacy IDs and single-material NFC storage.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../node_modules/vite/dist/node/index.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const out = mkdtempSync(join(tmpdir(), 'tagquest-walls-'));
try {
  await build({ configFile: false, logLevel: 'silent', build: {
    lib: { entry: Object.fromEntries(Object.entries({ wall: 'renderer/wall', model: 'editor/model',
      decoder: 'codec/scenes', walking: 'game/walking', original: 'data/tiles/castle-wall-corner' })
      .map(([name, path]) => [name, join(root, `web/src/${path}.ts`)])),
      formats: ['es'], fileName: (_, name) => `${name}.mjs` }, outDir: out, emptyOutDir: false,
  } });
  const read = name => import(pathToFileURL(join(out, `${name}.mjs`)));
  const { wallShape, automaticWall } = await read('wall');
  const { initialWorld, parseWorld, toSceneData, paint, compactFloor, clone, History, encodeWorld } = await read('model');
  const { decodeScenes } = await read('decoder');
  const { canStand } = await read('walking');
  const { castleWallTopLeft, castleWallTopRight } = await read('original');
  const catalog = JSON.parse(readFileSync(join(root, 'web/src/data/scene-catalog.json')));
  const families = JSON.parse(readFileSync(join(root, 'web/src/data/wall-families.json')));
  const castle = toSceneData(initialWorld().stages[0]);
  assert.equal(wallShape(castle, 0, 0), 'top-left'); assert.equal(wallShape(castle, 6, 0), 'top-right');
  assert.equal(wallShape(castle, 3, 0), 'top'); assert.equal(wallShape(castle, 0, 3), 'left'); assert.equal(wallShape(castle, 6, 3), 'right');
  assert.deepEqual(automaticWall(castle, 0, 0), castleWallTopLeft);
  assert.deepEqual(automaticWall(castle, 6, 0), castleWallTopRight);
  assert.equal(automaticWall(castle, 3, 3), undefined);
  assert.equal(new Set([...castle.tiles].filter(id => families['wall-top'].includes(catalog.tiles[id]))).size, 1);
  for (const kind of Object.keys(families)) {
    const material = kind === 'wall-top' ? 'marble' : 'demon-floor';
    const world = parseWorld({ id: 0, name: kind, width: 7, height: 7, spawn: null,
      floor: { default: material, rectangles: [
        { tile: kind, x: 0, y: 0, width: 7, height: 1 }, { tile: kind, x: 0, y: 1, width: 1, height: 6 },
        { tile: kind, x: 6, y: 1, width: 1, height: 6 }, { tile: kind, x: 0, y: 6, width: 7, height: 1 },
      ] }, entities: [] });
    const scene = toSceneData(world.stages[0]), snapshot = scene.tiles.slice();
    for (const [x, y, shape] of [[0, 0, 'top-left'], [6, 0, 'top-right'], [0, 6, 'bottom-left'], [6, 6, 'bottom-right'],
      [3, 0, 'top'], [0, 3, 'left'], [6, 3, 'right'], [3, 6, 'bottom']]) {
      assert.equal(wallShape(scene, x, y), shape);
      const tile = automaticWall(scene, x, y);
      assert.equal(tile.size, 16);
      assert.equal(tile.pixels.length, 16); assert.ok(tile.pixels.every(row => row.length === 16));
      assert.equal(canStand(scene, { x: x * 16, y: y * 16 - 16 }), false, 'every wall direction remains impassable');
    }
    assert.deepEqual(scene.tiles, snapshot, 'rendering never writes direction IDs into the map');
    const history = new History(clone(world)), before = clone(history.world);
    paint(history.world.stages[0], material, 0, 0); compactFloor(history.world.stages[0]); history.commit(before);
    assert.equal(wallShape(toSceneData(history.world.stages[0]), 1, 0), 'top-right', 'removing a corner updates its neighbor');
    history.undo(); assert.equal(wallShape(toSceneData(history.world.stages[0]), 0, 0), 'top-left');
    history.redo(); assert.equal(automaticWall(toSceneData(history.world.stages[0]), 0, 0), undefined);
    const legacy = clone(world);
    legacy.stages[0].floor.rectangles.forEach((rect, index) => { rect.tile = families[kind][index + 1]; });
    assert.deepEqual(toSceneData(parseWorld(legacy).stages[0]).tiles, scene.tiles, 'legacy JSON orientations normalize to one wall ID');
    const binary = encodeWorld(legacy).bytes;
    assert.deepEqual(decodeScenes(binary)[0].tiles, scene.tiles);
    const input = join(out, 'walls.json'), output = join(out, 'walls.bin'); writeFileSync(input, JSON.stringify(legacy));
    execFileSync('python3', [join(root, 'compiler/build.py'), '--maps', input, '--out', output], { stdio: 'pipe' });
    assert.deepEqual(readFileSync(output), Buffer.from(binary), 'Python and Web normalize old aliases identically');
    const numericLegacy = structuredClone(scene);
    numericLegacy.tiles = Uint8Array.from(numericLegacy.tiles, id => id === catalog.tiles.indexOf(kind) ? catalog.tiles.indexOf(families[kind][1]) : id);
    assert.equal(wallShape(numericLegacy, 0, 0), 'top-left', 'old binary direction IDs remain renderable');
  }
  const filled = { ...castle, width: 3, height: 3, spawn: null, entities: [], tiles: new Uint8Array(9).fill(2) };
  assert.equal(wallShape(filled, 1, 1), 'solid');
  const isolated = { ...filled, tiles: new Uint8Array(9).fill(0) }; isolated.tiles[4] = 2;
  assert.equal(wallShape(isolated, 1, 1), 'post');
  const cross = { ...filled, tiles: Uint8Array.from([0, 2, 0, 2, 2, 2, 0, 2, 0]) };
  assert.equal(wallShape(cross, 1, 1), 'solid', 'four-way junction remains connected');
  const upright = { ...filled, tiles: Uint8Array.from([0, 2, 0, 0, 2, 0, 0, 2, 0]) };
  assert.equal(wallShape(upright, 1, 1), 'left');
  const horizontal = { ...filled, tiles: Uint8Array.from([0, 0, 0, 2, 2, 2, 0, 0, 0]) };
  assert.equal(wallShape(horizontal, 1, 1), 'top');
  assert.equal(encodeWorld(initialWorld()).bytes.length, 202);
  console.log('Automatic walls: one ID per material, eight directions/corners, thick regions, isolated/cross/wall lines, neighbor redraw/undo, collision, legacy JSON/binary aliases and Python/Web parity passed.');
} finally { rmSync(out, { recursive: true, force: true }); }
