import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../node_modules/vite/dist/node/index.js';
const root = fileURLToPath(new URL('../..', import.meta.url)), out = mkdtempSync(join(tmpdir(), 'tq-demos-'));
try {
  await build({ configFile: false, logLevel: 'silent', build: { lib: { entry: Object.fromEntries([
    ['presets', 'editor/adventure-presets'], ['adventure', 'editor/adventure'], ['model', 'editor/model'],
    ['validation', 'editor/validation'], ['url', 'codec/nfc-url'], ['world', 'game/world'],
    ['walking', 'game/walking'], ['exits', 'data/stage-exits'], ['combat', 'data/encounters/combat-config'], ['dialogues', 'data/interactions'],
    ['renderer', 'renderer/compiled-scene'], ['materials', 'renderer/adventure-materials'], ['locations', 'game/location-names'],
  ].map(([name, file]) => [name, join(root, `web/src/${file}.ts`)])), formats: ['es'], fileName: (_, name) => `${name}.mjs` }, outDir: out } });
  const read = name => import(pathToFileURL(join(out, `${name}.mjs`)).href);
  const { createAdventurePreset, appendAdventurePreset } = await read('presets');
  const { createAdventureWorld } = await read('adventure'), { initialWorld, encodeWorld, History, parseWorld, toSceneData } = await read('model');
  const { validateWorld } = await read('validation'), { readGameHash, nfcBudget, defaultPublicBase } = await read('url');
  const { createWorldGame } = await read('world');
  const { inferLocationName } = await read('locations');
  const { canStand, interactionTarget, createWalkingGame } = await read('walking'), { exitArrival } = await read('exits');
  const { drawCompiledScene, entityCollisionFrame } = await read('renderer');
  const { adventureMaterials } = await read('materials');
  const { playerConfig } = await read('combat');
  const { dialogueTemplates, dialogueText } = await read('dialogues');
  const steps = [['back', 0, -16], ['front', 0, 16], ['left', -16, 0], ['right', 16, 0]];
  function playThrough(scenes, size) {
    // Strong test stats isolate map/event correctness from the separately tested combat balance.
    const game = createWorldGame(scenes, 0, () => 0.999999, { player: { ...playerConfig, stats: { hp: 999, attack: 40, defense: 99 } } });
    const drain = () => { for (let n = 0; game.message && !game.encounter; n++) { assert.ok(n < 20); game.interact(); } };
    const sceneAt = id => id === game.scene.id ? { ...game.scene, entities: game.visibleEntities } : scenes.find(s => s.id === id);
    function travel(goal) {
      const queue = [{ id: game.scene.id, ...game.position, parent: -1 }], seen = new Set();
      for (let i = 0; i < queue.length; i++) {
        const p = queue[i], key = `${p.id}:${p.x},${p.y}`;
        if (seen.has(key)) continue; seen.add(key);
        const facing = goal(p, sceneAt(p.id));
        if (facing) {
          const route = []; let index = i;
          while (queue[index].parent !== -1) { route.push(queue[index]); index = queue[index].parent; }
          for (const step of route.reverse()) {
            assert.equal(game.move(step.direction), true, `${size}: a real movement follows the authored route`); drain();
            assert.equal(game.scene.id, step.id); assert.deepEqual(game.position, { x: step.x, y: step.y });
          }
          return facing;
        }
        const scene = sceneAt(p.id);
        for (const [direction, dx, dy] of steps) {
          let next = { x: p.x + dx, y: p.y + dy }, id = p.id;
          const passable = Array.from({ length: 16 }, (_, n) => ({ x: p.x + dx / 16 * (n + 1), y: p.y + dy / 16 * (n + 1) })).every(pos => canStand(scene, pos));
          const outside = next.x < 0 || next.y < -16 || next.x + 16 > scene.width * 16 || next.y + 32 > scene.height * 16;
          const exitPos = passable ? next : p;
          const exit = (passable || outside) && scene.exits?.find(e => e.x * 16 === exitPos.x && e.y * 16 - 16 === exitPos.y);
          if (exit) { id = exit.targetStageId; next = exitArrival(exit); }
          else if (!passable) continue;
          queue.push({ id, ...next, direction, parent: i });
        }
      }
      assert.fail(`${size}: no playable route to the target`);
    }
    for (const scene of scenes) travel(p => p.id === scene.id && 'front');
    function talk(role) {
      const matches = e => e.dialogue?.type === 'template' && (typeof role === 'number' ? e.dialogue.id === role : dialogueTemplates[e.dialogue.id].storyRole === role);
      const scene = scenes.find(s => s.entities.some(matches));
      const entity = scene.entities.find(matches);
      const facing = travel((p, visible) => p.id === scene.id && steps.find(([direction]) => {
        const target = interactionTarget(visible, p, direction);
        const candidate = target === undefined ? null : visible.entities[target];
        return candidate?.x === entity.x && candidate.y === entity.y && candidate.kind === entity.kind;
      })?.[0]);
      assert.equal(game.move(facing), false); game.interact();
      assert.equal(game.message.text, dialogueText(entity.dialogue, game.cleared));
      assert.equal(game.message.speaker, dialogueTemplates[entity.dialogue.id].speaker ?? '');
      drain();
    }
    assert.match(game.story.objective, /森の妖精と洞窟の魔女/);
    if (size === 'large') {
      for (const id of [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71]) talk(id);
      assert.match(game.story.objective, /森の妖精と洞窟の魔女/, 'optional conversations do not skip the main story');
    }
    talk('forest'); assert.match(game.story.objective, /森の妖精と洞窟の魔女/);
    talk('cave');
    if (size === 'large') {
      assert.match(game.story.objective, /北の城/); talk('north-king');
      assert.match(game.story.objective, /奥深い森と水晶の洞窟/); talk('deep-forest'); talk('crystal-cave');
      assert.match(game.story.objective, /古城の遺跡/); talk('ruins');
    }
    assert.match(game.story.objective, /魔王城/);
    const cave = scenes.find(s => s.id === (size === 'large' ? 9 : 4));
    const chest = cave.entities.findIndex(e => e.kind === 'treasure-chest');
    let facing = travel((p, scene) => p.id === cave.id && steps.find(([direction]) => interactionTarget(scene, p, direction) === chest)?.[0]);
    assert.equal(game.move(facing), false); // Face the chest without moving through it.
    const itemId = cave.entities[chest].itemId, previous = game.inventory.find(item => item.itemId === itemId)?.count ?? 0;
    game.interact(); assert.ok(game.message); drain();
    assert.equal(game.inventory.find(item => item.itemId === itemId).count, previous + 1);
    assert.equal(game.openedChests.size, 1);
    const bossScene = scenes.find(s => s.entities.some(e => e.battleEvent?.clear));
    const boss = bossScene.entities.findIndex(e => e.battleEvent?.clear);
    facing = travel((p, scene) => p.id === bossScene.id && steps.find(([direction]) => interactionTarget(scene, p, direction) === boss)?.[0]);
    assert.equal(game.move(facing), false); game.interact(); assert.ok(game.message); drain();
    assert.equal(game.encounter.enemyId, 4);
    const expectedAttacks = Math.ceil(game.battle.enemyHp / Math.max(1, game.battle.player.stats.attack - game.battle.enemy.stats.defense));
    for (let turn = 0; game.battle.phase !== 'victory'; turn++) {
      assert.ok(turn < expectedAttacks); game.battle.attack();
      if (game.battle.phase !== 'victory') { game.battle.advance(); game.battle.advance(); }
    }
    game.finishEncounter('victory'); assert.equal(game.cleared, true); assert.match(game.message.text, /灯火が空へ昇る/); drain();
    assert.ok(!game.visibleEntities.some(e => e.battleEvent?.clear));
    talk('forest'); if (size === 'large') { talk('north-king'); talk(60); talk(63); }
    assert.match(game.story.objective, /灯火は戻った/);
    travel(p => p.id === 0 && 'front'); assert.equal(game.cleared, true, 'the cleared world remains explorable');
    game.reset(); assert.equal(game.cleared, false); assert.equal(game.scene.id, 0); assert.deepEqual(game.inventory, []);
    assert.match(game.story.objective, /森の妖精と洞窟の魔女/);
  }
  const sizes = ['normal', 'large', 'small'], worlds = sizes.map(createAdventurePreset);
  assert.deepEqual(worlds[0], createAdventureWorld(), 'the existing adventure stays the normal sample');
  assert.deepEqual(worlds.map(w => w.stages.length), [6, 15, 6]);
  const cells = world => world.stages.reduce((sum, stage) => sum + stage.width * stage.height, 0);
  assert.ok(cells(worlds[1]) > cells(worlds[0]) * 2, 'large is a bigger connected world, not just a renamed copy');
  assert.ok(cells(worlds[2]) < cells(worlds[0]));
  const caves = worlds[1].stages.filter(stage => stage.name === 'cave' || stage.name.includes('洞窟'));
  assert.equal(caves.length, 2); assert.notDeepEqual(caves[0].floor, caves[1].floor);
  const east = worlds[1].stages.find(stage => stage.id === 10);
  assert.equal(east.entities.find(e => e.x === 24 * 16 && e.y === 22 * 16).kind, 'world-ruins');
  assert.equal(east.exits.find(e => e.x === 24 && e.y === 22).targetStageId, 11);
  assert.equal(east.entities.find(e => e.x === 8 * 16 && e.y === 27 * 16).kind, 'world-town');
  assert.equal(east.exits.find(e => e.x === 8 && e.y === 27).targetStageId, 13);
  assert.ok(!worlds[1].stages.find(s => s.id === 14).encounter, 'the flower garden is a peaceful optional stop');
  assert.equal(worlds[1].stages.find(s => s.id === 8).entities.find(e => e.kind === 'signpost').dialogue.id, 66);
  assert.equal(worlds[1].stages.find(s => s.id === 14).entities.find(e => e.kind === 'signpost').dialogue.id, 71);
  assert.match(dialogueTemplates[71].text, /南の小道は奥深い森/);
  assert.doesNotMatch(dialogueTemplates[71].text, /北：妖精の花園/);
  for (const id of [55, 56]) assert.match(dialogueTemplates[id].text, /東の大陸.*水晶の洞窟/);
  for (const { sprite } of Object.values(adventureMaterials)) {
    assert.equal(sprite.pixels.length, sprite.height);
    for (const row of sprite.pixels) {
      assert.equal(row.length, sprite.width);
      for (const pixel of row) if (pixel !== '.') assert.ok(parseInt(pixel, 36) < sprite.palette.length);
    }
  }
  for (const kind of ['signpost', 'cave-crystal', 'stone-tablet']) {
    const scene = toSceneData(parseWorld({ id: 0, name: kind, width: 4, height: 5, spawn: { x: 16, y: 32 }, spawnAnchor: 'frame',
      floor: { default: 'meadow-flowers', rectangles: [] }, entities: [{ kind, x: 16, y: kind === 'signpost' ? 32 : 16, parameters: [], dialogue: { type: 'template', id: 68 }, itemId: 2 }] }).stages[0]);
    const game = createWalkingGame(scene);
    assert.equal(game.move('back'), false, 'feet collide with the new prop'); game.interact();
    assert.equal(game.message.text, dialogueTemplates[68].text); game.interact();
    assert.match(game.message.text, /まほうの水/); game.interact();
    game.interact(); game.interact(); assert.equal(game.message, null);
    assert.deepEqual(game.inventory, [{ itemId: 2, count: 1 }], 'a prop reward is credited only once');
    if (kind === 'cave-crystal') {
      assert.deepEqual(entityCollisionFrame(scene.entities[0]), { x: 16, y: 32, width: 16, height: 16 });
      assert.equal(canStand(scene, { x: 16, y: 0 }), true, 'the upper part of a crystal allows walking behind it');
      const actor = { image: {}, sourceX: 0, sourceY: 0, width: 32, height: 32 };
      for (const [y, crystalInFront] of [[0, true], [32, false]]) {
        const calls = [];
        drawCompiledScene({ fillStyle: '', fillRect(x, y) { calls.push({ color: this.fillStyle, x, y }); }, drawImage() { calls.push({ hero: true }); } },
          { ...scene, spawn: { x: 16, y } }, { king: actor, player: actor });
        assert.equal(calls.findIndex(c => c.color === '#e4f5e5' && c.x === 23 && c.y === 18) > calls.findIndex(c => c.hero), crystalInFront);
      }
    }
  }
  for (const [index, size] of sizes.entries()) {
    const world = worlds[index], original = structuredClone(world);
    const issues = validateWorld(world).filter(issue => !issue.text.includes('開始位置なし'));
    assert.deepEqual(issues, [], `${size}: every exit, conversation, chest and boss is reachable`);
    for (const compact of [false, true]) {
      const encoded = encodeWorld(world, compact), file = join(out, `${size}-${compact}.json`);
      writeFileSync(file, JSON.stringify(world));
      execFileSync('python3', [join(root, 'compiler/build.py'), '--maps', file, ...(compact ? ['--compact'] : []), '--out', join(out, 'world.bin')], { stdio: 'pipe' });
      assert.deepEqual(Buffer.from(encoded.bytes), readFileSync(join(out, 'world.bin')), `${size}: Python/Web parity`);
      const budget = nfcBudget(encoded.bytes, defaultPublicBase(), 496, 5), scenes = readGameHash(new URL(budget.url).hash);
      assert.equal(scenes[0].encounter.rate, 0.1, `${size}: the hidden king stays at 0.1% after URL replay`);
      assert.equal(scenes.length, world.stages.length);
      const expectedNames = size === 'large'
        ? ['お城', '街', 'フィールド', '森', '洞窟', '魔王城', 'フィールド', '街', '奥深い森', '水晶の洞窟', 'フィールド', '古城の遺跡', '北の城', '海辺の集落', '妖精の花園']
        : ['お城', '街', 'フィールド', '森', '洞窟', '魔王城'];
      assert.deepEqual(scenes.map(inferLocationName), expectedNames, 'location names survive URL decoding without serialized names');
      for (const scene of scenes) assert.equal(inferLocationName({ ...scene, id: 230 }), inferLocationName(scene), 'location inference ignores stage IDs');
      const tiles = (id, x, y) => scenes.find(s => s.id === id).tiles[y * scenes.find(s => s.id === id).width + x];
      if (size !== 'small') {
        for (const id of size === 'large' ? [0, 12] : [0]) {
          for (let x = 1; x <= 3; x++) assert.equal(tiles(id, x, 6), 0, 'the partition has been removed, revealing marble');
        }
        for (let y = 2; y <= 20; y++) for (let x = 25; x <= 30; x++) assert.equal(tiles(2, x, y), 14, 'the inaccessible eastern island is sea');
      }
      if (size === 'large') {
        for (const [x, y] of [[20, 6], [21, 6], [21, 5], [22, 5], [23, 5], [23, 4]]) assert.equal(tiles(2, x, y), 8, 'a dirt road leads from the bridge to the exit');
        assert.ok(scenes.find(s => s.id === 2).entities.some(e => e.kind === 'signpost' && e.dialogue?.id === 70));
        assert.ok(scenes.find(s => s.id === 9).entities.some(e => e.kind === 'treasure-chest' && e.x >= 192 && e.x < 304 && e.y >= 160 && e.y < 224), 'the central crystal chamber rewards exploration');
      }
      if (size === 'small') {
        assert.equal(tiles(1, 0, 6), 9, 'the town exit continues the brick road');
        assert.deepEqual(scenes.find(s => s.id === 1).entities.find(e => e.kind === 'house-red').dialogue, { type: 'template', id: 40 });
        const forest = scenes.find(s => s.id === 3), fairy = forest.entities.find(e => e.kind === 'forest-fairy');
        for (const tree of forest.entities.filter(e => e.kind === 'tree')) {
          assert.ok(fairy.x + 16 <= tree.x || fairy.x >= tree.x + 48 || fairy.y + 32 <= tree.y || fairy.y >= tree.y + 48, 'the fairy does not overlap a tree canopy');
        }
      }
      const game = createWorldGame(scenes, scenes.find(scene => scene.spawn).id, () => 0.999999);
      assert.ok(game.position);
      assert.equal(scenes.flatMap(s => s.entities).filter(e => e.battleEvent?.clear).length, 1);
      if (compact) {
        const artifacts = join(root, size === 'normal' ? 'art/adventure' : `art/adventure-${size}`);
        assert.deepEqual(readFileSync(join(artifacts, 'world.bin')), Buffer.from(encoded.bytes), 'exported binary matches the authored world');
        assert.deepEqual(JSON.parse(readFileSync(join(artifacts, 'world.json'), 'utf8')), world);
        assert.deepEqual(readGameHash(new URL(readFileSync(join(artifacts, 'world.url.txt'), 'utf8').trim()).hash), scenes);
        const report = JSON.parse(readFileSync(join(artifacts, 'world.report.json'), 'utf8'));
        assert.equal(report.binary_bytes, encoded.bytes.length); assert.equal(report.ndef_tlv_bytes, budget.ndefBytes);
        playThrough(scenes, size);
      }
      if (size === 'small' && compact) {
        assert.ok(budget.urlBytes <= 490); assert.ok(budget.remainingBytes >= 0, 'small fits NTAG215 including the public URL and a 5B reserve');
        assert.deepEqual(scenes.find(s => s.id === 3).encounter.enemies.map(e => e.enemyId), [1, 2, 3]);
        assert.deepEqual(scenes.find(s => s.id === 4).encounter.enemies.map(e => e.enemyId), [5, 6, 7]);
        assert.equal(scenes[0].encounter.rate, 0.1);
        console.log(`Small six-map world: ${encoded.bytes.length}B binary / ${budget.urlBytes}B URL / ${budget.ndefBytes}B NDEF / ${budget.remainingBytes}B spare after 5B reserve.`);
      }
    }
    assert.deepEqual(world, original);
    const history = new History(initialWorld()), before = structuredClone(history.world);
    const active = appendAdventurePreset(history.world, size); history.commit(before);
    assert.ok(history.world.stages.some(stage => stage.id === active));
    assert.equal(new Set(history.world.stages.map(stage => stage.id)).size, history.world.stages.length);
    encodeWorld(history.world, true); history.undo(); assert.deepEqual(history.world, before, 'adding any size can be undone without changing prior edits');
    world.stages[0].name = 'edited'; assert.notEqual(createAdventurePreset(size).stages[0].name, 'edited');
  }
  assert.throws(() => createAdventurePreset('unknown'));
  console.log('Three demo sizes: independent fixed maps, two distinct caves, real movement through every map, chest pickup, boss victory/clear/return/reset, Python parity, Vercel restoration, NFC budget and reversible ID remapping passed.');
} finally { rmSync(out, { recursive: true, force: true }); }
