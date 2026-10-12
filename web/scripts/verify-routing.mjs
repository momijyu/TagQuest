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
  class Element {
    hidden = false; children = []; dataset = {}; textContent = '';
    append(child) { this.children.push(child); }
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
      addEventListener() {}
      getContext() { return { canvas: this, fillRect() { paints++; }, clearRect() {}, drawImage() {}, scale() {}, setTransform() {} }; }
    }
    const elements = new Map();
    for (const match of readFileSync(join(root, 'web/index.html'), 'utf8').matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
      const element = new PreviewElement();
      for (const key of ['width', 'height']) { const size = match[0].match(new RegExp(`${key}="(\\d+)"`)); if (size) element[key] = Number(size[1]); }
      elements.set('#' + match[1], element);
    }
    globalThis.document = { hidden: false, querySelector: selector => selector === '#gallery-walking' ? null : elements.get(selector) ?? null, createElement: () => new PreviewElement() };
    globalThis.window = { matchMedia: () => ({ matches: false, addEventListener: (_event, fn) => motionListeners.add(fn), removeEventListener: (_event, fn) => motionListeners.delete(fn) }), requestAnimationFrame: fn => { frames.set(++frameId, fn); return frameId; }, cancelAnimationFrame: id => frames.delete(id) };
    globalThis.fetch = async () => assert.fail('gallery previews reuse the playable sample; no separate old map download');
    const sprite = { image: {}, sourceX: 0, sourceY: 0, width: 64, height: 64 };
    const players = Object.fromEntries(['front', 'back', 'left', 'right'].map(key => [key, sprite]));
    const kings = Object.fromEntries(['standing', 'standingHeroStyle', 'standingChunky', 'seated', 'seatedOverlay', 'back', 'left', 'right'].map(key => [key, sprite]));
    const stop = await startGallery({ king: sprite, players, kings: players }, kings, () => active);
    assert.deepEqual([elements.get('#castle-exterior-preview').width, elements.get('#castle-exterior-preview').height], [400, 336], 'gallery uses the same plaza town as play');
    assert.deepEqual([elements.get('#town-loot-overlay').width, elements.get('#town-loot-overlay').height], [400, 336], 'sparkle overlay matches the new map');
    assert.deepEqual([elements.get('#repeat-preview').width, elements.get('#repeat-preview').height], [13 * 16 * 8, 12 * 16 * 8], 'castle preview matches the spacious playable hall');
    assert.equal(elements.get('#repeat-preview').style.width, '416px', 'whole castle displays at an integer 2x pixel scale');
    assert.ok(paints > 1000); assert.equal(elements.get('#enemy-catalog').children.length, 4); assert.equal(elements.get('#world-locations').children.length, 4); assert.equal(elements.get('#item-catalog').children.length, 13); assert.ok(elements.get('#status').hidden);
    const before = paints;
    active = false; const [id, tick] = frames.entries().next().value; frames.delete(id); tick(320); assert.equal(paints, before);
    active = true; const [nextId, nextTick] = frames.entries().next().value; frames.delete(nextId); nextTick(480); assert.ok(paints > before);
    stop(); assert.equal(frames.size, 0); assert.equal(motionListeners.size, 0);
    elements.delete('#repeat-preview');
    await assert.rejects(startGallery({ king: sprite, players, kings: players }, kings, () => active), /画面要素/);
    assert.equal(frames.size, 0); assert.equal(motionListeners.size, 0);
  }
  console.log('Routing: direct NFC/editor loading skips gallery; corrupt URL, async cancellation, gallery failure isolation, page reuse and cleanup passed.');
} finally { rmSync(temp, { recursive: true, force: true }); }
