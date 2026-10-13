// Page loading and cancellation contract. Uses the actual hash decoder; no browser required.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../node_modules/vite/dist/node/index.js';
const root = fileURLToPath(new URL('../..', import.meta.url)), temp = mkdtempSync(join(tmpdir(), 'tq-routing-'));
try {
  await build({ configFile: false, logLevel: 'silent', build: { lib: { entry: { router: join(root, 'web/src/page-router.ts'), gallery: join(root, 'web/src/gallery.ts'), model: join(root, 'web/src/editor/model.ts'), nfc: join(root, 'web/src/codec/nfc-url.ts') }, formats: ['es'], fileName: (_, name) => `${name}.mjs` }, outDir: temp } });
  const { startPageRouter } = await import(pathToFileURL(join(temp, 'router.mjs')));
  const { initialWorld, encodeWorld } = await import(pathToFileURL(join(temp, 'model.mjs')));
  const { base64url } = await import(pathToFileURL(join(temp, 'nfc.mjs')));
  const valid = '#' + base64url(encodeWorld(initialWorld(), true).bytes);
  const home = readFileSync(join(root, 'web/index.html'), 'utf8');
  const sections = [...home.matchAll(/<section\b[^>]*aria-labelledby="([^"]+)"/g)].map(match => match[1]);
  const navigation = [...home.match(/<nav class="gallery-nav"[\s\S]*?<\/nav>/)[0].matchAll(/href="#([^"]+)"/g)].map(match => match[1]);
  const expectedOrder = ['walking-title','enemies-title','items-title','player-title','king-title','npcs-title','world-title','castle-exterior-title','houses-title','shops-title','forest-title','cave-title','demon-castle-title','game-ui-title','adventure-materials-title','decorations-title','town-title','tile-title','throne-title','wall-title','pillar-title'];
  assert.deepEqual(sections, expectedOrder); assert.deepEqual(navigation, expectedOrder);
  const ids = [...home.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]); assert.equal(new Set(ids).size, ids.length, 'reordering preserves unique preview IDs');
  assert.ok(home.includes('href="#editor"'), 'the editor entry remains available');

  class Element {
    hidden = false; children = []; dataset = {}; textContent = '';
    append(...children) { this.children.push(...children); }
    replaceChildren() { this.children = []; }
  }
  const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
  function setup(hash) {
    const listeners = new Map();
    globalThis.window = { location: { hash }, addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener: type => listeners.delete(type) };
    globalThis.document = { body: new Element(), createElement: () => new Element() };
    const pages = Object.fromEntries(['gallery', 'editor', 'game', 'status'].map(name => [name, new Element()]));
    const counts = { gallery: 0, editor: 0, game: 0, starts: 0, galleryStops: 0, editorStops: 0, gameStops: 0 };
    const services = {
      async loadGallery() { counts.gallery++; return async () => () => counts.galleryStops++; },
      async loadEditor() { counts.editor++; return () => () => counts.editorStops++; },
      async loadGame() { counts.game++; return (_root, first, scenes, active) => { counts.starts++; assert.equal(first.id, 0); assert.equal(scenes.length, 2); assert.ok(active()); return () => counts.gameStops++; }; },
    };
    return { pages, counts, services, listeners };
  }
  {
    const { pages, counts, services, listeners } = setup(valid), router = startPageRouter(pages, services);
    await flush(); assert.equal(counts.starts, 1); assert.equal(counts.gallery, 0); assert.equal(counts.editor, 0); assert.ok(pages.gallery.hidden && pages.editor.hidden && !pages.game.hidden && pages.status.hidden);
    assert.equal(pages.game.children.length, 1); assert.equal(pages.game.children[0].className, 'play-session');
    assert.ok(!pages.game.children.some(child => child.href), 'valid NFC play has no editor/gallery navigation');
    window.location.hash = '#editor'; await router.route(); assert.equal(counts.gameStops, 1); assert.equal(counts.editor, 1);
    window.location.hash = '#'; await router.route(); assert.equal(counts.gallery, 1);
    window.location.hash = '#editor'; await router.route(); assert.equal(counts.editor, 1);
    window.location.hash = '#monsters'; await router.route(); assert.equal(counts.gallery, 1);
    router.dispose(); assert.equal(counts.galleryStops, 1); assert.equal(counts.editorStops, 1); assert.equal(listeners.size, 0);
  }
  {
    const { pages, counts, services } = setup('#VF'), router = startPageRouter(pages, services);
    await flush(); assert.equal(counts.game, 0); assert.equal(counts.gallery, 0); assert.equal(counts.editor, 0); assert.ok(!pages.status.hidden); assert.match(pages.status.textContent, /ゲームを開けません/); assert.equal(pages.game.children[0].href, '#'); router.dispose();
  }
  {
    const { pages, counts, services } = setup(valid), loading = deferred();
    const original = services.loadGame;
    services.loadGame = () => loading.promise;
    const router = startPageRouter(pages, services);
    window.location.hash = '#editor'; await router.route();
    loading.resolve(await original()); await flush(); assert.equal(counts.starts, 0); assert.equal(counts.editor, 1); assert.ok(!pages.editor.hidden && pages.game.hidden && pages.status.hidden); router.dispose();
  }
  {
    const { pages, counts, services } = setup('#'); services.loadGallery = async () => { throw new Error('sample map unavailable'); };
    const router = startPageRouter(pages, services); await flush(); assert.match(pages.status.textContent, /sample map unavailable/);
    window.location.hash = valid; await router.route(); assert.equal(counts.starts, 1); assert.ok(pages.status.hidden); router.dispose();
  }
  {
    const { pages, counts, services } = setup('#'), loading = deferred(); services.loadGallery = () => loading.promise;
    const router = startPageRouter(pages, services); window.location.hash = '#editor'; await router.route();
    window.location.hash = '#'; const second = router.route();
    loading.resolve(async () => () => counts.galleryStops++); await second;
    assert.ok(!pages.gallery.hidden && pages.status.hidden); router.dispose(); assert.equal(counts.galleryStops, 1);
  }
  {
    const { pages, counts, services } = setup('#'), mounted = deferred();
    services.loadGallery = async () => () => mounted.promise;
    const router = startPageRouter(pages, services); await flush(); router.dispose();
    mounted.resolve(() => counts.galleryStops++); await flush(); assert.equal(counts.galleryStops, 1);
  }
  {
    // Run the real gallery drawing against IDs and canvas sizes from the actual HTML.
    // Walking controls are already exercised by verify-editor; this checks the extracted previews.
    const { startGallery } = await import(pathToFileURL(join(temp, 'gallery.mjs')));
    let paints = 0, active = true, frameId = 0;
    const frames = new Map(), motionListeners = new Set();
    class PreviewElement extends Element {
      width = 300; height = 150; attributes = new Map(); style = {};
      setAttribute(key, value) { this.attributes.set(key, value); }
      getAttribute(key) { return this.attributes.get(key) ?? null; }
      events = new Map(); images = [];
      addEventListener(type, callback) { this.events.set(type, callback); }
      get src() { return this.attributes.get('src'); }
      set src(value) { this.attributes.set('src', value); }
      getContext() { return { canvas: this, fillRect() { paints++; }, clearRect() {}, drawImage: (...args) => { this.images.push(args); }, scale() {}, setTransform() {} }; }
    }
    const elements = new Map();
    for (const match of readFileSync(join(root, 'web/index.html'), 'utf8').matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
      const element = new PreviewElement();
      for (const key of ['width', 'height']) { const size = match[0].match(new RegExp(`${key}="(\\d+)"`)); if (size) element[key] = Number(size[1]); }
      elements.set('#' + match[1], element);
    }
    globalThis.document = { hidden: false, querySelector: selector => selector === '#gallery-walking' ? null : elements.get(selector) ?? null, createElement: () => new PreviewElement() };
    const badgeStorage = new Map(), badgeEvents = new Map();
    globalThis.window = { localStorage: { getItem: key => badgeStorage.get(key) ?? null }, addEventListener: (event, fn) => badgeEvents.set(event, fn), removeEventListener: event => badgeEvents.delete(event), matchMedia: () => ({ matches: false, addEventListener: (_event, fn) => motionListeners.add(fn), removeEventListener: (_event, fn) => motionListeners.delete(fn) }), requestAnimationFrame: fn => { frames.set(++frameId, fn); return frameId; }, cancelAnimationFrame: id => frames.delete(id) };
    globalThis.fetch = async () => assert.fail('gallery previews reuse the playable sample; no separate old map download');
    const sprite = { image: {}, sourceX: 0, sourceY: 0, width: 64, height: 64 };
    const players = Object.fromEntries(['front', 'back', 'left', 'right'].map(key => [key, sprite]));
    const kings = Object.fromEntries(['standing', 'standingHeroStyle', 'standingChunky', 'seated', 'seatedOverlay', 'back', 'left', 'right'].map(key => [key, sprite]));
    const stop = await startGallery({ king: sprite, players, kings: players }, kings, () => active);
    assert.equal(elements.get('#title-true-clear').hidden, true);
    badgeStorage.set('tagquest.play-save.v1', JSON.stringify({ version: 1, worlds: { test: { cleared: true, defeatCounts: [[11, 1]] } } }));
    badgeEvents.get('hashchange')(); assert.equal(elements.get('#title-true-clear').hidden, false);
    badgeStorage.clear(); badgeEvents.get('storage')(); assert.equal(elements.get('#title-true-clear').hidden, true);
    assert.deepEqual([elements.get('#castle-exterior-preview').width, elements.get('#castle-exterior-preview').height], [464, 336], 'gallery uses the expanded residential town from play');
    assert.deepEqual([elements.get('#town-loot-overlay').width, elements.get('#town-loot-overlay').height], [464, 336], 'sparkle overlay matches the expanded map');
    assert.deepEqual([elements.get('#repeat-preview').width, elements.get('#repeat-preview').height], [13 * 16 * 8, 12 * 16 * 8], 'castle preview matches the spacious playable hall');
    assert.equal(elements.get('#repeat-preview').style.width, '416px', 'whole castle displays at an integer 2x pixel scale');
    const catalog = JSON.parse(readFileSync(join(root, 'web/src/data/item-catalog.json'), 'utf8'));
    const verifyItemList = () => {
      const groups = elements.get('#item-catalog').children;
      assert.deepEqual(groups.map(group => group.children[0].textContent), ['回復・治療', '武器', '防具', '装飾品', '素材']);
      assert.deepEqual(groups.map(group => group.children[1].children.length), [7, 6, 9, 3, 6]);
      for (const group of groups) assert.equal(group.children[0].children[0].textContent, `${group.children[1].children.length}種類`);
      const displayed = groups.flatMap(group => group.children[1].children.map(row => [row.children[0].textContent, row.children[1].textContent]));
      assert.deepEqual(displayed.sort(), catalog.map(item => [item.name, item.description]).sort(), 'every current item and its effect/material use appears exactly once');
      assert.deepEqual(groups[4].children[1].children.map(row => row.children[0].textContent), catalog.filter(item => !item.effect && !item.equipment).map(item => item.name), 'monster drops are grouped as materials');
    };
    const enemies = JSON.parse(readFileSync(join(root, 'web/src/data/encounters/enemy-catalog.json'), 'utf8')).map(file => JSON.parse(readFileSync(join(root, `web/src/data/encounters/enemies/${file}.json`), 'utf8')));
    const verifyEnemyList = () => {
      const groups = elements.get('#enemy-catalog').children;
      assert.equal(groups.length, 3);
      assert.deepEqual(groups.map(group => group.children[0].textContent), ['草原・森の魔物', '洞窟の魔物', 'ボス・強敵']);
      assert.deepEqual(groups.map(group => group.children[1].children.length), [3, 4, 7]);
      assert.deepEqual(groups.map(group => group.dataset.category), ['forest', 'cave', 'boss']);
      for (const group of groups) { assert.equal(group.className, 'enemy-category'); assert.equal(group.children[0].children[0].textContent, `${group.children[1].children.length}種類`); }
      const cards = groups.flatMap(group => group.children[1].children);
      assert.equal(cards.length, enemies.length);
      assert.deepEqual(cards.map(card => Number(card.dataset.enemyId)).sort((a,b)=>a-b), enemies.map(enemy=>enemy.id).sort((a,b)=>a-b), 'all enemies, including the king and dimension creatures, appear once');
      assert.deepEqual(groups[0].children[1].children.map(card=>Number(card.dataset.enemyId)), [1,2,3]);
      assert.deepEqual(groups[1].children[1].children.map(card=>Number(card.dataset.enemyId)), [5,6,7,10]);
      assert.deepEqual(groups[2].children[1].children.map(card=>Number(card.dataset.enemyId)), [0,8,4,11,12,13,14]);
      for (const card of cards) {
        const enemy = enemies.find(enemy=>enemy.id===Number(card.dataset.enemyId));
        assert.equal(card.children[1].children[0].textContent, enemy.name);
        assert.equal(card.children[1].children[1].textContent, `HP ${enemy.stats.hp} / 攻撃 ${enemy.stats.attack} / 防御 ${enemy.stats.defense}`);
        assert.equal(card.children[0].width, 64); assert.equal(card.children[0].height, 64);
        assert.equal(card.children[0].getAttribute('aria-label'), `${enemy.name}のドット絵`);
      }
      assert.equal(cards.find(card=>card.dataset.enemyId==='0').children[0].images.length, 1, 'king card uses the existing pixel character');
      const references = cards.flatMap(card=>card.children.slice(2)); assert.equal(references.length, 3);
      for (const details of references) {
        const image = details.children[1]; assert.equal(image.src, undefined, 'reference originals remain lazy');
        details.open = false; details.events.get('toggle')(); assert.equal(image.src, undefined);
        details.open = true; details.events.get('toggle')(); assert.ok(image.src); const source = image.src;
        details.events.get('toggle')(); assert.equal(image.src, source);
      }
    };
    verifyEnemyList();
    assert.ok(paints > 1000); assert.equal(elements.get('#world-locations').children.length, 5); verifyItemList(); assert.ok(elements.get('#status').hidden);
    const before = paints;
    active = false; const [id, tick] = frames.entries().next().value; frames.delete(id); tick(320); assert.equal(paints, before);
    active = true; const [nextId, nextTick] = frames.entries().next().value; frames.delete(nextId); nextTick(480); assert.ok(paints > before);
    stop(); assert.equal(badgeEvents.size, 0); assert.equal(frames.size, 0); assert.equal(motionListeners.size, 0);
    const stopAgain = await startGallery({ king: sprite, players, kings: players }, kings, () => active);
    verifyItemList(); verifyEnemyList(); stopAgain(); assert.equal(frames.size, 0); assert.equal(motionListeners.size, 0);
    elements.delete('#repeat-preview');
    await assert.rejects(startGallery({ king: sprite, players, kings: players }, kings, () => active), /画面要素/);
    assert.equal(frames.size, 0); assert.equal(motionListeners.size, 0);
  }
  console.log('Routing: direct NFC/editor loading skips gallery; corrupt URL, async cancellation, gallery failure isolation, page reuse and cleanup passed.');
} finally { rmSync(temp, { recursive: true, force: true }); }
