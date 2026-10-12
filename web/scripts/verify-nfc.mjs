// Wire compatibility, paint-order guards, Vercel restoration and exact NDEF sizing.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../node_modules/vite/dist/node/index.js';
const root = fileURLToPath(new URL('../..', import.meta.url)), out = mkdtempSync(join(tmpdir(), 'tagquest-nfc-'));
try {
  const entries = { model: 'editor/model', codec: 'codec/scenes', url: 'codec/nfc-url', exits: 'data/stage-exits', dialogues: 'data/interactions', interactions: 'codec/interactions', adventure: 'editor/adventure', game: 'game/world' };
  await build({ configFile: false, logLevel: 'silent', build: { lib: { entry: Object.fromEntries(Object.entries(entries).map(([name, file]) => [name, join(root, `web/src/${file}.ts`)])), formats: ['es'], fileName: (_, name) => `${name}.mjs` }, outDir: out, emptyOutDir: false } });
  const read = name => import(pathToFileURL(join(out, `${name}.mjs`)).href);
  const { parseWorld, encodeWorld, toSceneData, compactFloor, initialWorld } = await read('model');
  const { decodeScenes } = await read('codec');
  const { base64url, gameUrl, readGameHash, isGameHash, ndefSize, nfcBudget, nfcTagPresets, defaultPublicBase } = await read('url');
  const { encodePackedExits, decodePackedExits, encodeExits } = await read('exits');
  const { dialogueTemplates, dialogueByteLength, validateCustomDialogue } = await read('dialogues');
  const { encodeInteractions } = await read('interactions');
  const { createAdventureWorld } = await read('adventure');
  const { createWorldGame } = await read('game');
  const stage = (id = 0) => ({ id, name: '検証', width: 32, height: 32, spawn: { x: 0, y: 0 }, spawnAnchor: 'frame', npcAnchor: 'frame', residentAnchor: 'frame', floor: { default: 'grass', rectangles: [] }, entities: [], exits: [] });
  const cases = [initialWorld(), createAdventureWorld()];
  for (const count of [1, 2, 3, 6, 8, 9, 16, 17, 128, 129, 255]) {
    const stages = Array.from({ length: count }, (_, i) => stage(255 - i));
    stages[0].exits = Array.from({ length: 7 }, (_, i) => ({ x: i, y: 31, targetStageId: stages[(i + count - 1) % count].id,
      targetX: 31, targetY: i, direction: ['front', 'back', 'left', 'right'][i % 4] }));
    cases.push(parseWorld(stages));
  }
  let seed = 2037;
  const random = max => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; };
  for (let i = 0; i < 40; i++) {
    const s = stage(i);
    for (let j = 0; j < 30; j++) {
      const x = random(32), y = random(32);
      s.floor.rectangles.push({ tile: ['grass', 'dirt', 'brick', 'forest-ground'][random(4)], x, y, width: 1 + random(32 - x), height: 1 + random(32 - y) });
    }
    cases.push(parseWorld([s]));
  }
  for (const rectangles of [
    [{ tile: 'dirt', x: 1, y: 1, width: 1, height: 4 }, { tile: 'dirt', x: 2, y: 1, width: 1, height: 4 }],
    [{ tile: 'dirt', x: 1, y: 1, width: 10, height: 1 }, { tile: 'dirt', x: 1, y: 2, width: 10, height: 1 }],
    [{ tile: 'dirt', x: 1, y: 1, width: 4, height: 4 }, { tile: 'brick', x: 3, y: 1, width: 1, height: 4 }, { tile: 'dirt', x: 5, y: 1, width: 4, height: 4 }],
  ]) { const s = stage(); s.floor.rectangles = rectangles; cases.push(parseWorld([s])); }
  const catalog = JSON.parse(readFileSync(join(root, 'web/src/data/scene-catalog.json')));
  const obsolete = stage(); obsolete.floor.rectangles = catalog.tiles.slice(0, 20).map(tile => ({ tile, x: 0, y: 0, width: 32, height: 32 }));
  obsolete.floor.rectangles.push({ tile: 'grass', x: 0, y: 0, width: 32, height: 32 }); cases.push(parseWorld([obsolete]));
  const maxExits = stage(222);
  maxExits.exits = Array.from({ length: 255 }, (_, i) => ({ x: i % 32, y: Math.floor(i / 32), targetStageId: 222, targetX: 31, targetY: 31, direction: 'right' }));
  cases.push(parseWorld([maxExits]));
  const custom = stage(201);
  custom.encounter = { enabled: true, enemyId: 1, rate: 25, enemies: [{ enemyId: 1, weight: 3 }, { enemyId: 2, weight: 1 }] };
  custom.entities = [{ kind: 'resident', x: 16, y: 16, parameters: [], dialogue: { type: 'custom', text: 'Aあ😀\nよい旅を！' } },
    { kind: 'resident', x: 32, y: 16, parameters: [], dialogue: { type: 'template', id: 39 } }];
  custom.exits = [{ x: 31, y: 31, targetStageId: 201, targetX: 0, targetY: 1, direction: 'front' }];
  cases.push(parseWorld([custom]));
  writeFileSync(join(out, 'cases.json'), JSON.stringify(cases));
  const python = `import sys,json,base64\nsys.path.insert(0,sys.argv[1])\nfrom build import compile_game\nfor w in json.load(open(sys.argv[2])):\n b,r=compile_game(w['stages'],compact=True)\n print(json.dumps({'bytes':base64.b64encode(b).decode(),'exits':[s['exit_bytes'] for s in r]}))`;
  const outputs = execFileSync('python3', ['-c', python, join(root, 'compiler'), join(out, 'cases.json')], { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 }).trim().split('\n').map(line => JSON.parse(line));
  for (const [i, world] of cases.entries()) {
    const before = structuredClone(world), encoded = encodeWorld(world, true), decoded = decodeScenes(encoded.bytes);
    if (world.stages.some(s => s.exits?.length)) assert.equal(encoded.bytes[2], world.stages.some(s => s.entities.some(e => ['castle', 'weapon-shop', 'armor-shop', 'item-shop', 'house-red', 'house-slate'].includes(e.kind))) ? 14 : 13);
    assert.deepEqual(world, before, 'export must not mutate editable data');
    assert.deepEqual(encoded.bytes, Uint8Array.from(Buffer.from(outputs[i].bytes, 'base64')), `Python/TS parity ${i}`);
    assert.deepEqual(encoded.reports.map(r => r.exitBytes), outputs[i].exits);
    assert.equal(encoded.bytes.length, 4 + encoded.reports.reduce((sum, r) => sum + r.bytes, 0));
    for (const [j, s] of decoded.entries()) {
      const expected = toSceneData(world.stages[j]);
      assert.deepEqual(s.tiles, expected.tiles); assert.deepEqual(s.entities, expected.entities);
      assert.deepEqual(s.exits ?? [], expected.exits ?? []); assert.deepEqual(s.encounter, expected.encounter);
      assert.deepEqual(s.spawn, expected.spawn); assert.equal(s.id, expected.id);
    }
  }
  const adjacent = stage(); adjacent.floor.rectangles = [{ tile: 'dirt', x: 1, y: 1, width: 1, height: 4 }, { tile: 'dirt', x: 2, y: 1, width: 1, height: 4 }];
  compactFloor(adjacent); assert.equal(adjacent.floor.rectangles.length, 1);
  const e = { x: 31, y: 31, targetStageId: 201, targetX: 31, targetY: 31, direction: 'right' };
  const packed = encodePackedExits([e], [7, 100, 201]);
  assert.equal(packed.length, 4); assert.equal(encodeExits([e]).length, 7);
  assert.deepEqual(decodePackedExits(Uint8Array.from(packed.slice(1)), 1, 3), [{ ...e, targetStageId: 2 }]);
  const eightIds = [2, 90, 15, 0, 1, 77, 20, 201];
  const eightPacked = encodePackedExits([e], eightIds);
  assert.equal(eightPacked.length - 1, 4, '25 bits fit in four bytes, excluding the shared count');
  assert.deepEqual(decodePackedExits(Uint8Array.from(eightPacked.slice(1)), 1, 8), [{ ...e, targetStageId: 7 }]);
  assert.equal(encodePackedExits([e, { ...e, x: 30 }], eightIds).length - 1, 7, 'continuous packing saves a byte for two exits');
  const invalid = Uint8Array.from(packed.slice(1)); invalid[1] |= 16; assert.throws(() => decodePackedExits(invalid, 1, 3));
  const padded = encodePackedExits([e], [201]); padded[padded.length - 1] |= 1;
  assert.throws(() => decodePackedExits(Uint8Array.from(padded.slice(1)), 1, 1), /padding/);
  const adventure = encodeWorld(cases[1], true).bytes;
  for (let i = 0; i < adventure.length; i++) assert.throws(() => decodeScenes(adventure.subarray(0, i)), `truncated at ${i}`);
  assert.throws(() => decodeScenes(Uint8Array.from([...adventure, 0])), /Trailing/);
  assert.equal(dialogueTemplates.length, 46); assert.equal(dialogueTemplates[0].text, 'こんにちは。よい旅を！'); assert.equal(dialogueTemplates[9].name, '魔王');
  for (const [text, bytes] of [['A', 1], ['あ', 3], ['😀', 4], ['Aあ😀\n', 9]]) {
    assert.equal(dialogueByteLength(text), bytes); validateCustomDialogue(text);
    assert.equal(encodeInteractions([{ kind: 'resident', dialogue: { type: 'custom', text } }]).length, bytes + 5);
  }
  assert.equal(encodeInteractions([{ kind: 'resident', dialogue: { type: 'template', id: 39 } }]).length, 4);
  assert.throws(() => validateCustomDialogue('あ'.repeat(342)));
  const publicBase = 'https://tag-quest-kappa.vercel.app/';
  assert.equal(defaultPublicBase(), publicBase);
  assert.equal(defaultPublicBase({ hostname: 'localhost', origin: 'http://localhost:5173' }), publicBase);
  assert.equal(defaultPublicBase({ hostname: 'test-stage.vercel.app', origin: 'https://test-stage.vercel.app' }), 'https://test-stage.vercel.app/');
  const serializedSize = url => {
    const prefix = ['https://www.', 'http://www.', 'https://', 'http://'].find(p => url.startsWith(p)) ?? '';
    const payload = [0, ...new TextEncoder().encode(url.slice(prefix.length))], n = payload.length;
    const record = [...(n <= 255 ? [0xd1, 1, n] : [0xc1, 1, n >>> 24, n >>> 16 & 255, n >>> 8 & 255, n & 255]), 0x55, ...payload];
    return [3, ...(record.length < 255 ? [record.length] : [255, record.length >> 8, record.length & 255]), ...record, 254].length;
  };
  for (const prefix of ['https://', 'https://www.', 'http://', 'http://www.', 'ftp://']) for (const length of [1, 249, 250, 251, 254, 255, 256, 500]) {
    const url = prefix + 'a'.repeat(length); assert.equal(ndefSize(url), serializedSize(url));
  }
  const castleTown = encodeWorld(cases[0], true).bytes;
  assert.ok(castleTown.length <= 330, 'fixed castle + town fits the requested binary budget');
  for (const base of [publicBase, 'https://tagquest-my-production-project.vercel.app/']) {
    const budget = nfcBudget(castleTown, base, 496, 5);
    assert.ok(budget.urlBytes <= 490); assert.ok(budget.usedBytes <= 496);
    const restored = readGameHash(new URL(budget.url).hash);
    assert.deepEqual(restored, decodeScenes(castleTown));
    const game = createWorldGame(restored, cases[0].stages[0].id, () => 0.999999);
    assert.equal(game.move('front'), true); assert.equal(game.scene.id, cases[0].stages[1].id);
    assert.deepEqual(game.position, { x: 96, y: 96 });
    assert.equal(game.move('back'), true); assert.equal(game.scene.id, cases[0].stages[0].id);
  }
  const tight = nfcBudget(castleTown, publicBase, 496);
  assert.equal(nfcBudget(castleTown, publicBase, 496, tight.remainingBytes).remainingBytes, 0);
  assert.equal(nfcBudget(castleTown, publicBase, 496, tight.remainingBytes + 1).remainingBytes, -1);
  console.log(`NTAG215 fixed castle + town: binary ${castleTown.length} B, URL ${tight.urlBytes} B, NDEF ${tight.ndefBytes} B; round-trip travel passed.`);
  for (const base of [publicBase, 'https://tagquest-my-production-project.vercel.app/']) {
    const url = gameUrl(adventure, base), hash = new URL(url).hash;
    assert.match(hash, /^#[A-Za-z0-9_-]+$/); assert.equal(isGameHash(hash), true);
    assert.equal(hash.slice(1), base64url(adventure)); assert.deepEqual(readGameHash(hash), decodeScenes(adventure));
    const game = createWorldGame(readGameHash(hash), cases[1].stages[0].id);
    assert.deepEqual(game.position, cases[1].stages[0].spawn); assert.equal(game.move('front'), true, 'restored world plays');
    for (const preset of nfcTagPresets) {
      const b = nfcBudget(adventure, base, preset.ndefBytes, 5);
      assert.equal(b.ndefBytes, serializedSize(url)); assert.equal(b.usedBytes + b.remainingBytes, preset.ndefBytes); assert.equal(b.usedBytes, b.ndefBytes + 5);
    }
  }
  assert.deepEqual(readGameHash(new URL(gameUrl(encodeWorld(cases.at(-1), true).bytes, 'https://tagquest.vercel.app/')).hash), decodeScenes(encodeWorld(cases.at(-1), true).bytes));
  assert.throws(() => nfcBudget(adventure, 'https://tagquest.vercel.app/', 496, -1));
  assert.throws(() => nfcBudget(adventure, 'https://tagquest.vercel.app/', 0));
  console.log(`NFC: ${cases.length} Python/TS round trips, packed exits, RECT, UTF-8, NDEF thresholds and Vercel replay passed.`);
} finally { rmSync(out, { recursive: true, force: true }); }
