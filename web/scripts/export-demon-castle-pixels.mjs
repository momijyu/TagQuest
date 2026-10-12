import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../node_modules/vite/dist/node/index.js';
import { png } from './pixel-png.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'tagquest-demon-castle-pixels-'));
try {
  await build({ configFile: false, logLevel: 'silent', build: {
    lib: { entry: join(root, 'web/src/renderer/demon-castle-preview.ts'), formats: ['es'], fileName: () => 'demon-castle.mjs' },
    outDir: temporary, emptyOutDir: false,
  } });
  const { demonCastleMaterials, demonCastleStagePreview, drawDemonCastleStagePreview } = await import(pathToFileURL(join(temporary, 'demon-castle.mjs')));
  const output = join(root, 'art/demon-castle'); mkdirSync(output, { recursive: true });
  for (const [id, material] of Object.entries(demonCastleMaterials)) {
    const width = material.size ?? material.width, height = material.size ?? material.height;
    const rgba = Buffer.alloc(width * height * 4);
    material.pixels.forEach((row, y) => [...row].forEach((code, x) => {
      if (code === '.') return;
      rgba.set([...Buffer.from(material.palette[parseInt(code, 36)].slice(1), 'hex'), 255], (y * width + x) * 4);
    }));
    png(join(output, `${id}.png`), width, height, rgba);
  }
  const scale = 2, width = demonCastleStagePreview.width * 16 * scale, height = demonCastleStagePreview.height * 16 * scale;
  const rgba = Buffer.alloc(width * height * 4);
  drawDemonCastleStagePreview({ fillStyle: '', imageSmoothingEnabled: false,
    fillRect(x, y, w, h) {
      const color = [...Buffer.from(this.fillStyle.slice(1), 'hex'), 255];
      for (let row = y * scale; row < (y + h) * scale; row++) for (let col = x * scale; col < (x + w) * scale; col++) {
        rgba.set(color, (row * width + col) * 4);
      }
    },
  });
  png(join(output, 'stage.png'), width, height, rgba);
  console.log('Exported demon castle materials and stage to art/demon-castle/');
} finally { rmSync(temporary, { recursive: true, force: true }); }
