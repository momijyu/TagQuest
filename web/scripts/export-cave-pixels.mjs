import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../node_modules/vite/dist/node/index.js';
import { png } from './pixel-png.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'tagquest-cave-pixels-'));
try {
  await build({ configFile: false, logLevel: 'silent', build: {
    lib: { entry: join(root, 'web/src/renderer/cave-preview.ts'), formats: ['es'], fileName: () => 'cave.mjs' },
    outDir: temporary, emptyOutDir: false,
  } });
  const { caveMaterials, caveStagePreview, drawCaveStagePreview } = await import(pathToFileURL(join(temporary, 'cave.mjs')));
  const output = join(root, 'art/cave'); mkdirSync(output, { recursive: true });
  for (const [id, material] of Object.entries(caveMaterials)) {
    const rgba = Buffer.alloc(material.size * material.size * 4);
    material.pixels.forEach((row, y) => [...row].forEach((code, x) => {
      rgba.set([...Buffer.from(material.palette[parseInt(code, 36)].slice(1), 'hex'), 255], (y * material.size + x) * 4);
    }));
    png(join(output, `${id}.png`), material.size, material.size, rgba);
  }
  const scale = 2, width = caveStagePreview.width * 16 * scale, height = caveStagePreview.height * 16 * scale;
  const rgba = Buffer.alloc(width * height * 4);
  drawCaveStagePreview({ fillStyle: '', imageSmoothingEnabled: false,
    fillRect(x, y, w, h) {
      const color = [...Buffer.from(this.fillStyle.slice(1), 'hex'), 255];
      for (let row = y * scale; row < (y + h) * scale; row++) for (let col = x * scale; col < (x + w) * scale; col++) {
        rgba.set(color, (row * width + col) * 4);
      }
    },
  });
  png(join(output, 'stage.png'), width, height, rgba);
  console.log('Exported cave floor, wall and stage to art/cave/');
} finally { rmSync(temporary, { recursive: true, force: true }); }
