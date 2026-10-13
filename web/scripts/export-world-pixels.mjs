import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../node_modules/vite/dist/node/index.js';
import { png } from './pixel-png.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'tagquest-world-pixels-'));
try {
  await build({ configFile: false, logLevel: 'silent', build: {
    lib: { entry: join(root, 'web/src/renderer/world-preview.ts'), formats: ['es'], fileName: () => 'world.mjs' },
    outDir: temporary, emptyOutDir: false,
  } });
  const { worldMaterials, worldLandmarks, worldPreviewScene, drawWorldPreview } = await import(pathToFileURL(join(temporary, 'world.mjs')));
  const output = join(root, 'art/world'); mkdirSync(output, { recursive: true });
  for (const [id, material] of Object.entries({ ...worldMaterials, ...worldLandmarks })) {
    const width = material.width ?? material.size, height = material.height ?? material.size;
    const rgba = Buffer.alloc(width * height * 4);
    material.pixels.forEach((row, y) => [...row].forEach((code, x) => {
      if (code !== '.') rgba.set([...Buffer.from(material.palette[parseInt(code, 36)].slice(1), 'hex'), 255], (y * width + x) * 4);
    }));
    png(join(output, `${id}.png`), width, height, rgba);
  }
  const sheetWidth = 40 * Object.keys(worldLandmarks).length * 4, sheetHeight = 40 * 4, sheet = Buffer.alloc(sheetWidth * sheetHeight * 4);
  for (let i = 0; i < sheetWidth * sheetHeight; i++) sheet.set([24,37,28,255], i * 4);
  Object.values(worldLandmarks).forEach((sprite, i) => sprite.pixels.forEach((row, y) => [...row].forEach((code, x) => {
    if (code === '.') return;
    const color = [...Buffer.from(sprite.palette[parseInt(code, 36)].slice(1), 'hex'), 255];
    for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) sheet.set(color, (((y + 4) * 4 + dy) * sheetWidth + (i * 40 + x + 4) * 4 + dx) * 4);
  })));
  png(join(output, 'locations.png'), sheetWidth, sheetHeight, sheet);
  const scale = 2, width = worldPreviewScene.width * 16 * scale, height = worldPreviewScene.height * 16 * scale;
  const rgba = Buffer.alloc(width * height * 4);
  drawWorldPreview({ fillStyle: '', imageSmoothingEnabled: false,
    fillRect(x, y, w, h) {
      const color = [...Buffer.from(this.fillStyle.slice(1), 'hex'), 255];
      for (let row = y * scale; row < (y + h) * scale; row++) for (let col = x * scale; col < (x + w) * scale; col++) {
        rgba.set(color, (row * width + col) * 4);
      }
    },
  });
  png(join(output, 'preview.png'), width, height, rgba);
  console.log('Exported world terrain and map preview to art/world/');
} finally { rmSync(temporary, { recursive: true, force: true }); }
