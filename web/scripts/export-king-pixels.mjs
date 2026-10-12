// 主人公ベースの王様を、同じ64pxの原寸と4倍の見本に出力する。
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../node_modules/vite/dist/node/index.js';
import { png, readPng } from './pixel-png.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'tagquest-king-pixels-'));
try {
  await build({ configFile: false, logLevel: 'silent', build: {
    lib: { entry: join(root, 'web/src/data/characters/king-directions.ts'), formats: ['es'], fileName: () => 'pixels.mjs' },
    outDir: temporary, emptyOutDir: false,
  } });
  const { makeKingDirection } = await import(pathToFileURL(join(temporary, 'pixels.mjs')));
  const output = join(root, 'art/king/directions'); mkdirSync(output, { recursive: true });
  const hero = readPng(join(root, 'web/src/assets/player/hero-sheet-64.png'));
  const front = readPng(join(root, 'web/src/assets/king/king-standing-hero-style-64.png'));
  if (hero.width !== 128 || hero.height !== 128 || front.width !== 64 || front.height !== 64) throw new Error('Unexpected source sprite dimensions');
  const sprites = [['front', front.rgba]];
  for (const [direction, sourceX, sourceY] of [['back', 64, 0], ['left', 0, 64], ['right', 64, 64]]) {
    const rgba = new Uint8ClampedArray(64 * 64 * 4);
    for (let y = 0; y < 64; y++) rgba.set(hero.rgba.subarray(((y + sourceY) * 128 + sourceX) * 4, ((y + sourceY) * 128 + sourceX + 64) * 4), y * 64 * 4);
    sprites.push([direction, Buffer.from(makeKingDirection(rgba, direction))]);
  }
  const scale = 4, cell = 72, width = sprites.length * cell * scale, height = cell * scale;
  const preview = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) preview.set([24, 33, 40, 255], i * 4);
  for (const [index, [direction, rgba]] of sprites.entries()) {
    png(join(output, `${direction}.png`), 64, 64, rgba);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const pixel = rgba.subarray((y * 64 + x) * 4, (y * 64 + x + 1) * 4);
      const alpha = pixel[3] / 255, color = [24, 33, 40].map((background, i) => Math.round(pixel[i] * alpha + background * (1 - alpha)));
      for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
        preview.set([...color, 255], (((y + 4) * scale + dy) * width + (index * cell + x + 4) * scale + dx) * 4);
      }
    }
  }
  png(join(output, 'preview.png'), width, height, preview);
  console.log('Exported hero-style king front/back/left/right to art/king/directions/');
} finally { rmSync(temporary, { recursive: true, force: true }); }
