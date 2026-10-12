// フィールド用と戦闘用の魔王を、同じコードのピクセルから書き出す。
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../node_modules/vite/dist/node/index.js';
import { png } from './pixel-png.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'tagquest-demon-lord-'));
try {
  await build({ configFile: false, logLevel: 'silent', build: {
    lib: { entry: join(root, 'web/src/data/characters/demon-lord.ts'), formats: ['es'], fileName: () => 'sprites.mjs' },
    outDir: temporary, emptyOutDir: false,
  } });
  const { demonLord, demonLordBattle } = await import(pathToFileURL(join(temporary, 'sprites.mjs')));
  const output = join(root, 'art/demon-lord'); mkdirSync(output, { recursive: true });
  const scale = 4, width = 112 * scale, height = 64 * scale;
  const preview = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) preview.set([24, 33, 40, 255], i * 4);
  for (const [id, sprite, left] of [['standing', demonLord, 4], ['battle', demonLordBattle, 44]]) {
    const rgba = Buffer.alloc(sprite.width * sprite.height * 4);
    sprite.pixels.forEach((row, y) => [...row].forEach((code, x) => {
      if (code === '.') return;
      const color = [...Buffer.from(sprite.palette[parseInt(code, 36)].slice(1), 'hex'), 255];
      rgba.set(color, (y * sprite.width + x) * 4);
      for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
        preview.set(color, (((60 - sprite.height + y) * scale + dy) * width + (left + x) * scale + dx) * 4);
      }
    }));
    png(join(output, `${id}.png`), sprite.width, sprite.height, rgba);
  }
  png(join(output, 'preview.png'), width, height, preview);
  console.log('Exported standing/battle demon lord and 4x preview to art/demon-lord/');
} finally { rmSync(temporary, { recursive: true, force: true }); }
