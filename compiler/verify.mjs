// Cross-language contract test: Python encoder -> bundled TypeScript decoder.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../web/node_modules/vite/dist/node/index.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'tagquest-codec-'));
try {
  await build({
    configFile: false, logLevel: 'silent',
    build: {
      lib: { entry: join(root, 'web/src/codec/scenes.ts'), formats: ['es'], fileName: () => 'decoder.mjs' },
      outDir: temporary, emptyOutDir: false,
    },
  });
  const { decodeScenes } = await import(pathToFileURL(join(temporary, 'decoder.mjs')).href);
  const fixtures = JSON.parse(execFileSync('python3', ['-c', `
import base64, copy, json, sys
from pathlib import Path
sys.path.insert(0, 'compiler')
from build import compile_stage, encode_floor, normalize_buildings
stages = [json.loads(Path(f'compiler/maps/{name}.json').read_text()) for name in ('castle','town')]
# These legacy v8 fixtures predate fractional rates; use an explicit integer rate.
stages[0]['encounter']['rate'] = 10
fixtures = []
def add(source, codec=None):
    # Keep real v8 fixtures for the existing v1-v7 compatibility checks.
    binary = b'TQ' + bytes([8, len(source)])
    for stage in source:
        binary += compile_stage(stage, codec, version=8)[0]
    expected = []
    for stage in source:
        normalized = normalize_buildings(stage)
        expected.append({key: normalized[key] for key in ('id','width','height','spawn','entities')})
        expected[-1]['tiles'] = encode_floor(stage)[0]
        if stage.get('encounter'):
            expected[-1]['encounter'] = stage['encounter']
        if stage.get('exits'):
            expected[-1]['exits'] = stage['exits']
        for entity in expected[-1]['entities']:
            entity.setdefault('parameters', [])
    fixtures.append({'binary': base64.b64encode(binary).decode(), 'expected': expected})
for codec in ('RAW','RLE','RECT'):
    add(copy.deepcopy(stages), codec)
add(copy.deepcopy(stages))
changed = copy.deepcopy(stages)
changed[0]['entities'][1]['parameters'] = [0]
next(e for e in changed[1]['entities'] if e['kind']=='traveler')['x'] = 112
add(changed)
for width,height in ((1,1),(32,32)):
    stage = {'id':2,'name':'edge','width':width,'height':height,
             'spawn':None if width == 1 else {'x':496,'y':480},
             'spawnAnchor':'frame',
             'floor':{'default':'marble','rectangles':[]},
             'entities':[] if width == 1 else [{'kind':'pillar','x':496,'y':488,'parameters':[]}]}
    for codec in ('RAW','RLE','RECT'):
        add([copy.deepcopy(stage)], codec)
empty_stage = {'id':3,'name':'empty','width':4,'height':3,'spawn':None,
               'floor':{'default':'empty','rectangles':[
                   {'tile':'grass','x':1,'y':1,'width':2,'height':1},
                   {'tile':'empty','x':1,'y':1,'width':1,'height':1}]},'entities':[]}
for codec in ('RAW','RLE','RECT'):
    add([copy.deepcopy(empty_stage)], codec)
custom = copy.deepcopy(stages)
custom[0]['entities'][1]['dialogue'] = {'type':'custom','text':'ようこそ！\\n勇者😀 <城> & 冒険'}
for codec in ('RAW','RLE','RECT'):
    add(copy.deepcopy(custom), codec)
print(json.dumps(fixtures))
`], { cwd: root, encoding: 'utf8' }));

  for (const fixture of fixtures) {
    const decoded = decodeScenes(new Uint8Array(Buffer.from(fixture.binary, 'base64')));
    assert.deepEqual(decoded.map(scene => ({ ...scene, tiles: Array.from(scene.tiles) })), fixture.expected);
  }
  const valid = new Uint8Array(Buffer.from(fixtures[3].binary, 'base64'));
  const legacyV7 = valid.slice(); legacyV7[2] = 7;
  assert.deepEqual(decodeScenes(legacyV7), decodeScenes(valid));
  const legacyParts = [valid.subarray(0, 4)], v5Parts = [valid.subarray(0, 4)], v6Parts = [valid.subarray(0, 4)];
  let sourceCursor = 4;
  for (let i = 0; i < valid[3]; i++) {
    const start = sourceCursor, floor = valid[start + 6] | valid[start + 7] << 8, count = valid[start + 8];
    sourceCursor += 9 + floor;
    for (let e = 0; e < count; e++) sourceCursor += 3 + (valid[sourceCursor] >> 6);
    legacyParts.push(valid.subarray(start, sourceCursor));
    const length = valid[sourceCursor] | valid[sourceCursor + 1] << 8;
    sourceCursor += 2 + length;
    v5Parts.push(valid.subarray(start, sourceCursor));
    sourceCursor += 1 + valid[sourceCursor] * 6;
    v6Parts.push(valid.subarray(start, sourceCursor));
    sourceCursor += valid[sourceCursor] ? 2 : 1;
  }
  const legacyV6 = new Uint8Array(Buffer.concat(v6Parts)); legacyV6[2] = 6;
  assert.deepEqual(decodeScenes(legacyV6), decodeScenes(valid).map(({ encounter, ...scene }) => scene));
  const legacyV5 = new Uint8Array(Buffer.concat(v5Parts)); legacyV5[2] = 5;
  assert.deepEqual(decodeScenes(legacyV5), decodeScenes(valid).map(({ exits, encounter, ...scene }) => scene));
  const legacyV4 = new Uint8Array(Buffer.concat(legacyParts)); legacyV4[2] = 4;
  const oldExpected = decodeScenes(valid).map(({ exits, encounter, ...scene }) => ({ ...scene, entities: scene.entities.map(({ dialogue, itemId, ...entity }) => entity) }));
  assert.deepEqual(decodeScenes(legacyV4), oldExpected);
  const legacyV3 = legacyV4.slice();
  legacyV3[2] = 3;
  const catalog = JSON.parse(readFileSync(join(root, 'web/src/data/scene-catalog.json')));
  function legacyNpcs(binary, kinds) {
    let cursor = 4;
    for (let index = 0; index < binary[3]; index++) {
      const length = binary[cursor + 6] | binary[cursor + 7] << 8;
      const count = binary[cursor + 8];
      cursor += 9 + length;
      for (let entity = 0; entity < count; entity++) {
        const control = binary[cursor];
        if (kinds.includes(catalog.entities[control & 63].name)) binary[cursor + 1] -= 4;
        cursor += 3 + (control >> 6);
      }
    }
  }
  legacyNpcs(legacyV3, ['king', 'weapon-merchant', 'armor-merchant', 'item-merchant']);
  assert.deepEqual(decodeScenes(legacyV3), oldExpected);
  const legacyV2 = legacyV3.slice();
  legacyV2[2] = 2;
  legacyNpcs(legacyV2, ['traveler', 'resident', 'elder']);
  assert.deepEqual(decodeScenes(legacyV2), oldExpected);
  const legacyV1 = legacyV2.slice();
  legacyV1[2] = 1;
  legacyV1[7] -= 4;
  assert.deepEqual(decodeScenes(legacyV1), oldExpected);
  for (let size = 0; size < valid.length; size += 1) assert.throws(() => decodeScenes(valid.subarray(0, size)));
  const firstFloorLength = valid[10] | valid[11] << 8;
  const firstEntity = 13 + firstFloorLength;
  const firstExtra = 4 + 9 + firstFloorLength + 13;
  const firstExits = firstExtra + 2 + (valid[firstExtra] | valid[firstExtra + 1] << 8);
  const firstEncounter = firstExits + 1 + valid[firstExits] * 6;
  const secondStage = firstEncounter + (valid[firstEncounter] ? 2 : 1);
  for (const [offset, value] of [[2, 10], [3, 0], [5, 0], [7, 255], [7, 55], [8, 47], [9, 3], [13, 16],
    [14, valid[14] + 1], [firstEntity, 63], [firstEntity, 64], [firstEntity + 1, 255],
    [firstEntity + 6, 2], [secondStage, 0]]) {
    const broken = valid.slice();
    broken[offset] = value;
    assert.throws(() => decodeScenes(broken), `invalid byte at ${offset}`);
  }
  const outside = valid.slice();
  outside.set([0x2f, 0x80, 0x00], 15); // RECT x=31 in a 7-cell-wide map.
  assert.throws(() => decodeScenes(outside));
  assert.throws(() => decodeScenes(new Uint8Array([...valid, 0])));
  const oddRaw = new Uint8Array(Buffer.from(fixtures[5].binary, 'base64'));
  oddRaw[13] |= 1;
  assert.throws(() => decodeScenes(oddRaw));
  const overflowingRle = new Uint8Array(Buffer.from(fixtures[6].binary, 'base64'));
  overflowingRle[13] |= 15;
  assert.throws(() => decodeScenes(overflowingRle));
  console.log(`Python -> TypeScript: ${fixtures.length} round trips passed; malformed/truncated binaries rejected.`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
