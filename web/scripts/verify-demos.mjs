import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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
    const sceneAt = id => id === game.scene.id ? { ...game.scene, entities: game.visibleEntities } : game.stages.find(s => s.id === id);
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
    function winBattle() {
      const expectedAttacks = Math.ceil(game.battle.enemyHp / Math.max(1, game.battle.player.stats.attack - game.battle.enemy.stats.defense));
      for (let turn = 0; game.battle.phase !== 'victory'; turn++) {
        assert.ok(turn < expectedAttacks); game.battle.attack();
        if (game.battle.phase !== 'victory') { game.battle.advance(); game.battle.advance(); }
      }
      game.finishEncounter('victory');
    }
    if (size === 'large') {
      const bridge = scenes.find(scene => scene.id === 15);
      const guard = bridge.entities.find(entity => entity.kind === 'demon-guard');
      assert.equal(guard.battleEvent.clear, false);
      assert.equal(canStand(bridge, guard), false, 'the guard blocks the central bridge until defeated');
      assert.equal(canStand(bridge, { x: 25 * 16, y: 15 * 16 }), true, 'the eastern bridge provides a peaceful detour');
      const weak = createWorldGame(scenes.map(scene => scene.id === 15
        ? { ...scene, spawn: { x: 15 * 16, y: 16 * 16 } } : scene), 15, () => 0.999999,
        { player: { ...playerConfig, stats: { hp: 1, attack: 0, defense: 0 } } });
      assert.equal(weak.move('back'), false); weak.interact(); weak.interact();
      assert.equal(weak.encounter.enemyId, 8);
      weak.battle.guard(); weak.battle.advance(); assert.equal(weak.battle.phase, 'defeat');
      weak.finishEncounter('defeat');
      assert.equal(weak.cleared, false); assert.ok(weak.visibleEntities.some(entity => entity.kind === 'demon-guard'), 'defeat leaves the child boss available for a rematch');
      const faceGuard = () => travel((p, visible) => p.id === bridge.id && steps.find(([direction]) => {
        const target = interactionTarget(visible, p, direction);
        return target !== undefined && visible.entities[target].kind === 'demon-guard';
      })?.[0]);
      let facing = faceGuard();
      assert.equal(game.move(facing), false); game.interact(); drain();
      assert.equal(game.encounter.enemyId, 8); assert.equal(game.battle.enemy.canEscape, true);
      game.battle.escape(); game.finishEncounter('escape');
      assert.equal(game.cleared, false); assert.ok(game.visibleEntities.some(entity => entity.kind === 'demon-guard'));
      facing = faceGuard(); assert.equal(game.move(facing), false); game.interact(); drain();
      const gold = game.status.gold, experience = game.status.experience;
      winBattle(); drain();
      assert.equal(game.cleared, false, 'the child boss does not replace the final demon lord');
      assert.equal(game.status.gold, gold + 180); assert.equal(game.status.experience, experience + 180);
      assert.ok(!game.visibleEntities.some(entity => entity.kind === 'demon-guard'));
      assert.equal(canStand({ ...bridge, entities: game.visibleEntities }, guard), true, 'victory opens the short bridge');
      assert.equal(game.inventory.find(item => item.itemId === 19)?.count, 2);
      assert.equal(game.inventory.find(item => item.itemId === 2)?.count, 1);
      travel(p => p.id === 16 && 'front'); travel(p => p.id === 15 && 'front');
      assert.ok(!game.visibleEntities.some(entity => entity.kind === 'demon-guard'), 'the bridge guard does not respawn on return');
    }
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
    assert.match(game.story.objective, /王様に挨拶/);
    talk('departure'); assert.match(game.story.objective, /森の妖精と洞窟の魔女/);
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
    winBattle(); assert.equal(game.cleared, true); assert.match(game.message.text, /灯火が空へ昇る/); drain();
    assert.ok(!game.visibleEntities.some(e => e.battleEvent?.clear));
    talk('forest'); if (size === 'large') { talk('north-king'); talk(60); talk(63); }
    assert.match(game.story.objective, /灯火は戻った/);
    travel(p => p.id === 0 && 'front'); assert.equal(game.cleared, true, 'the cleared world remains explorable');
    game.reset(); assert.equal(game.cleared, false); assert.equal(game.scene.id, 0); assert.deepEqual(game.inventory, []);
    assert.match(game.story.objective, /王様に挨拶/);
    if (size === 'large') {
      travel(p => p.id === 15 && 'front');
      assert.ok(game.visibleEntities.some(entity => entity.kind === 'demon-guard'), 'reset restores the optional bridge battle');
    }
  }
  const sizes = ['normal', 'large', 'small'], worlds = sizes.map(createAdventurePreset);
  assert.deepEqual(worlds[0], createAdventureWorld(), 'the existing adventure stays the normal sample');
  assert.deepEqual(worlds.map(w => w.stages.length), [6, 18, 6]);
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
      assert.equal(scenes[0].encounter.rate, size === 'small' ? 1 : 0.01, `${size}: the king's configured rate survives URL replay`);
      for (const id of size === 'large' ? [3, 8, 16] : [3]) {
        assert.equal(scenes.find(scene => scene.id === id).encounter.rate, size === 'small' ? 12 : 6,
          `${size}: forest exploration uses the configured reduced rate without changing the NFC small world`);
      }
      for (const id of size === 'large' ? [4, 9] : [4]) {
        assert.equal(scenes.find(scene => scene.id === id).encounter.rate, size === 'small' ? 14 : 8,
          `${size}: cave exploration uses the configured reduced rate without changing the NFC small world`);
      }
      assert.equal(scenes.length, world.stages.length);
      assert.equal(scenes.flatMap(s => s.entities).filter(e => e.kind === 'treasure-chest').length, size === 'small' ? 2 : size === 'large' ? 45 : 12);
      if (size !== 'small') {
        for (const id of size === 'large' ? [1, 7, 13] : [1]) {
          const town = scenes.find(s => s.id === id);
          assert.equal(town.width, 29);
          assert.equal(town.entities.filter(e => ['house-red', 'house-slate'].includes(e.kind)).length, 4);
          assert.deepEqual(town.entities.filter(e => e.x === 416).map(e => e.dialogue?.id), [72, 73], 'new homes use dedicated templates');
        }
      }
      const expectedNames = size === 'large'
        ? ['お城', '街', 'フィールド', '森', '洞窟', '魔王城', '北の大陸', '北の市場', '奥深い森', '水晶の洞窟', '東の大陸', '古城の遺跡', '北の城', '海辺の集落', '妖精の花園', '辺境の大陸', '風渡りの森', '忘れられた砦']
        : ['お城', '街', 'フィールド', '森', '洞窟', '魔王城'];
      assert.deepEqual(scenes.map(inferLocationName), expectedNames, 'location names survive URL decoding without serialized names');
      for (const scene of scenes) assert.equal(inferLocationName({ ...scene, id: 230 }), inferLocationName(scene), 'location inference ignores stage IDs');
      const tiles = (id, x, y) => scenes.find(s => s.id === id).tiles[y * scenes.find(s => s.id === id).width + x];
      if (size !== 'small') {
        for (const id of size === 'large' ? [0, 12] : [0]) {
          for (let x = 1; x <= 3; x++) assert.equal(tiles(id, x, 6), 0, 'the partition has been removed, revealing marble');
        }
        for (let y = 2; y <= 20; y++) for (let x = 25; x <= 30; x++) assert.equal(tiles(2, x, y), 14, 'the inaccessible eastern island is sea');
        for (const [x, y] of [[19, 8], [19, 9], [20, 9], [19, 10], [20, 10], [1, 15]]) assert.equal(tiles(2, x, y), 14, 'isolated sandbars and the western false exit are sea');
        assert.equal(tiles(2, 2, 15), 15, 'the coast continues with sand instead of a grass projection');
      }
      if (size === 'large') {
        assert.equal(tiles(7, 12, 7), 11, 'the northern market has a wooden bridge across the moat');
        for (let y = 3; y <= 17; y++) assert.equal(tiles(8, 19, y), 8, 'the eastern forest path reaches the southern main road');
        for (let y = 6; y <= 17; y++) assert.equal(tiles(8, 5, y), 8, 'flowers do not overwrite the western forest path');
        for (let x = 0; x <= 24; x++) assert.ok([8, 11].includes(tiles(10, x, 16)), 'the east-west road and bridge reach the T junction');
        assert.equal(tiles(10, 24, 16), 8);
        for (let x = 25; x <= 31; x++) assert.notEqual(tiles(10, x, 16), 8, 'there is no misleading road through the eastern coastline');
        assert.equal(tiles(2, 23, 3), 15, 'the northern shore has no leftover grass square');
        for (const [x, y] of [[20, 6], [21, 6], [21, 5], [22, 5], [23, 5], [23, 4]]) assert.equal(tiles(2, x, y), 8, 'a dirt road leads from the bridge to the exit');
        assert.ok(scenes.find(s => s.id === 2).entities.some(e => e.kind === 'signpost' && e.dialogue?.id === 70));
        assert.ok(scenes.find(s => s.id === 9).entities.some(e => e.kind === 'treasure-chest' && e.x >= 192 && e.x < 304 && e.y >= 160 && e.y < 224), 'the central crystal chamber rewards exploration');
      }
      if (size === 'small') {
        assert.equal(tiles(1, 0, 6), 9, 'the town exit continues the brick road');
        assert.equal(scenes.find(s => s.id === 1).entities.find(e => e.kind === 'house-red').dialogue, undefined, 'small houses use the shared default inspection text');
        for (const [id, wall] of [[0, 2], [5, 20]]) {
          const scene = scenes.find(s => s.id === id), exit = scene.exits[0];
          for (let x = 0; x < scene.width; x++) assert.equal(tiles(id, x, 0), wall);
          for (let y = 1; y < scene.height - 1; y++) {
            assert.equal(tiles(id, 0, y), wall); assert.equal(tiles(id, scene.width - 1, y), wall);
          }
          for (let x = 0; x < scene.width; x++) assert.equal(tiles(id, x, scene.height - 1), x === exit.x ? id === 0 ? 1 : 19 : 12, 'the wall-base compression preserves the visible one-cell doorway');
        }
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
        assert.equal(createHash('sha256').update(encoded.bytes).digest('hex'), '183209444663027a9a3e0308fac0513ada6a0cfa1775f7dcacd8db08cba2950c',
          'normal/large exploration changes must preserve the small world verified on a real NTAG215');
        assert.equal(encoded.bytes[2], 14, 'integer encounters no longer require v15');
        assert.ok(encoded.bytes.length <= 310);
        assert.ok(budget.urlBytes <= 450, 'small public URLs leave room for real tag metadata');
        assert.ok(budget.ndefBytes <= 455);
        assert.ok(496 - budget.ndefBytes >= 40);
        assert.ok(budget.remainingBytes >= 40, 'at least 40B remains even after the extra 5B reserve');
        assert.ok(encoded.reports.find(r => r.id === 0).floorBytes <= 11);
        assert.ok(encoded.reports.find(r => r.id === 5).floorBytes <= 16);
        assert.ok(encoded.reports.find(r => r.id === 4).floorBytes <= 15);
        const kinds = scenes.flatMap(scene => scene.entities).map(entity => entity.kind);
        for (const kind of ['weapon-shop', 'armor-shop', 'item-shop', 'weapon-merchant', 'armor-merchant', 'item-merchant', 'forest-fairy', 'cave-witch', 'demon-lord']) assert.equal(kinds.filter(value => value === kind).length, 1, `${kind} remains in the compact world`);
        assert.equal(kinds.filter(kind => kind === 'treasure-chest').length, 2);
        assert.deepEqual(scenes.find(s => s.id === 3).encounter.enemies.map(e => e.enemyId), [1, 2, 3]);
        assert.deepEqual(scenes.find(s => s.id === 4).encounter.enemies.map(e => e.enemyId), [5, 6, 7]);
        assert.equal(scenes[0].encounter.rate, 1);
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
