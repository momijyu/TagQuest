// 1種類の壁を配置した部屋と、太い壁・十字の見本を描画する。
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../node_modules/vite/dist/node/index.js';
import { png } from './pixel-png.mjs';
const root = fileURLToPath(new URL('../..', import.meta.url)), out = mkdtempSync(join(tmpdir(), 'tagquest-wall-preview-'));
try {
  await build({ configFile: false, logLevel: 'silent', build: { lib: { entry: {
    renderer: join(root, 'web/src/renderer/compiled-scene.ts'), model: join(root, 'web/src/editor/model.ts'),
  }, formats: ['es'], fileName: (_, name) => `${name}.mjs` }, outDir: out, emptyOutDir: false } });
  const { drawCompiledScene } = await import(pathToFileURL(join(out, 'renderer.mjs')));
  const { parseWorld, toSceneData } = await import(pathToFileURL(join(out, 'model.mjs')));
  const columns = 11, rows = 9, scale = 2, width = columns * 16 * scale * 3, height = rows * 16 * scale * 2;
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) rgba.set([24, 33, 40, 255], i * 4);
  for (const [line, [wall, floor]] of [['wall-top', 'marble'], ['demon-wall-top', 'demon-floor']].entries()) {
    for (let index = 0; index < 3; index++) {
      const rect = (tile, x, y, w, h) => ({ tile, x, y, width: w, height: h });
      const rectangles = [rect(floor, 1, 1, 9, 7)];
      if (index === 0) rectangles.push(rect(wall, 1, 1, 9, 1), rect(wall, 1, 2, 1, 6), rect(wall, 9, 2, 1, 6), rect(wall, 1, 7, 4, 1), rect(wall, 6, 7, 4, 1));
      else if (index === 1) rectangles.push(rect(wall, 3, 2, 5, 5), rect(floor, 5, 4, 3, 3));
      else rectangles.push(rect(wall, 5, 2, 1, 5), rect(wall, 3, 4, 5, 1), rect(wall, 2, 2, 1, 1));
      const scene = toSceneData(parseWorld({ id: 0, name: '自動の壁', width: columns, height: rows, spawn: null,
        floor: { default: 'empty', rectangles }, entities: [] }).stages[0]);
      drawCompiledScene({ fillStyle: '', imageSmoothingEnabled: false, fillRect(x, y, w, h) {
        const color = [...Buffer.from(this.fillStyle.slice(1), 'hex'), 255];
        for (let dy = y * scale; dy < (y + h) * scale; dy++) for (let dx = x * scale; dx < (x + w) * scale; dx++) {
          rgba.set(color, ((line * rows * 16 * scale + dy) * width + index * columns * 16 * scale + dx) * 4);
        }
      } }, scene);
    }
  }
  mkdirSync(join(root, 'art/walls'), { recursive: true });
  png(join(root, 'art/walls/automatic.png'), width, height, rgba);
  console.log('Exported automatic castle/demon walls to art/walls/automatic.png');
} finally { rmSync(out, { recursive: true, force: true }); }
