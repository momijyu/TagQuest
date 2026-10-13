import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../node_modules/vite/dist/node/index.js';
const root = fileURLToPath(new URL('../..', import.meta.url)), out = mkdtempSync(join(tmpdir(), 'tq-story-'));
try {
  await build({ configFile: false, logLevel: 'silent', build: { lib: { entry: Object.fromEntries([
    ['player', 'game/player-state'], ['world', 'game/world'], ['model', 'editor/model'], ['config', 'data/encounters/combat-config'],
  ].map(([name, file]) => [name, join(root, `web/src/${file}.ts`)])), formats: ['es'], fileName: (_, name) => `${name}.mjs` }, outDir: out } });
  const read = name => import(pathToFileURL(join(out, `${name}.mjs`)).href);
  const { createPlayerState } = await read('player'), { createWorldGame } = await read('world');
  const { parseWorld, toSceneData } = await read('model'), { playerConfig, enemyCatalog, parsePlayerDefinition } = await read('config');
  for (const percent of [0, 25, 50, 100]) for (const gold of [0, 1, 2, 99, 101, Number.MAX_SAFE_INTEGER]) {
    const state = createPlayerState({ ...playerConfig, initialGold: gold, defeatGoldLossPercent: percent });
    const retained = Number(BigInt(gold) * BigInt(100 - percent) / 100n);
    assert.equal(state.applyDefeatPenalty(), gold - retained); assert.equal(state.gold, retained);
  }
  for (const percent of [-1, 101, 1.5, true, '50', Infinity]) {
    assert.throws(() => parsePlayerDefinition({ ...playerConfig, defeatGoldLossPercent: percent }));
    assert.throws(() => createPlayerState({ ...playerConfig, defeatGoldLossPercent: percent }));
  }
  const base = { id: 0, name: '試験', width: 5, height: 5, spawn: { x: 0, y: 16 }, spawnAnchor: 'frame', npcAnchor: 'frame',
    floor: { default: 'grass', rectangles: [] }, entities: [], encounter: { enabled: true, enemyId: 1, rate: 100 } };
  const lethal = { ...enemyCatalog.find(e => e.id === 1), stats: { hp: 999, attack: 9999, defense: 0 }, reward: null };
  const player = { ...playerConfig, initialGold: 101, initialExperience: 60, initialItems: [{ itemId: 3, quantity: 1 }, { itemId: 0, quantity: 2 }] };
  const game = createWorldGame(parseWorld(base).stages.map(toSceneData), 0, () => 0, { player, enemies: [lethal], initialEquipment: [3] });
  const before = { inventory: game.inventory, equipment: game.status.equipment, xp: game.status.experience, level: game.status.level };
  game.move('right'); game.battle.guard(); game.battle.advance(); assert.equal(game.battle.phase, 'defeat');
  game.finishEncounter('defeat'); game.finishEncounter('defeat');
  assert.equal(game.status.gold, 50); assert.match(game.message.text, /51Gを失った.*残り50G/);
  assert.equal(game.status.hp, game.status.maxHp); assert.equal(game.status.mp, game.status.maxMp); assert.equal(game.status.poisoned, false);
  assert.deepEqual(game.position, base.spawn); assert.deepEqual({ inventory: game.inventory, equipment: game.status.equipment, xp: game.status.experience, level: game.status.level }, before);
  assert.equal(game.move('right'), false); game.interact(); assert.equal(game.message, null);
  game.move('right'); game.battle.escape(); game.finishEncounter('escape'); assert.equal(game.status.gold, 50);
  game.reset(); assert.equal(game.status.gold, 101);
  // A king using the northern story template is a separate friendly character, including before its map is first visited.
  const royalMaps = parseWorld([{ ...base, encounter: { enabled: true, enemyId: 0, rate: 100 },
    entities: [{ kind: 'king', x: 48, y: 0, parameters: [1], dialogue: { type: 'template', id: 46 } }],
    exits: [{ x: 2, y: 2, targetStageId: 1, targetX: 1, targetY: 2, direction: 'front' }] },
    { ...base, id: 1, spawn: null, encounter: undefined, entities: [{ kind: 'king', x: 48, y: 0, parameters: [0], dialogue: { type: 'template', id: 55 } }] }]).stages.map(toSceneData);
  const kings = createWorldGame(royalMaps, 0, () => 0, { player: { ...playerConfig, stats: { hp: 999, attack: 999, defense: 99 } } });
  kings.move('right'); kings.battle.attack(); kings.finishEncounter('victory');
  assert.equal(kings.visibleEntities.some(e => e.kind === 'king'), false);
  while (kings.message) kings.interact(); kings.move('right'); assert.equal(kings.scene.id, 1);
  assert.equal(kings.visibleEntities.some(e => e.kind === 'king'), true);
  kings.move('right'); kings.move('right'); assert.equal(kings.move('back'), false); kings.interact();
  assert.equal(kings.message.speaker, '北の王'); assert.match(kings.message.text, /援軍を送れなかった/); assert.equal(kings.encounter, null);
  kings.reset(); assert.equal(kings.visibleEntities.some(e => e.kind === 'king'), true);
  console.log('Defeat: exact gold loss/rounding/caps, configuration, one-time charge, message lock, equipment/items/XP retention, recovery, escape and reset; northern king isolation passed.');
} finally { rmSync(out, { recursive: true, force: true }); }
