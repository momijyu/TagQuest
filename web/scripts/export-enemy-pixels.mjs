// コードで描いたピクセルを、そのままPNGと拡大見本へ書き出す。
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { png } from './pixel-png.mjs';
import { build } from '../node_modules/vite/dist/node/index.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'tagquest-enemy-pixels-'));
try {
  await build({ configFile: false, logLevel: 'silent', build: {
    lib: { entry: join(root, 'web/src/data/encounters/enemy-pixels.ts'), formats: ['es'], fileName: () => 'pixels.mjs' },
    outDir: temporary, emptyOutDir: false,
  } });
  const { enemyPixelSprites } = await import(pathToFileURL(join(temporary, 'pixels.mjs')));
  const output = join(root, 'art/enemies/pixels'); mkdirSync(output, { recursive: true });
  const sprites = Object.entries(enemyPixelSprites), scale = 4;
  const cellWidth = Math.max(...sprites.map(([, sprite]) => sprite.width)) + 8;
  const sheetWidth = cellWidth * sprites.length * scale;
  const sheetHeight = (Math.max(...sprites.map(([, sprite]) => sprite.height)) + 8) * scale;
  const sheet = Buffer.alloc(sheetWidth * sheetHeight * 4);
  for (let pixel = 0; pixel < sheetWidth * sheetHeight; pixel++) sheet.set([24, 37, 28, 255], pixel * 4);
  for (const [index, [id, sprite]] of sprites.entries()) {
    const rgba = Buffer.alloc(sprite.width * sprite.height * 4);
    for (let y = 0; y < sprite.height; y++) for (let x = 0; x < sprite.width; x++) {
      const code = sprite.pixels[y][x]; if (code === '.') continue;
      const color = [...Buffer.from(sprite.palette[parseInt(code, 36)].slice(1), 'hex'), 255];
      rgba.set(color, (y * sprite.width + x) * 4);
      const left = (index * cellWidth + (cellWidth - sprite.width) / 2 + x) * scale;
      const top = (4 + y) * scale;
      for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) sheet.set(color, ((top + dy) * sheetWidth + left + dx) * 4);
    }
    png(join(output, `${id}.png`), sprite.width, sprite.height, rgba);
  }
  png(join(output, 'preview.png'), sheetWidth, sheetHeight, sheet);
  console.log(`Exported ${sprites.length} pixel sprites and preview to art/enemies/pixels/`);
} finally { rmSync(temporary, { recursive: true, force: true }); }
