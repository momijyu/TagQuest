// Building footprints, legacy coordinates and actual foreground pixels.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../node_modules/vite/dist/node/index.js';
const root = fileURLToPath(new URL('../..', import.meta.url)), out = mkdtempSync(join(tmpdir(), 'tq-buildings-'));
try {
  await build({ configFile: false, logLevel: 'silent', build: { lib: { entry: Object.fromEntries([
    ['model', 'editor/model'], ['renderer', 'renderer/compiled-scene'], ['walking', 'game/walking'], ['codec', 'codec/scenes'],
  ].map(([name, file]) => [name, join(root, `web/src/${file}.ts`)])), formats: ['es'], fileName: (_, name) => `${name}.mjs` }, outDir: out } });
  const read = name => import(pathToFileURL(join(out, `${name}.mjs`)).href);
  const { parseWorld, initialWorld, makeEntity, encodeWorld, toSceneData } = await read('model');
  const { entityFrame, entityDrawingFrame, entityCollisionFrame, drawCompiledScene } = await read('renderer');
  const { canStand, interactionTarget, createWalkingGame } = await read('walking');
  const { decodeScenes } = await read('codec');
  const playable = stage => { const { name, floor, spawnAnchor, residentAnchor, npcAnchor, buildingAnchor, ...scene } = toSceneData(stage); return scene; };
  const kinds = ['castle', 'weapon-shop', 'armor-shop', 'item-shop', 'house-red', 'house-slate'];
  const base = (width = 12, height = 12) => ({ id: 0, name: '建物', width, height, spawn: null, spawnAnchor: 'frame', npcAnchor: 'frame', buildingAnchor: 'frame', floor: { default: 'grass', rectangles: [] }, entities: [], exits: [] });
  for (const kind of kinds) {
    const height = kind.endsWith('-shop') ? 80 : 64, drawingWidth = kind.startsWith('house-') ? 64 : 80;
    const s = base(2, height / 16), e = makeEntity(kind, 0, 0, s); s.entities.push(e);
    const world = parseWorld([s]);
    assert.deepEqual(entityFrame(e), { x: 0, y: 0, width: 32, height });
    const collision = kind.startsWith('house-') ? { x: -16, y: 32, width: 64, height: 32 }
      : kind.endsWith('-shop') ? { x: -16, y: 16, width: 64, height: 64 } : entityFrame(e);
    assert.deepEqual(entityCollisionFrame(e), collision);
    assert.deepEqual(entityDrawingFrame(e), { x: -(drawingWidth - 32) / 2, y: 0, width: drawingWidth, height });
    for (const compact of [false, true]) {
      const encoded = encodeWorld(world, compact); assert.equal(encoded.bytes[2], 14);
      assert.deepEqual(decodeScenes(encoded.bytes)[0], playable(world.stages[0]));
    }
    assert.throws(() => parseWorld([{ ...s, width: 1 }]));
    const legacy = base(); delete legacy.buildingAnchor;
    legacy.entities = [{ kind, x: 32, y: 16, parameters: [] }];
    const moved = parseWorld([legacy]).stages[0].entities[0];
    assert.equal(entityDrawingFrame(moved).x, 32, 'old JSON preserves artwork position');
    assert.deepEqual(parseWorld(parseWorld([legacy])), parseWorld([legacy]), 'save/reload cannot migrate twice');
  }
  // Compile genuine old layouts with old versions instead of relabeling a new payload.
  const fixtures = JSON.parse(execFileSync('python3', ['-c', `
import json,base64,sys
sys.path.insert(0,sys.argv[1])
from build import ROOT,compile_stage
stages=[json.loads((ROOT/f'compiler/maps/{name}.json').read_text()) for name in ('castle','town')]
# Legacy formats require an integer rate, independently of today's editor default.
stages[0]['encounter']['rate']=10
result=[]
for version in (8,11,13):
 b=b'TQ'+bytes([version,len(stages)])
 for s in stages:
  data,_=compile_stage(s,version=version,compact=version>=11,stage_ids=[s['id'] for s in stages] if version>=13 else None)
  b+=data
 result.append(base64.b64encode(b).decode())
print(json.dumps(result))`, join(root, 'compiler')], { encoding: 'utf8' }));
  const expected = initialWorld().stages.map(playable);
  expected[0].encounter.rate = 10;
  for (const fixture of fixtures) assert.deepEqual(decodeScenes(new Uint8Array(Buffer.from(fixture, 'base64'))), expected);
  const size = 192, heroColor = 0xff00ff, actor = { image: {}, sourceX: 0, sourceY: 0, width: 32, height: 32 };
  function render(scene, position) {
    const pixels = new Uint32Array(size * size);
    const fill = (x, y, w, h, color) => {
      for (let row = Math.max(0, y); row < Math.min(size, y + h); row++) for (let col = Math.max(0, x); col < Math.min(size, x + w); col++) pixels[row * size + col] = color;
    };
    drawCompiledScene({ fillStyle: '', fillRect(x, y, w, h) { fill(x, y, w, h, parseInt(this.fillStyle.slice(1), 16)); }, drawImage(...args) { fill(args[5], args[6], args[7], args[8], heroColor); } },
      { ...scene, spawn: position }, { king: actor, player: actor });
    return pixels;
  }
  for (const kind of kinds) {
    const s = base(); s.entities = [makeEntity(kind, 48, 16, s)];
    const scene = toSceneData(parseWorld([s]).stages[0]), before = structuredClone(scene);
    const wideCollision = kind !== 'castle';
    assert.equal(canStand(scene, { x: 32, y: 32 }), !wideCollision, 'house/shop side walls block movement; castle overhangs remain passable');
    assert.ok(!canStand(scene, { x: 48, y: 32 }), 'central two cells block movement');
    const only = render(scene, null), ground = render({ ...scene, entities: [] }, null);
    const sideX = wideCollision ? 16 : 32;
    assert.ok(canStand(scene, { x: sideX, y: 32 }));
    const behind = render(scene, { x: sideX, y: 32 }); let covered = 0;
    for (let y = 32; y < 64; y++) for (let x = sideX - 8; x < sideX + 24; x++) {
      const i = y * size + x;
      if (only[i] !== ground[i]) { assert.equal(behind[i], only[i], `${kind} covers the hero behind it`); covered++; }
    }
    assert.ok(covered > 0);
    const bottom = 16 + entityFrame(scene.entities[0]).height;
    const front = render(scene, { x: 32, y: bottom - 16 });
    assert.equal(front[(bottom - 12) * size + 40], heroColor, 'equal depth keeps the hero visible in front');
    assert.deepEqual(scene, before);
  }
  for (const kind of kinds.filter(kind => kind !== 'castle')) {
    const s = base(); s.entities = [{ ...makeEntity(kind, 48, 16, s), dialogue: { type: 'custom', text: '閉じた家だ。' } }];
    const world = parseWorld([s]);
    for (const compact of [false, true]) {
      const scene = decodeScenes(encodeWorld(world, compact).bytes)[0], snapshot = structuredClone(scene);
      const house = kind.startsWith('house-'), height = house ? 4 : 5, firstBlockedRow = house ? 2 : 1;
      // Feet can pass behind upper artwork; the lower four columns block movement.
      for (let row = 0; row < height; row++) for (let col = 0; col < 4; col++) {
        assert.equal(canStand(scene, { x: 32 + col * 16, y: row * 16 }), row < firstBlockedRow, `${kind} cell ${col},${row}`);
      }
      const rearY = (firstBlockedRow - 1) * 16;
      const rear = createWalkingGame(scene, { position: { x: 16, y: rearY }, direction: 'right' });
      for (let step = 0; step < 5; step++) assert.equal(rear.move('right'), true, 'upper artwork does not block the rear passage');
      assert.equal(rear.move('front'), true, 'the rear passage leads back around the side');
      const upper = render(scene, { x: 48, y: rearY }), only = render(scene, null), ground = render({ ...scene, entities: [] }, null);
      let covered = 0;
      for (let y = rearY; y < rearY + 32; y++) for (let x = 40; x < 72; x++) {
        const i = y * size + x;
        if (only[i] !== ground[i]) { assert.equal(upper[i], only[i], 'upper artwork hides the hero walking behind it'); covered++; }
      }
      assert.ok(covered > 0);
      for (const [position, direction] of [
        [{ x: 16, y: 32 }, 'right'], [{ x: 96, y: 32 }, 'left'],
        [{ x: 48, y: rearY }, 'front'], [{ x: 48, y: height * 16 }, 'back'],
      ]) {
        const game = createWalkingGame(scene, { position, direction });
        assert.equal(game.move(direction), false, `${kind} cannot be entered from ${direction}`);
        assert.deepEqual(game.position, position, 'blocked movement keeps the player outside');
        game.interact(); assert.equal(game.message?.text, '閉じた家だ。', 'inspection works from the visible outer wall');
      }
      const shifted = { ...scene, entities: [{ ...scene.entities[0], x: 50, y: 18 }] };
      const game = createWalkingGame(shifted, { position: { x: 16, y: 32 }, direction: 'right' });
      assert.equal(game.move('right'), false, '2px offsets cannot be crossed mid-step');
      assert.deepEqual(scene, snapshot);
    }
  }
  // Shops still show their merchant above the floor and below the counter.
  for (const kind of ['weapon', 'armor', 'item']) {
    const s = base(), shop = makeEntity(`${kind}-shop`, 48, 16, s);
    const merchant = { kind: `${kind}-merchant`, x: 56, y: 46, parameters: [] };
    s.entities = [shop, merchant];
    const scene = toSceneData(parseWorld([s]).stages[0]);
    const withMerchant = render(scene, null), without = render({ ...scene, entities: [shop] }, null);
    assert.ok(withMerchant.some((pixel, i) => pixel !== without[i]), 'merchant pixels remain visible');
    assert.deepEqual(render({ ...scene, entities: [merchant, shop] }, null), withMerchant, 'placement order does not hide the merchant');
    assert.equal(interactionTarget(scene, { x: 56, y: 80 }, 'back'), 1, 'counter conversation survives narrowing');
  }
  console.log('Buildings: 2-cell placement frames, lower 4x2 house/4x4 shop collision, passable rear artwork/occlusion, four-sided inspection, unchanged artwork/heights, v8/v11/v13 migration, v14 round trips, foreground pixels and shop counters passed.');
} finally { rmSync(out, { recursive: true, force: true }); }
