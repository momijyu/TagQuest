import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../node_modules/vite/dist/node/index.js';
const root = fileURLToPath(new URL('../..', import.meta.url)), out = mkdtempSync(join(tmpdir(), 'tagquest-economy-'));
try {
  await build({ configFile: false, logLevel: 'silent', build: { lib: { entry: {
    state: join(root, 'web/src/game/player-state.ts'), world: join(root, 'web/src/game/world.ts'),
    battle: join(root, 'web/src/game/battle.ts'), config: join(root, 'web/src/data/encounters/combat-config.ts'),
    items: join(root, 'web/src/data/items.ts'), shops: join(root, 'web/src/data/shops.ts'),
  }, formats: ['es'], fileName: (_, name) => `${name}.mjs` }, outDir: out, emptyOutDir: false } });
  const module = async name => import(pathToFileURL(join(out, `${name}.mjs`)));
  const { createPlayerState, recoverItem } = await module('state');
  const { createWorldGame } = await module('world');
  const { createBattle } = await module('battle');
  const { playerConfig, enemyCatalog, parsePlayerDefinition, parseEnemyDefinitions } = await module('config');
  const { itemCatalog, findItem, parseItemCatalog } = await module('items');
  const { parseShopCatalog } = await module('shops');
  const player = createPlayerState();
  assert.equal(player.gold, 100); assert.deepEqual(player.inventory, []);
  assert.equal(player.buy(4).ok, true); assert.equal(player.gold, 20);
  assert.equal(player.equip(4).ok, true); assert.equal(player.definition.stats.attack, 17);
  assert.equal(player.sell(4).ok, false); assert.equal(player.gold, 20);
  assert.equal(player.buy(4).ok, false); assert.equal(player.gold, 20);
  assert.equal(player.equip(8).ok, false);
  player.unequip('weapon'); assert.equal(player.definition.stats.attack, 10);
  assert.equal(player.sell(4).ok, true); assert.equal(player.gold, 60); assert.deepEqual(player.inventory, []);
  assert.deepEqual(player.discoveredItems, [4], 'sold equipment remains recorded without extra inventory');
  assert.equal(player.discoveredItems.includes(8), false, 'failed item actions do not reveal undiscovered equipment');
  player.buy(3); player.equip(3); player.equip(3); assert.equal(player.definition.stats.attack, 13);
  player.addItem(4, 1); player.equip(4); assert.equal(player.definition.stats.attack, 17);
  assert.equal(player.inventory.find(i => i.itemId === 3).count, 1); // replaced weapon is retained
  player.addItem(4, 1); assert.equal(player.sell(4).ok, true); assert.equal(player.sell(4).ok, false); // reserve equipped copy
  for (const id of [5, 7, 8]) { player.addItem(id, 1); player.equip(id); }
  assert.equal(player.definition.stats.attack, 18); assert.equal(player.definition.stats.defense, 5);
  player.addItem(0, 2); assert.equal(player.useItem(0).ok, false); // full HP does not consume
  player.setVitals({ hp: 35, mp: 0, poisoned: true });
  assert.equal(player.useItem(0).ok, true); assert.equal(player.vitals.hp, 40);
  assert.ok(player.discoveredItems.includes(0), 'using an item retains its collection record');
  player.addItem(2, 1); player.useItem(2); assert.equal(player.vitals.mp, 10);
  player.addItem(1, 1); player.useItem(1); assert.equal(player.vitals.poisoned, false);
  assert.equal(player.useItem(0).ok, false); assert.equal(player.inventory.find(i => i.itemId === 0).count, 1);
  assert.equal(recoverItem(findItem(0), { hp: 1, mp: 10, poisoned: false }, 40, 10).vitals.hp, 21);
  let count = 2;
  const fight = createBattle(enemyCatalog[0], { playerHp: 10, playerMp: 0, wasAttacked: true, consumeItem: () => count > 0 && Boolean(count--) });
  assert.equal(fight.useItem(0).ok, true); assert.equal(fight.playerHp, 30); assert.equal(count, 1);
  assert.equal(fight.useItem(0).ok, false); assert.equal(count, 1); // one action per turn
  fight.advance(); assert.equal(fight.playerHp, 24); fight.advance();
  assert.equal(fight.useItem(2).ok, true); assert.equal(fight.playerMp, 10); assert.equal(count, 0);
  fight.advance(); fight.advance(); assert.equal(fight.useItem(0).ok, false); assert.equal(fight.phase, 'commands');
  const town = { id: 0, width: 6, height: 7, spawn: { x: 16, y: 48 }, tiles: new Uint8Array(42).fill(7),
    entities: [{ kind: 'item-merchant', x: 16, y: 32, parameters: [], dialogue: { type: 'custom', text: 'ようこそ' } },
      { kind: 'loot', x: 32, y: 64, parameters: [0], itemId: 0 }] };
  const game = createWorldGame([town], 0);
  game.move('back'); game.interact(); assert.equal(game.message.text, 'ようこそ'); game.interact();
  assert.equal(game.shop.merchant, 'item-merchant'); assert.equal(game.move('right'), false);
  assert.equal(game.buy(3).ok, false); assert.equal(game.buy(0).ok, true); assert.equal(game.status.gold, 92);
  assert.equal(game.sell(0).ok, true); assert.equal(game.status.gold, 96); game.closeShop();
  assert.equal(game.buy(0).ok, false); game.move('right'); game.interact(); // loot message dismissed
  assert.deepEqual(game.inventory, [{ itemId: 0, count: 1 }]);
  game.move('left'); game.move('back'); game.interact(); game.interact(); game.sell(0); game.closeShop();
  assert.deepEqual(game.inventory, []); game.move('right'); assert.deepEqual(game.inventory, []); // sold loot never re-credited
  game.reset(); assert.equal(game.status.gold, 100); assert.deepEqual(game.inventory, []);
  assert.deepEqual(game.discoveredItems, [], 'a new adventure resets the collection');
  const enemy = structuredClone(enemyCatalog[0]); enemy.canEscape = true; enemy.reward = { gold: 25, items: [{ itemId: 0, quantity: 2 }, { itemId: 3, quantity: 1 }] };
  const rewardWorld = { ...town, entities: [], encounter: { enabled: true, rate: 100, enemyId: 0 } };
  const rich = parsePlayerDefinition({ ...playerConfig, initialItems: [{ itemId: 3, quantity: 1 }, { itemId: 5, quantity: 1 }] });
  const winning = createWorldGame([rewardWorld], 0, () => 0, { player: rich, enemies: [enemy] });
  winning.equip(3); winning.equip(5); winning.move('right');
  assert.equal(winning.battle.player.stats.attack, 13); assert.equal(winning.battle.player.stats.defense, 2);
  assert.equal(winning.equip(5).ok, false); // combat equipment cannot change
  winning.battle.attack(); assert.equal(winning.battle.enemyHp, 17); winning.battle.advance(); assert.equal(winning.playerHp, 36);
  winning.battle.advance(); winning.battle.attack(); winning.battle.advance(); winning.battle.advance(); winning.battle.attack();
  assert.equal(winning.battle.phase, 'victory'); assert.match(winning.battle.text, /25G/);
  winning.finishEncounter('victory'); winning.finishEncounter('victory'); assert.equal(winning.status.gold, 125);
  assert.equal(winning.inventory.find(i => i.itemId === 0).count, 2); assert.equal(winning.inventory.find(i => i.itemId === 3).count, 2);
  assert.equal(winning.status.attack, 13); winning.reset(); assert.equal(winning.status.gold, 100); assert.equal(winning.status.attack, 10);
  const escape = createWorldGame([rewardWorld], 0, () => 0, { enemies: [enemy] }); escape.move('right'); escape.battle.escape(); escape.finishEncounter('escape');
  assert.equal(escape.status.gold, 100); assert.deepEqual(escape.inventory, []);
  // The actual king catalog gives all four royal items, 1,500G and enough XP for level 10 once.
  const royalEnemy = enemyCatalog.find(enemy => enemy.id === 0);
  const royalIds = [9, 10, 11, 12];
  assert.equal(royalEnemy.reward.gold, 1500); assert.equal(royalEnemy.reward.experience, 900);
  assert.deepEqual(royalEnemy.reward.items, royalIds.map(itemId => ({ itemId, quantity: 1 })));
  const royal = createPlayerState();
  royal.grantReward(royalEnemy.reward);
  assert.equal(royal.appearance, 'hero', 'owning the items alone does not change appearance');
  assert.equal(royal.level, 10); assert.equal(royal.experience, 900); assert.equal(royal.gold, 1600);
  for (const itemId of royalIds) {
    const gear = findItem(itemId).equipment;
    for (const stat of ['hp', 'mp', 'attack', 'defense']) assert.ok(gear[stat] >= 50, `${itemId} boosts ${stat}`);
    assert.equal(royal.equip(itemId).ok, true);
    assert.equal(royal.appearance, 'hero', 'one royal item alone does not change appearance');
    assert.equal(royal.definition.stats.hp, 85 + gear.hp);
    assert.equal(royal.definition.maxMp, 28 + gear.mp);
    assert.equal(royal.definition.stats.attack, 28 + gear.attack);
    assert.equal(royal.definition.stats.defense, 9 + gear.defense);
    assert.equal(royal.unequip(gear.slot).ok, true);
  }
  royal.equip(9); royal.equip(10); royal.equip(11);
  assert.equal(royal.appearance, 'king');
  assert.equal(royal.equipment.head, 9); assert.equal(royal.equipment.armor, 10); assert.equal(royal.equipment.weapon, 11);
  assert.deepEqual(royal.definition.stats, { hp: 485, attack: 278, defense: 259 });
  assert.equal(royal.definition.maxMp, 378);
  const beforeRoyalSwap = royal.inventory;
  royal.equip(12); assert.equal(royal.equipment.weapon, 12);
  assert.equal(royal.appearance, 'king', 'either royal weapon completes the set');
  assert.deepEqual(royal.definition.stats, { hp: 535, attack: 328, defense: 259 });
  assert.equal(royal.definition.maxMp, 228); assert.deepEqual(royal.inventory, beforeRoyalSwap);
  assert.deepEqual(royal.vitals, { hp: 85, mp: 28, poisoned: false }, 'equipping does not heal for free');
  for (const [slot, id] of [['head', 9], ['armor', 10], ['weapon', 12]]) {
    royal.unequip(slot); assert.equal(royal.appearance, 'hero');
    royal.equip(id); assert.equal(royal.appearance, 'king');
  }
  royal.addItem(3, 1); royal.equip(3); assert.equal(royal.appearance, 'hero'); royal.equip(12);
  const partialRoyal = createPlayerState();
  for (const id of [3, 9, 10]) partialRoyal.addItem(id, 1);
  partialRoyal.equip(3); partialRoyal.setVitals({ hp: 7, mp: 2, poisoned: false });
  const partialBefore = { equipment: partialRoyal.equipment, inventory: partialRoyal.inventory, vitals: partialRoyal.vitals };
  assert.equal(partialRoyal.equipRoyalSet().ok, false);
  assert.deepEqual({ equipment: partialRoyal.equipment, inventory: partialRoyal.inventory, vitals: partialRoyal.vitals }, partialBefore);
  const requiredLevel = findItem(9).equipment.requiredLevel;
  try {
    findItem(9).equipment.requiredLevel = 11;
    const equipmentBefore = royal.equipment;
    assert.equal(royal.equipRoyalSet().ok, false); assert.deepEqual(royal.equipment, equipmentBefore);
  } finally { findItem(9).equipment.requiredLevel = requiredLevel; }
  royal.setVitals({ hp: 500, mp: 200, poisoned: true });
  royal.addItem(0, 2); royal.useItem(0); assert.equal(royal.vitals.hp, 520);
  royal.useItem(0); assert.equal(royal.vitals.hp, 535);
  royal.addItem(2, 3); royal.useItem(2); royal.useItem(2); royal.useItem(2);
  assert.equal(royal.vitals.mp, 228, 'field recovery uses equipment-adjusted MP');
  const royalBattle = createBattle(enemyCatalog[1], { player: royal.definition, playerHp: royal.vitals.hp, playerMp: royal.vitals.mp });
  assert.equal(royalBattle.player.stats.hp, 535); assert.equal(royalBattle.player.maxMp, 228);
  royalBattle.attack(); assert.equal(royalBattle.phase, 'victory');
  royal.unequip('weapon'); royal.unequip('armor'); royal.unequip('head');
  assert.deepEqual(royal.vitals, { hp: 85, mp: 28, poisoned: true });
  royal.setVitals({ hp: 10, mp: 4, poisoned: false });
  royal.equip(9); royal.unequip('head'); royal.equip(9);
  assert.deepEqual(royal.vitals, { hp: 10, mp: 4, poisoned: false }, 'repeated equipment changes preserve damage');
  const whileGrowing = createPlayerState(); whileGrowing.addItem(9, 1); whileGrowing.equip(9);
  whileGrowing.setVitals({ hp: 120, mp: 100, poisoned: false }); whileGrowing.gainExperience(900);
  assert.equal(whileGrowing.vitals.hp, 165); assert.equal(whileGrowing.vitals.mp, 118);
  assert.equal(whileGrowing.definition.stats.hp, 185); assert.equal(whileGrowing.definition.maxMp, 128);
  const cappedRoyal = createPlayerState({ ...playerConfig, stats: { hp: 9998, attack: 9998, defense: 9998 }, maxMp: 9998 });
  cappedRoyal.addItem(9, 1); cappedRoyal.equip(9); cappedRoyal.gainExperience(900);
  assert.deepEqual(cappedRoyal.definition.stats, { hp: 9999, attack: 9999, defense: 9999 });
  assert.equal(cappedRoyal.definition.maxMp, 9999); assert.ok(cappedRoyal.vitals.hp <= 9999 && cappedRoyal.vitals.mp <= 9999);
  const royalScene = { ...rewardWorld, entities: [{ kind: 'king', x: 16, y: 32, parameters: [1] }], exits: [
    { x: 3, y: 4, targetStageId: 1, targetX: 1, targetY: 2, direction: 'front' },
  ] };
  const royalReturn = { ...rewardWorld, id: 1, encounter: undefined, entities: [], exits: [
    { x: 1, y: 3, targetStageId: 0, targetX: 3, targetY: 4, direction: 'left' },
  ] };
  const royalWin = createWorldGame([royalScene, royalReturn], 0, () => 0);
  royalWin.move('right');
  for (let turn = 0; turn < 3; turn++) {
    royalWin.battle.attack();
    if (royalWin.battle.phase !== 'victory') { royalWin.battle.advance(); royalWin.battle.advance(); }
  }
  for (const text of ['1500G', '900の経験値', ...royalIds.map(id => findItem(id).name)]) assert.ok(royalWin.battle.text.includes(text));
  royalWin.finishEncounter('victory'); royalWin.finishEncounter('victory');
  assert.equal(royalWin.status.level, 10); assert.equal(royalWin.status.experience, 900); assert.equal(royalWin.status.gold, 1600);
  assert.deepEqual(royalWin.inventory, royalIds.map(itemId => ({ itemId, count: 1 })));
  assert.equal(royalWin.visibleEntities.some(entity => entity.kind === 'king'), false);
  assert.equal(royalWin.status.equipment.head, 9); assert.equal(royalWin.status.equipment.armor, 10); assert.equal(royalWin.status.equipment.weapon, 12);
  assert.equal(royalWin.status.appearance, 'king');
  assert.equal(royalWin.status.hp, 535); assert.equal(royalWin.status.maxHp, 535);
  assert.equal(royalWin.status.mp, 228); assert.equal(royalWin.status.maxMp, 228);
  assert.match(royalWin.message.text, /王の王冠・王のローブ・王の剣を装備した！/);
  assert.match(royalWin.message.text, /HP・MPが全回復した！/);
  assert.match(royalWin.message.text, /レベル10/); royalWin.interact();
  assert.equal(royalWin.status.maxHp, 535); assert.equal(royalWin.status.maxMp, 228);
  royalWin.move('right'); assert.equal(royalWin.scene.id, 1);
  royalWin.move('front'); assert.equal(royalWin.scene.id, 0);
  assert.equal(royalWin.status.equipment.head, 9); assert.equal(royalWin.status.experience, 900);
  assert.equal(royalWin.status.appearance, 'king'); assert.equal(royalWin.status.hp, 535); assert.equal(royalWin.status.mp, 228);
  royalWin.move('left'); assert.equal(royalWin.encounter, null); assert.equal(royalWin.status.gold, 1600);
  assert.deepEqual(royalWin.inventory, royalIds.map(itemId => ({ itemId, count: 1 })));
  royalWin.reset(); assert.equal(royalWin.status.level, 1); assert.equal(royalWin.status.gold, 100);
  assert.equal(royalWin.status.equipment.head, null); assert.deepEqual(royalWin.inventory, []);
  assert.equal(royalWin.status.appearance, 'hero'); assert.equal(royalWin.status.hp, 40); assert.equal(royalWin.status.mp, 10);
  const royalEscape = createWorldGame([royalScene, royalReturn], 0, () => 0, { enemies: [{ ...royalEnemy, canEscape: true }] });
  royalEscape.move('right'); royalEscape.battle.escape(); royalEscape.finishEncounter('escape');
  assert.equal(royalEscape.status.experience, 0); assert.equal(royalEscape.status.gold, 100); assert.deepEqual(royalEscape.inventory, []);
  assert.equal(royalEscape.status.appearance, 'hero'); assert.equal(royalEscape.status.equipment.weapon, null);
  const royalDefeat = createWorldGame([royalScene, royalReturn], 0, () => 0, { player: { ...playerConfig, stats: { hp: 1, attack: 10, defense: 0 } } });
  royalDefeat.move('right'); royalDefeat.battle.attack(); royalDefeat.battle.advance();
  assert.equal(royalDefeat.battle.phase, 'defeat'); royalDefeat.finishEncounter('defeat');
  assert.equal(royalDefeat.status.experience, 0); assert.equal(royalDefeat.status.gold, 50); assert.deepEqual(royalDefeat.inventory, []);
  assert.equal(royalDefeat.status.appearance, 'hero'); assert.equal(royalDefeat.status.equipment.head, null);
  // Ordinary victories preserve chosen gear and damage, even when all royal items are owned.
  const ordinaryWin = createWorldGame([{ ...rewardWorld, encounter: { enabled: true, rate: 100, enemyId: 1 } }], 0, () => 0,
    { player: { ...playerConfig, initialItems: royalIds.map(itemId => ({ itemId, quantity: 1 })) } });
  ordinaryWin.equip(9); ordinaryWin.equip(10); ordinaryWin.equip(11); ordinaryWin.move('right');
  ordinaryWin.battle.guard(); ordinaryWin.battle.advance(); ordinaryWin.battle.advance(); ordinaryWin.battle.attack();
  ordinaryWin.finishEncounter('victory');
  assert.equal(ordinaryWin.status.equipment.weapon, 11); assert.equal(ordinaryWin.status.appearance, 'king');
  assert.equal(ordinaryWin.status.hp, 39); assert.equal(ordinaryWin.status.mp, 10);
  for (const stat of ['hp', 'mp']) for (const value of [-1, 1.5, 10000]) {
    assert.throws(() => parseItemCatalog([{ ...findItem(9), equipment: { ...findItem(9).equipment, [stat]: value } }]));
  }
  const legacyGear = parseItemCatalog([{ ...findItem(3), equipment: { slot: 'weapon', attack: 3, defense: 0 } }])[0];
  assert.equal(legacyGear.equipment.hp, 0); assert.equal(legacyGear.equipment.mp, 0);
  for (const mutate of [i => i.id = 256, i => i.price = -1, i => i.sellPrice = 999, i => i.effect.type = 'invalid']) {
    const invalid = structuredClone(itemCatalog); mutate(invalid[0]); assert.throws(() => parseItemCatalog(invalid));
  }
  const invalidGear = structuredClone(itemCatalog); invalidGear[3].equipment.slot = 'unknown'; assert.throws(() => parseItemCatalog(invalidGear));
  assert.throws(() => parseItemCatalog([itemCatalog[0], itemCatalog[0]]));
  assert.throws(() => parseShopCatalog([{ merchant: 'item-merchant', name: '道具屋', items: [255] }]));
  assert.throws(() => parsePlayerDefinition({ ...playerConfig, initialGold: -1 }));
  assert.throws(() => parseEnemyDefinitions([{ ...enemy, reward: { gold: 10, items: [{ itemId: 255, quantity: 1 }] } }]));
  console.log('Economy: editable catalogs, gold, atomic buy/sell, equipped copies, stat bonuses, HP/MP/status item effects, battle item turns, merchant dialogue, consumed/sold loot, reward once, escape and reset passed.');
  console.log('Royal reward: four drops, 1,500G, Lv10/900EXP once, head equipment, four-stat bonuses, weapon swap, equipment HP/MP recovery/caps, growth, return persistence, escape/defeat and reset passed.');
  console.log('Royal appearance: three-piece condition, either weapon, incomplete/restricted auto-equip, victory auto-equip/full recovery, ordinary victory exclusion and reset passed.');
} finally { rmSync(out, { recursive: true, force: true }); }
