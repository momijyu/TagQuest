// Deterministic encounter draws, one-time king lifecycle and NFC binary contract.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../node_modules/vite/dist/node/index.js';
const root = fileURLToPath(new URL('../..', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'tagquest-encounters-'));
try {
  await build({ configFile: false, logLevel: 'silent', build: {
    lib: { entry: { model: join(root, 'web/src/editor/model.ts'), decoder: join(root, 'web/src/codec/scenes.ts'),
      world: join(root, 'web/src/game/world.ts') }, formats: ['es'], fileName: (_, name) => `${name}.mjs` }, outDir: temporary, emptyOutDir: false,
  } });
  const { initialWorld, parseWorld, encodeWorld } = await import(pathToFileURL(join(temporary, 'model.mjs')).href);
  const { decodeScenes } = await import(pathToFileURL(join(temporary, 'decoder.mjs')).href);
  const { createWorldGame } = await import(pathToFileURL(join(temporary, 'world.mjs')).href);
  // Escape lifecycle fixtures explicitly opt in; production bosses forbid escape.
  const escapableKing = { ...JSON.parse(readFileSync(join(root, 'web/src/data/encounters/enemies/king.json'), 'utf8')), canEscape: true };
  function finish(game, outcome) {
    if (outcome === 'escape') game.battle.escape();
    else {
      while (game.battle.phase !== 'victory') {
        assert.notEqual(game.battle.phase, 'defeat');
        if (game.battle.phase === 'commands') game.battle.attack();
        else game.battle.advance();
      }
    }
    game.finishEncounter(outcome);
    if (outcome === 'victory' && game.message) game.interact(); // Close growth/royal auto-equip notice before walking again.
  }
  const stage = id => ({ id, name: `ステージ${id}`, width: 6, height: 6, spawn: { x: 16, y: 48 },
    spawnAnchor: 'frame', npcAnchor: 'frame', floor: { default: 'grass', rectangles: [] },
    entities: [{ kind: 'king', x: 48, y: 32, parameters: [1], dialogue: { type: 'template', id: 1 } }],
    exits: [], encounter: { enabled: true, enemyId: 0, rate: 10 } });
  const scenes = input => decodeScenes(encodeWorld(parseWorld(input)).bytes);
  const original = scenes(stage(0)), snapshot = structuredClone(original);
  const sequence = [0.9, 0.9, 0]; let draws = 0;
  const game = createWorldGame(original, 0, () => sequence[draws++] ?? 0);
  assert.equal(draws, 0); game.interact(); assert.equal(draws, 0); // spawn and ordinary interactions never draw
  game.move('right'); game.move('back'); assert.equal(draws, 2); assert.equal(game.encounter, null);
  assert.equal(game.move('right'), false); assert.equal(draws, 2); // king blocks feet
  game.move('front'); assert.equal(draws, 3);
  assert.deepEqual(game.encounter, { enemyId: 0, name: '王様', stageId: 0 });
  assert.equal(game.message.text, '王様があらわれた！');
  assert.equal(game.visibleEntities.some(e => e.kind === 'king'), true); // encounter alone never removes the king
  assert.equal(game.move('left'), false); assert.equal(draws, 3);
  game.interact(); assert.ok(game.encounter); // field interaction cannot dismiss a battle
  assert.throws(() => game.finishEncounter('victory')); // unearned victory cannot remove the king
  finish(game, 'victory'); assert.equal(game.encounter, null);
  assert.equal(game.visibleEntities.some(e => e.kind === 'king'), false);
  game.move('back'); assert.equal(game.move('right'), true); assert.equal(draws, 3); // disappearance also removes collision
  game.interact(); assert.equal(game.message, null); // no invisible king conversation
  assert.deepEqual(original, snapshot);
  game.reset(); assert.equal(game.visibleEntities.some(e => e.kind === 'king'), true);
  game.move('right'); assert.ok(game.encounter); assert.equal(draws, 4);

  const sample = decodeScenes(encodeWorld(initialWorld()).bytes);
  let sampleDraws = 0; const castle = createWorldGame(sample, 0, () => { sampleDraws++; return 0; }, { enemies: [escapableKing] });
  castle.move('left'); assert.ok(castle.encounter); finish(castle, 'escape');
  castle.move('right'); assert.equal(castle.scene.id, 1);
  castle.move('back'); assert.equal(castle.scene.id, 0);
  assert.equal(castle.visibleEntities.some(e => e.kind === 'king'), true); // escape persists across a castle/town round trip
  castle.move('left'); assert.ok(castle.encounter); finish(castle, 'victory');
  castle.move('right'); assert.equal(castle.scene.id, 1);
  castle.move('back'); assert.equal(castle.scene.id, 0);
  assert.equal(castle.visibleEntities.some(e => e.kind === 'king'), false);
  assert.equal(castle.move('back'), true); assert.equal(castle.move('back'), true);
  assert.equal(castle.move('back'), false); castle.interact(); assert.match(castle.message.text, /玉座だ/);
  castle.interact(); assert.equal(castle.message, null);
  assert.equal(sampleDraws, 2); // retries before victory, then no more draws after victory

  for (const config of [undefined, { enabled: false, enemyId: 0, rate: 100 }, { enabled: true, enemyId: 0, rate: 0 }]) {
    const s = stage(0); if (config) s.encounter = config; else delete s.encounter;
    let count = 0; const off = createWorldGame(scenes(s), 0, () => { count++; return 0; });
    off.move('right'); off.move('front'); assert.equal(count, 0); assert.equal(off.encounter, null);
    assert.ok(off.visibleEntities.some(e => e.kind === 'king'));
  }
  for (const [value, hit] of [[0.1, false], [0.099999, true], [0, true], [0.999999, false]]) {
    let count = 0; const boundary = createWorldGame(original, 0, () => { count++; return value; });
    boundary.move('right'); assert.equal(Boolean(boundary.encounter), hit); assert.equal(count, 1);
  }
  const guaranteed = stage(0); guaranteed.encounter.rate = 100;
  for (const [value, hit] of [[0.004999, true], [0.005, false], [0.5, false]]) {
    const rare = stage(0); rare.encounter.rate = 0.5;
    const game = createWorldGame(scenes(rare), 0, () => value);
    game.move('right'); assert.equal(Boolean(game.encounter), hit, 'half-percent rate uses the exact probability boundary');
  }
  assert.equal(initialWorld().stages[0].encounter.rate, 0.1);
  for (const [value, hit] of [[0, true], [0.00099999, true], [0.001, false], [0.999999, false]]) {
    const rare = stage(0); rare.encounter.rate = 0.1;
    for (const compact of [false, true]) {
      const restored = decodeScenes(encodeWorld(parseWorld(rare), compact).bytes);
      const game = createWorldGame(restored, 0, () => value);
      game.move('right'); assert.equal(Boolean(game.encounter), hit, '0.1% king uses the exact one-in-a-thousand boundary after URL-format encoding');
    }
  }
  const always = createWorldGame(scenes(guaranteed), 0, () => 0.999999); always.move('right'); assert.ok(always.encounter);
  for (const outcome of ['escape']) {
    const retry = createWorldGame(scenes(guaranteed), 0, () => 0, { enemies: [escapableKing] });
    retry.finishEncounter('victory'); // no encounter cannot mark a king defeated
    assert.ok(retry.visibleEntities.some(e => e.kind === 'king'));
    retry.move('right'); finish(retry, outcome);
    assert.ok(retry.visibleEntities.some(e => e.kind === 'king'));
    assert.equal(retry.move('back'), true); // successful step retries the encounter
    assert.ok(retry.encounter); finish(retry, outcome);
    assert.equal(retry.move('right'), false); // king still blocks the path
    retry.interact(); assert.match(retry.message.text, /よく来た/); // and still talks
  }
  const wall = stage(0); wall.floor.rectangles.push({ tile: 'wall-top', x: 2, y: 4, width: 1, height: 1 });
  let wallDraws = 0; const blocked = createWorldGame(scenes(wall), 0, () => { wallDraws++; return 0; });
  assert.equal(blocked.move('right'), false); assert.equal(wallDraws, 0);
  const talk = stage(0); talk.entities[0].x = 16;
  let talkDraws = 0; const talking = createWorldGame(scenes(talk), 0, () => { talkDraws++; return 0; });
  talking.move('back'); talking.interact(); assert.match(talking.message.text, /よく来た/);
  talking.move('right'); talking.interact(); assert.equal(talkDraws, 0); assert.equal(talking.encounter, null);

  // Transfers take precedence and carry the global once-only state, even to maps not visited yet.
  const a = stage(0), b = stage(1), c = stage(2); a.encounter.rate = 100; delete b.encounter; delete c.encounter;
  a.exits = [{ x: 2, y: 4, targetStageId: 1, targetX: 1, targetY: 4, direction: 'front' },
    { x: 0, y: 5, targetStageId: 2, targetX: 1, targetY: 4, direction: 'back' }];
  b.exits = [{ x: 1, y: 5, targetStageId: 0, targetX: 1, targetY: 4, direction: 'back' }];
  let transferDraws = 0; const travel = createWorldGame(scenes([a, b, c]), 0, () => { transferDraws++; return 0; });
  travel.move('right'); assert.equal(travel.scene.id, 1); assert.equal(transferDraws, 0);
  travel.move('right'); assert.equal(transferDraws, 0); travel.move('left'); travel.move('front');
  assert.equal(travel.scene.id, 0); assert.equal(transferDraws, 0);
  travel.move('left'); assert.ok(travel.encounter); assert.equal(transferDraws, 1); finish(travel, 'victory');
  travel.move('front'); assert.equal(travel.scene.id, 2); assert.equal(travel.visibleEntities.some(e => e.kind === 'king'), false);
  travel.reset(); assert.equal(travel.scene.id, 0); assert.ok(travel.visibleEntities.some(e => e.kind === 'king'));
  travel.move('right'); assert.ok(travel.visibleEntities.some(e => e.kind === 'king'));

  // A pickup completes its message before an encounter from that same step is shown.
  const lootStage = stage(0); lootStage.encounter.rate = 100;
  lootStage.entities.push({ kind: 'loot', x: 32, y: 64, parameters: [0], itemId: 0 });
  let lootDraws = 0; const loot = createWorldGame(scenes(lootStage), 0, () => { lootDraws++; return 0; }, { enemies: [escapableKing] });
  loot.move('right'); assert.equal(loot.message.text, 'やくそうを手に入れた！'); assert.equal(loot.encounter, null);
  assert.ok(loot.visibleEntities.some(e => e.kind === 'king'));
  loot.move('front'); assert.equal(lootDraws, 1); loot.interact();
  assert.equal(loot.message.text, '王様があらわれた！'); assert.equal(lootDraws, 1);
  finish(loot, 'escape'); assert.deepEqual(loot.inventory, [{ itemId: 0, count: 1 }]);
  const pickupExit = structuredClone(a); pickupExit.entities.push({ kind: 'loot', x: 32, y: 64, parameters: [0], itemId: 0 });
  let exitDraws = 0; const priority = createWorldGame(scenes([pickupExit, b, c]), 0, () => { exitDraws++; return 0; });
  priority.move('right'); assert.equal(priority.scene.id, 0); priority.interact();
  assert.equal(priority.scene.id, 1); assert.equal(exitDraws, 0);

  // Disabled choices and exact percentage boundaries survive Web/Python/binary round trips.
  const json = join(temporary, 'input.json'), binary = join(temporary, 'out.bin');
  for (const settings of [undefined, { enabled: true, enemyId: 0, rate: 0 }, { enabled: false, enemyId: 0, rate: 37 },
    { enabled: true, enemyId: 0, rate: 1 }, { enabled: true, enemyId: 0, rate: 100 },
    { enabled: true, enemyId: 0, rate: 0.5 }, { enabled: false, enemyId: 0, rate: 0.01 }, { enabled: true, enemyId: 1, rate: 99.99 },
    ...[1, 2, 3].map(enemyId => ({ enabled: true, enemyId, rate: 25 }))]) {
    const input = stage(0); if (settings) input.encounter = settings; else delete input.encounter;
    const world = parseWorld(input), encoded = encodeWorld(world);
    writeFileSync(json, JSON.stringify(world)); execFileSync('python3', ['compiler/build.py', '--maps', json, '--out', binary], { cwd: root });
    assert.deepEqual(Buffer.from(encoded.bytes), readFileSync(binary));
    assert.deepEqual(decodeScenes(encoded.bytes)[0].encounter, settings);
    assert.equal(encoded.reports[0].encounterBytes, settings ? Number.isInteger(settings.rate) ? 2 : 7 : 1);
  }
  for (const bad of [null, [], {}, { enabled: 1, enemyId: 0, rate: 10 }, { enabled: true, enemyId: true, rate: 10 },
    { enabled: true, enemyId: 255, rate: 10 }, { enabled: true, enemyId: 0, rate: -1 },
    { enabled: true, enemyId: 0, rate: 101 }, { enabled: true, enemyId: 0, rate: 0.001 }, { enabled: true, enemyId: 0, rate: true }]) {
    const input = stage(0); input.encounter = bad; assert.throws(() => parseWorld(input));
    writeFileSync(json, JSON.stringify(input));
    assert.throws(() => execFileSync('python3', ['compiler/build.py', '--maps', json, '--out', binary], { cwd: root, stdio: 'pipe' }));
  }
  const table={enabled:true,enemyId:1,rate:100,enemies:[{enemyId:1,weight:60},{enemyId:2,weight:30},{enemyId:3,weight:10}]};
  // Test the unnormalized model boundary too: parseWorld normally removes a one-entry table.
  for(const compact of [false,true]) {
    const world=parseWorld(stage(0));
    world.stages[0].encounter={enabled:true,enemyId:0,rate:10,enemies:[{enemyId:1,weight:60}]};
    const encoded=encodeWorld(world,compact);assert.equal(encoded.bytes[2],compact?11:8);
    const py=execFileSync('python3',['-c',`import sys,json;sys.path.insert(0,'compiler');from build import compile_game;w=json.load(sys.stdin);sys.stdout.buffer.write(compile_game(w['stages'],compact=${compact?'True':'False'})[0])`],{cwd:root,input:JSON.stringify(world)});
    assert.deepEqual(Buffer.from(encoded.bytes),py);
    assert.deepEqual(decodeScenes(encoded.bytes)[0].encounter,{enabled:true,enemyId:1,rate:10});
  }
  for(const compact of [false,true]) for(const enabled of [false,true]) {
    const input=stage(0);input.encounter={...table,enabled};
    const world=parseWorld(input),encoded=encodeWorld(world,compact);assert.equal(encoded.bytes[2],12);
    assert.deepEqual(decodeScenes(encoded.bytes)[0].encounter,input.encounter);
    const py=execFileSync('python3',['-c',`import sys,json;sys.path.insert(0,'compiler');from build import compile_game;w=json.load(sys.stdin);sys.stdout.buffer.write(compile_game(w['stages'],compact=${compact?'True':'False'})[0])`],{cwd:root,input:JSON.stringify(world)});
    assert.deepEqual(Buffer.from(encoded.bytes),py);
    for(let end=0;end<encoded.bytes.length;end++)assert.throws(()=>decodeScenes(encoded.bytes.subarray(0,end)));
  }
  for(const [roll,id] of [[0,1],[0.59999,1],[0.6,2],[0.89999,2],[0.9,3],[0.99999,3]]) {
    const input=stage(0);input.encounter=table;let calls=0;
    const game=createWorldGame(scenes(input),0,()=>++calls===1?0:roll);game.move('right');assert.equal(game.encounter.enemyId,id);assert.equal(calls,2);
  }
  for(const enemies of [[],[{enemyId:1,weight:0}],[{enemyId:1,weight:256}],[{enemyId:255,weight:1}],[{enemyId:1,weight:1},{enemyId:1,weight:2}], [{enemyId:1,weight:1.5}]]) {
    const input=stage(0);input.encounter={...table,enemies};assert.throws(()=>parseWorld(input));
    writeFileSync(json,JSON.stringify(input));assert.throws(()=>execFileSync('python3',['compiler/build.py','--maps',json,'--out',binary],{cwd:root,stdio:'pipe'}));
  }
  // Defeating the once-only king removes only that choice, not the whole encounter table.
  const royalTable=stage(0);royalTable.encounter={...table,enemies:[{enemyId:0,weight:1},{enemyId:1,weight:1}]};
  const mixedKing=createWorldGame(scenes(royalTable),0,()=>0);mixedKing.move('right');assert.equal(mixedKing.encounter.enemyId,0);
  finish(mixedKing,'victory');mixedKing.move('left');assert.equal(mixedKing.encounter.enemyId,1);
  const valid = encodeWorld(parseWorld(stage(0))).bytes, offset = valid.length - 2;
  for (const control of [128, 102, 127, 255]) {
    const bad = valid.slice(); bad[offset] = control; assert.throws(() => decodeScenes(bad));
  }
  const unknown = valid.slice(); unknown[offset + 1] = 255; assert.throws(() => decodeScenes(unknown));
  for (let end = 0; end < valid.length; end++) assert.throws(() => decodeScenes(valid.subarray(0, end)));
  console.log('Encounters: step probability, exclusions, king retained/retry on escape or defeat, victory-only removal/collision, throne inspection after victory, transfers/reset and Python/binary parity passed.');
} finally { rmSync(temporary, { recursive: true, force: true }); }
