// Webと同じ描画関数から原寸素材と3倍の見本を出力する。
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../node_modules/vite/dist/node/index.js';
import { png } from './pixel-png.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'tagquest-forest-pixels-'));
try {
  await build({ configFile: false, logLevel: 'silent', build: {
    lib: { entry: join(root, 'web/src/renderer/forest-preview.ts'), formats: ['es'], fileName: () => 'forest.mjs' },
    outDir: temporary, emptyOutDir: false,
  } });
  const { forestMaterials, drawForestPreview, forestStagePreview, drawForestStagePreview } = await import(pathToFileURL(join(temporary, 'forest.mjs')));
  const output = join(root, 'art/forest'); mkdirSync(output, { recursive: true });
  for (const [id, material] of Object.entries(forestMaterials)) {
    const width = material.width ?? material.size, height = material.height ?? material.size;
    const rgba = Buffer.alloc(width * height * 4);
    material.pixels.forEach((row, y) => [...row].forEach((code, x) => {
      if (code !== '.') rgba.set([...Buffer.from(material.palette[parseInt(code, 36)].slice(1), 'hex'), 255], (y * width + x) * 4);
    }));
    png(join(output, `${id}.png`), width, height, rgba);
  }
  const scale = 3, width = 176 * scale, height = 144 * scale;
  const rgba = Buffer.alloc(width * height * 4);
  const context = { fillStyle: '', imageSmoothingEnabled: false,
    fillRect(x, y, w, h) {
      const color = [...Buffer.from(this.fillStyle.slice(1), 'hex'), 255];
      for (let row = y * scale; row < (y + h) * scale; row++) for (let col = x * scale; col < (x + w) * scale; col++) {
        rgba.set(color, (row * width + col) * 4);
      }
    },
  };
  drawForestPreview(context);
  png(join(output, 'preview.png'), width, height, rgba);
  const stageScale = 2, stageWidth = forestStagePreview.width * 16 * stageScale, stageHeight = forestStagePreview.height * 16 * stageScale;
  const stageRgba = Buffer.alloc(stageWidth * stageHeight * 4);
  drawForestStagePreview({ fillStyle: '', imageSmoothingEnabled: false,
    fillRect(x, y, w, h) {
      const color = [...Buffer.from(this.fillStyle.slice(1), 'hex'), 255];
      for (let row = y * stageScale; row < (y + h) * stageScale; row++) for (let col = x * stageScale; col < (x + w) * stageScale; col++) {
        stageRgba.set(color, (row * stageWidth + col) * 4);
      }
    },
  });
  png(join(output, 'stage.png'), stageWidth, stageHeight, stageRgba);
  console.log('Exported grass, forest ground, tree and preview to art/forest/');
} finally { rmSync(temporary, { recursive: true, force: true }); }
