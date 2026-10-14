import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../node_modules/vite/dist/node/index.js';
import { png } from './pixel-png.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'tagquest-adventure-materials-'));
try {
  await build({ configFile: false, logLevel: 'silent', build: {
    lib: { entry: join(root, 'web/src/renderer/adventure-materials.ts'), formats: ['es'], fileName: () => 'materials.mjs' },
    outDir: temporary, emptyOutDir: false,
  } });
  const { adventureMaterials } = await import(pathToFileURL(join(temporary, 'materials.mjs')));
  const output = join(root, 'art/adventure-materials'); mkdirSync(output, { recursive: true });
  const scale = 4, cell = Math.max(40, ...Object.values(adventureMaterials).map(({ sprite }) => Math.max(sprite.width, sprite.height) + 8));
  const width = Object.keys(adventureMaterials).length * cell * scale, height = cell * scale;
  const preview = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) preview.set([24, 33, 40, 255], i * 4);
  for (const [index, [id, { sprite }]] of Object.entries(adventureMaterials).entries()) {
    const rgba = Buffer.alloc(sprite.width * sprite.height * 4);
    sprite.pixels.forEach((row, y) => [...row].forEach((code, x) => {
      if (code === '.') return;
      const color = [...Buffer.from(sprite.palette[parseInt(code, 36)].slice(1), 'hex'), 255];
      rgba.set(color, (y * sprite.width + x) * 4);
      const left = index * cell + (cell - sprite.width) / 2, top = cell - 4 - sprite.height;
      for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
        preview.set(color, (((top + y) * scale + dy) * width + (left + x) * scale + dx) * 4);
      }
    }));
    png(join(output, `${id}.png`), sprite.width, sprite.height, rgba);
  }
  png(join(output, 'preview.png'), width, height, preview);
  console.log(`Exported ${Object.keys(adventureMaterials).length} adventure materials to art/adventure-materials/`);
} finally { rmSync(temporary, { recursive: true, force: true }); }
