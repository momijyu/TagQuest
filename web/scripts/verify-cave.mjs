// Cave routes and the extended tile palette contract, without a browser.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../node_modules/vite/dist/node/index.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'tagquest-cave-'));
try {
  await build({ configFile: false, logLevel: 'silent', build: {
    lib: { entry: Object.fromEntries(Object.entries({ model: 'editor/model', decoder: 'codec/scenes',
      adventure: 'editor/adventure', walking: 'game/walking', world: 'game/world', preview: 'renderer/cave-preview',
      demonPreview: 'renderer/demon-castle-preview' })
      .map(([name, path]) => [name, join(root, `web/src/${path}.ts`)])),
    formats: ['es'], fileName: (_, name) => `${name}.mjs` }, outDir: temporary, emptyOutDir: false,
  } });
  const read = name => import(pathToFileURL(join(temporary, `${name}.mjs`)));
  const { parseWorld, initialWorld, encodeWorld, toSceneData, clone } = await read('model');
  const { decodeScenes } = await read('decoder');
  const { createAdventureWorld } = await read('adventure');
  const { canStand, createWalkingGame } = await read('walking');
  const { createWorldGame } = await read('world');
  const { caveMaterials, caveStagePreview } = await read('preview');
  const { demonCastleMaterials, demonCastleStagePreview } = await read('demonPreview');
  const catalog = JSON.parse(readFileSync(join(root, 'web/src/data/scene-catalog.json')));
  const families = JSON.parse(readFileSync(join(root, 'web/src/data/wall-families.json')));
  const oldWallNames = new Set(Object.values(families).flatMap(names => names.slice(1)));
  const distinctTiles = catalog.tiles.filter(name => !oldWallNames.has(name) && name !== 'cave-floor');
  for (const material of [...Object.values(caveMaterials), ...Object.values(demonCastleMaterials)]) {
    assert.equal(material.pixels.length, material.size ?? material.height);
    for (const row of material.pixels) {
      assert.equal(row.length, material.size ?? material.width);
      for (const code of row) if (code !== '.') assert.ok(parseInt(code, 36) < material.palette.length);
    }
  }
  const cave = parseWorld(JSON.parse(readFileSync(join(root, 'compiler/maps/cave.json'))));
  const encoded = encodeWorld(cave).bytes;
  assert.equal(encoded[2], 9);
  assert.equal(encoded[9], 130); // RECT + stage-local palette.
  assert.deepEqual(decodeScenes(encoded)[0].tiles, caveStagePreview.tiles);
  assert.equal(encodeWorld(initialWorld()).bytes[2], 15);
  assert.equal(encodeWorld(initialWorld()).bytes.length, 206);
  const source = join(temporary, 'cave.json'); writeFileSync(source, JSON.stringify(cave));
  for (const codec of ['RAW', 'RLE', 'RECT']) {
    const output = join(temporary, `${codec}.bin`);
    execFileSync('python3', ['-c', `import json, sys
from pathlib import Path
sys.path.insert(0, 'compiler')
from build import compile_game
binary, _ = compile_game(json.loads(Path(sys.argv[1]).read_text())['stages'], sys.argv[3])
Path(sys.argv[2]).write_bytes(binary)`, source, output, codec], { cwd: root });
    const binary = readFileSync(output);
    assert.deepEqual(decodeScenes(binary)[0].tiles, caveStagePreview.tiles, codec);
    if (codec === 'RECT') assert.deepEqual(Buffer.from(encoded), binary);
    for (let length = 0; length < binary.length; length++) assert.throws(() => decodeScenes(binary.subarray(0, length)));
  }
  for (const [offset, value] of [[13, 0], [13, 17], [14, 255], [15, 16], [16, 2], [9, 131], [2, 8]]) {
    const broken = encoded.slice(); broken[offset] = value;
    assert.throws(() => decodeScenes(broken), `malformed palette at ${offset}`);
  }
  const tooMany = clone(cave);
  const mixed = clone(cave);
  mixed.stages[0].floor = { default: 'cave-floor', rectangles: distinctTiles.slice(0, 15)
    .map((tile, x) => ({ tile, x, y: 0, width: 1, height: 1 })) };
  const mixedEncoded = encodeWorld(mixed).bytes;
  assert.equal(mixedEncoded[13], 16, 'all sixteen palette slots can be used');
  assert.deepEqual(decodeScenes(mixedEncoded)[0].tiles, toSceneData(mixed.stages[0]).tiles);
  writeFileSync(source, JSON.stringify(mixed));
  const mixedOutput = join(temporary, 'mixed.bin');
  execFileSync('python3', [join(root, 'compiler/build.py'), '--maps', source, '--out', mixedOutput]);
  assert.deepEqual(readFileSync(mixedOutput), Buffer.from(mixedEncoded));
  tooMany.stages[0].floor.rectangles = distinctTiles.slice(0, 16).map((tile, x) => ({ tile, x, y: 0, width: 1, height: 1 }));
  tooMany.stages[0].floor.default = 'cave-floor';
  assert.throws(() => encodeWorld(tooMany), /16/);
  writeFileSync(source, JSON.stringify(tooMany));
  assert.throws(() => execFileSync('python3', [join(root, 'compiler/build.py'), '--maps', source,
    '--out', join(temporary, 'invalid.bin')], { stdio: 'pipe' }));

  const steps = [['back', 0, -16], ['front', 0, 16], ['left', -16, 0], ['right', 16, 0]];
  function reachable(scene, start, avoidExits = false) {
    const queue = [{ ...start, path: [] }], seen = new Map();
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i], key = `${p.x},${p.y}`;
      if (seen.has(key)) continue;
      seen.set(key, p.path);
      for (const [direction, dx, dy] of steps) {
        const next = { x: p.x + dx, y: p.y + dy };
        if (avoidExits && scene.exits?.some(e => e.x * 16 === next.x && e.y * 16 - 16 === next.y)) continue;
        if (canStand(scene, next)) queue.push({ ...next, path: [...p.path, direction] });
      }
    }
    return seen;
  }
  const paths = reachable(caveStagePreview, caveStagePreview.spawn);
  const floorCount = [...caveStagePreview.tiles].filter(id => catalog.tiles[id] === 'cave-floor').length;
  assert.equal(paths.size, floorCount, 'every cave floor is reachable from the entrance');
  assert.equal(canStand(caveStagePreview, { x: 0, y: 0 }), false);
  assert.equal(canStand(caveStagePreview, { x: 144, y: 240 }), true, 'single-cell doorway is passable');
  const world = createAdventureWorld(), scenes = decodeScenes(encodeWorld(world).bytes);
  assert.equal(scenes.length, 6);
  const game = createWorldGame(scenes, 2, () => 0.999999);
  function walkTo(x, y) {
    const path = reachable(game.scene, game.position, true).get(`${x},${y}`);
    assert.ok(path, `route to ${x},${y}`);
    for (const direction of path) assert.equal(game.move(direction), true);
  }
  walkTo(192, 192);
  assert.equal(game.move('back'), true);
  assert.equal(game.scene.id, 4);
  assert.deepEqual(game.position, { x: 144, y: 224 });
  walkTo(64, 32); // left chamber
  walkTo(208, 64); // right chamber, beside the new treasure chest
  assert.equal(game.encounter, null, 'route-only checks avoid the configured cave encounters');
  walkTo(144, 224);
  assert.equal(game.move('front'), true);
  assert.equal(game.scene.id, 2);
  assert.deepEqual(game.position, { x: 192, y: 192 });
  assert.equal(game.move('back'), true); assert.equal(game.scene.id, 4);
  assert.deepEqual(world.stages.find(stage => stage.id === 4).encounter.enemies.map(entry => entry.enemyId), [5, 6, 7]);
  assert.equal(game.move('front'), true); assert.equal(game.scene.id, 2);
  walkTo(368, 64); // in front of the demon castle, across the river bridge
  assert.equal(game.move('back'), true); assert.equal(game.scene.id, 5);
  assert.deepEqual(game.position, { x: 128, y: 256 });
  walkTo(128, 80); // in front of the sample boss
  assert.equal(game.move('back'), false, 'the boss blocks its foot cell');
  game.interact(); assert.equal(game.message.speaker,'魔王');
  assert.equal(game.cancelBattleDialogue(),true);assert.equal(game.message,null);assert.equal(game.battle,null);
  assert.equal(game.cleared,false);assert.ok(game.visibleEntities.some(e=>e.kind==='demon-lord'));
  // Inspect either throne independently of the NPC standing in front of it.
  for(const [kind,color] of [['demon-throne','紫の'],['throne','赤い']]) {
    const throneScene={...demonCastleStagePreview,spawn:{x:128,y:64},entities:[{...demonCastleStagePreview.entities[0],kind}]};
    const investigation=createWalkingGame(throneScene);assert.equal(investigation.move('back'),false);investigation.interact();
    assert.equal(investigation.message.text,`${color}クッションと金の装飾がついた玉座だ。`);
  }
  walkTo(112, 32); walkTo(144, 32); // both sides of the throne remain open
  assert.equal(canStand(demonCastleStagePreview, { x: 48, y: 64 }), false, 'pillar blocks its own column');
  assert.equal(canStand(demonCastleStagePreview, { x: 32, y: 64 }), true, 'passage beside the pillar is open');
  assert.equal(canStand(demonCastleStagePreview, { x: 16, y: 16 }), false, 'stone walls block walking');
  let openCells = 0;
  for (let y = 0; y < demonCastleStagePreview.height; y++) for (let x = 0; x < demonCastleStagePreview.width; x++) {
    if (canStand(demonCastleStagePreview, { x: x * 16, y: y * 16 - 16 })) openCells++;
  }
  assert.equal(reachable(demonCastleStagePreview, demonCastleStagePreview.spawn).size, openCells, 'all open hall cells are reachable');
  assert.equal(game.encounter, null, 'walking alone does not trigger the NPC boss battle');
  walkTo(128, 256); assert.equal(game.move('front'), true); assert.equal(game.scene.id, 2);
  assert.deepEqual(game.position, { x: 368, y: 64 });
  assert.equal(game.move('back'), true); assert.equal(game.scene.id, 5);
  const withInteraction = clone(world);
  withInteraction.stages.find(stage => stage.id === 5).entities[0].dialogue = { type: 'custom', text: '古い玉座だ。' };
  withInteraction.stages.find(stage => stage.id === 5).entities[0].itemId = 0;
  const interactionBytes = encodeWorld(withInteraction).bytes;
  writeFileSync(source, JSON.stringify(withInteraction));
  const interactionOutput = join(temporary, 'throne.bin');
  execFileSync('python3', [join(root, 'compiler/build.py'), '--maps', source, '--out', interactionOutput]);
  assert.deepEqual(readFileSync(interactionOutput), Buffer.from(interactionBytes));
  assert.deepEqual(decodeScenes(interactionBytes).find(stage => stage.id === 5).entities[0].dialogue,
    { type: 'custom', text: '古い玉座だ。' });
  assert.equal(world.stages.find(stage => stage.id === 5).encounter, undefined);
  // Follow the real sample from Lv1: defeat the king, keep royal gear, travel and clear.
  const clearGame=createWorldGame(scenes,0,()=>0);
  assert.equal(clearGame.move('left'),true);assert.equal(clearGame.battle.enemy.id,0);
  function win(session) {
    let turns=0;
    while(session.battle.phase!=='victory') {
      assert.notEqual(session.battle.phase,'defeat');assert.ok(++turns<100);
      if(session.battle.phase==='commands')session.battle.attack();else session.battle.advance();
    }
    session.finishEncounter('victory');
  }
  win(clearGame);while(clearGame.message)clearGame.interact();
  assert.equal(clearGame.status.level,10);
  assert.equal(clearGame.status.appearance,'king');
  function walkClearTo(x,y) {
    const path=reachable({...clearGame.scene,entities:clearGame.visibleEntities},clearGame.position,true).get(`${x},${y}`);
    assert.ok(path,`clear route in stage ${clearGame.scene.id} to ${x},${y}`);
    for(const direction of path)assert.equal(clearGame.move(direction),true);
  }
  walkClearTo(96,144);clearGame.move('front');assert.equal(clearGame.scene.id,1);
  walkClearTo(192,288);clearGame.move('front');assert.equal(clearGame.scene.id,2);
  walkClearTo(368,64);clearGame.move('back');assert.equal(clearGame.scene.id,5);
  walkClearTo(128,80);clearGame.move('back');clearGame.interact();assert.equal(clearGame.message.speaker,'魔王');clearGame.interact();
  assert.equal(clearGame.battle.enemy.id,4);assert.equal(clearGame.battle.enemyAttackMultiplier,1);
  win(clearGame);assert.equal(clearGame.cleared,true);assert.match(clearGame.message.text,/GAME CLEAR/);
  assert.ok(!clearGame.visibleEntities.some(entity=>entity.kind==='demon-lord'));assert.equal(clearGame.move('front'),false);
  clearGame.interact(); assert.equal(clearGame.message,null);
  walkClearTo(128,256); clearGame.move('front'); assert.equal(clearGame.scene.id,2); assert.equal(clearGame.cleared,true);
  walkClearTo(128,240); clearGame.move('back'); assert.equal(clearGame.scene.id,1); assert.equal(clearGame.cleared,true);
  clearGame.reset();assert.equal(clearGame.cleared,false);assert.equal(clearGame.scene.id,0);
  assert.ok(clearGame.status.level===1);
  console.log('Cave: pixel materials, all floor routes, single-cell doorway, wall blocking, field round trips and no default enemies passed.');
  console.log('Demon castle: bridge/field route, all hall passages, purple/red throne messages, boss prebattle cancellation and Lv1→king reward→royal gear→travel→GAME CLEAR/reset passed.');
  console.log('TQ v9: all three local-palette codecs, Python/Web parity, truncation/invalid palettes and v8 preservation passed.');
} finally { rmSync(temporary, { recursive: true, force: true }); }
