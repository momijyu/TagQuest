import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../node_modules/vite/dist/node/index.js';
const root = fileURLToPath(new URL('../..', import.meta.url)), out = mkdtempSync(join(tmpdir(), 'tq-exchanges-'));
try {
  await build({ configFile: false, logLevel: 'silent', build: { lib: { entry: Object.fromEntries([
    ['state', 'game/player-state'], ['world', 'game/world'], ['config', 'data/encounters/combat-config'],
    ['progression', 'data/progression'], ['items', 'data/items'], ['recipes', 'data/exchanges'], ['shops', 'data/shops'],
  ].map(([name, file]) => [name, join(root, `web/src/${file}.ts`)])), formats: ['es'], fileName: (_, name) => `${name}.mjs` }, outDir: out } });
  const read = name => import(pathToFileURL(join(out, `${name}.mjs`)).href);
  const { createPlayerState } = await read('state'), { createWorldGame } = await read('world');
  const { progressionConfig } = await read('progression');
  const { playerConfig } = await read('config'), { findItem } = await read('items');
  const { exchangeRecipes, parseExchangeRecipes } = await read('recipes'), { shopCatalog, parseShopCatalog } = await read('shops');
  const snapshot = state => ({ inventory: state.inventory, gold: state.gold, discovered: state.discoveredItems,
    equipment: state.equipment, vitals: state.vitals });
  const count = (state, id) => state.inventory.find(item => item.itemId === id)?.count ?? 0;
  // Validation rejects ambiguous or unsafe authoring; older shop config remains valid.
  assert.equal(parseShopCatalog([{ merchant: 'item-merchant', name: '道具屋', items: [0] }])[0].recipes, undefined);
  for (const recipes of [[255], [0, 0], [true], '0']) assert.throws(() => parseShopCatalog([{ merchant: 'item-merchant', name: '店', items: [], recipes }]));
  for (const invalid of [null, {}, [null], [exchangeRecipes[0], exchangeRecipes[0]],
    [{ ...exchangeRecipes[0], ingredients: [] }],
    [{ ...exchangeRecipes[0], ingredients: [{ itemId: 13, quantity: 1 }, { itemId: 13, quantity: 2 }] }],
    [{ ...exchangeRecipes[0], ingredients: [{ itemId: 255, quantity: 1 }] }],
    [{ ...exchangeRecipes[0], result: { itemId: 255, quantity: 1 } }],
    [{ ...exchangeRecipes[0], result: { itemId: 19, quantity: 0 } }],
    [{ ...exchangeRecipes[0], ingredients: [{ itemId: 13, quantity: 1.5 }] }],
    [{ ...exchangeRecipes[0], gold: -1 }], [{ ...exchangeRecipes[0], id: true }]]) assert.throws(() => parseExchangeRecipes(invalid));
  assert.deepEqual(new Set(shopCatalog.flatMap(shop => shop.recipes ?? [])), new Set(exchangeRecipes.map(recipe => recipe.id)));
  assert.deepEqual(new Set(exchangeRecipes.flatMap(recipe => recipe.ingredients.map(i => i.itemId)).filter(id => id >= 13 && id <= 18)), new Set([13, 14, 15, 16, 17, 18]), 'all six drops have a use');
  for (const recipe of exchangeRecipes) {
    const state = createPlayerState({ ...playerConfig, initialGold: recipe.gold + 10, initialItems: recipe.ingredients });
    const vitals = state.vitals, equipment = state.equipment;
    assert.equal(state.exchange(recipe.id).ok, true);
    assert.equal(state.gold, 10); assert.equal(count(state, recipe.result.itemId), recipe.result.quantity);
    for (const { itemId } of recipe.ingredients) {
      assert.equal(count(state, itemId), 0); assert.ok(state.discoveredItems.includes(itemId), 'consumed materials stay in the collection');
    }
    assert.ok(state.discoveredItems.includes(recipe.result.itemId));
    assert.deepEqual(state.vitals, vitals); assert.deepEqual(state.equipment, equipment, 'equipment is received without auto-equipping');
    const before = snapshot(state); assert.equal(state.exchange(recipe.id).ok, false); assert.deepEqual(snapshot(state), before);
    const item = findItem(recipe.result.itemId);
    if (item.equipment) {
      state.gainExperience(progressionConfig.levelThresholds[(item.equipment.requiredLevel ?? 1) - 1]);
      const grown = state.baseStats;
      assert.equal(state.equip(item.id).ok, true);
      assert.equal(state.definition.stats.attack, grown.attack + item.equipment.attack);
      assert.equal(state.definition.stats.defense, Math.max(0, grown.defense + item.equipment.defense));
      assert.equal(state.definition.maxMp, grown.mp + item.equipment.mp);
    } else {
      state.setVitals({ hp: 1, mp: 0, poisoned: true });
      assert.equal(state.useItem(item.id).ok, true);
      if (item.effect.type === 'cure-poison') assert.equal(state.vitals.poisoned, false);
      else if (item.effect.type === 'heal-hp') assert.equal(state.vitals.hp, playerConfig.stats.hp);
      else if (item.effect.type === 'heal-mp') assert.equal(state.vitals.mp, playerConfig.maxMp);
      else {
        const stat = item.effect.type === 'boost-hp' ? 'hp' : 'attack';
        assert.equal(state.baseStats[stat], playerConfig.stats[stat] + item.effect.amount);
      }
      assert.ok(state.discoveredItems.includes(item.id));
    }
  }
  // Failure never eats early ingredients, fees, or the equipped copy.
  const partial = createPlayerState({ ...playerConfig, initialItems: [{ itemId: 13, quantity: 1 }, { itemId: 14, quantity: 1 }] });
  let before = snapshot(partial); assert.equal(partial.exchange(1).ok, false); assert.deepEqual(snapshot(partial), before);
  const poor = createPlayerState({ ...playerConfig, initialGold: 3, initialItems: [{ itemId: 13, quantity: 2 }] });
  before = snapshot(poor); assert.equal(poor.exchange(0).ok, false); assert.deepEqual(snapshot(poor), before);
  poor.addItem(19, Number.MAX_SAFE_INTEGER);
  before = snapshot(poor); assert.equal(poor.exchange(0).ok, false); assert.deepEqual(snapshot(poor), before);
  const full = createPlayerState({ ...playerConfig, initialItems: [{ itemId: 13, quantity: 2 }, { itemId: 19, quantity: Number.MAX_SAFE_INTEGER }] });
  before = snapshot(full); assert.equal(full.exchange(0).ok, false); assert.deepEqual(snapshot(full), before);
  const upgrade = createPlayerState({ ...playerConfig, initialItems: [{ itemId: 4, quantity: 1 }, { itemId: 17, quantity: 6 }] });
  upgrade.equip(4); before = snapshot(upgrade);
  assert.match(upgrade.exchange(4).message, /装備から外して/); assert.deepEqual(snapshot(upgrade), before);
  upgrade.addItem(4, 1); assert.equal(upgrade.exchange(4).ok, true);
  assert.equal(count(upgrade, 4), 1); assert.equal(upgrade.equipment.weapon, 4, 'a spare copy may be used without consuming the equipped one');
  upgrade.unequip('weapon'); assert.equal(upgrade.exchange(4).ok, true); assert.equal(count(upgrade, 23), 2);
  before = snapshot(upgrade); assert.equal(upgrade.exchange(255).ok, false); assert.deepEqual(snapshot(upgrade), before);
  // Actual merchant interaction gates transactions and syncs field-picked materials.
  for (const merchant of shopCatalog.filter(shop => shop.recipes?.length)) {
    const recipe = exchangeRecipes.find(recipe => recipe.id === merchant.recipes[0]);
    const scene = { id: 0, width: 5, height: 5, spawn: { x: 16, y: 32 }, tiles: new Uint8Array(25).fill(7),
      entities: [{ kind: merchant.merchant, x: 16, y: 16, parameters: [] }] };
    const game = createWorldGame([scene], 0, () => 0.999999, { player: { ...playerConfig, initialItems: recipe.ingredients } });
    const before = { inventory: game.inventory, gold: game.status.gold };
    assert.equal(game.exchange(recipe.id).ok, false, 'cannot exchange outside a shop');
    game.move('back'); game.interact(); assert.ok(game.message);
    assert.equal(game.exchange(recipe.id).ok, false, 'cannot exchange during the greeting');
    while (game.message) game.interact(); assert.equal(game.shop.merchant, merchant.merchant);
    const wrongRecipe = exchangeRecipes.find(recipe => !merchant.recipes.includes(recipe.id));
    assert.equal(game.exchange(wrongRecipe.id).ok, false, 'only this merchant\'s recipes may be used');
    assert.deepEqual({ inventory: game.inventory, gold: game.status.gold }, before);
    assert.equal(game.exchange(recipe.id).ok, true); assert.ok(game.discoveredItems.includes(recipe.result.itemId));
    game.closeShop(); assert.equal(game.exchange(recipe.id).ok, false);
    game.reset(); assert.ok(!game.discoveredItems.includes(recipe.result.itemId));
  }
  const fieldShop = { id: 0, width: 5, height: 5, spawn: { x: 16, y: 32 }, tiles: new Uint8Array(25).fill(7),
    entities: [{ kind: 'item-merchant', x: 16, y: 16, parameters: [] },
      { kind: 'loot', x: 32, y: 48, parameters: [0], itemId: 13 }, { kind: 'loot', x: 48, y: 48, parameters: [0], itemId: 13 }] };
  const fieldGame = createWorldGame([fieldShop], 0);
  for (const direction of ['right', 'right', 'left', 'left']) {
    assert.equal(fieldGame.move(direction), true); while (fieldGame.message) fieldGame.interact();
  }
  assert.equal(count(fieldGame, 13), 2);
  fieldGame.move('back'); fieldGame.interact(); while (fieldGame.message) fieldGame.interact();
  assert.equal(fieldGame.exchange(0).ok, true); assert.equal(count(fieldGame, 13), 0);
  fieldGame.closeShop(); fieldGame.move('right'); assert.equal(count(fieldGame, 13), 0, 'walking inventory sync cannot credit spent loot again');
  console.log('Exchanges: all material recipes, consumable/equipment effects, shop gating, atomic shortages/fees/capacity, equipped-copy protection, collection and reset passed.');
} finally { rmSync(out, { recursive: true, force: true }); }
