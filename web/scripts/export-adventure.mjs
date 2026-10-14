import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../node_modules/vite/dist/node/index.js';
import { png, readPng } from './pixel-png.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'tagquest-adventure-'));
try {
  await build({ configFile: false, logLevel: 'silent', build: {
    lib: { entry: { adventure: join(root, 'web/src/editor/adventure-presets.ts'), model: join(root, 'web/src/editor/model.ts'),
      postgame: join(root, 'web/src/game/postgame.ts'), renderer: join(root, 'web/src/renderer/compiled-scene.ts'), sparkle: join(root, 'web/src/data/effects/loot-sparkle.ts') },
      formats: ['es'], fileName: (_, name) => `${name}.mjs` },
    outDir: temporary, emptyOutDir: false,
  } });
  const { createAdventurePreset } = await import(pathToFileURL(join(temporary, 'adventure.mjs')));
  const { toSceneData } = await import(pathToFileURL(join(temporary, 'model.mjs')));
  const { drawCompiledScene } = await import(pathToFileURL(join(temporary, 'renderer.mjs')));
  const { dimensionScene } = await import(pathToFileURL(join(temporary, 'postgame.mjs')));
  const requested = process.argv[2] ?? 'normal';
  if (!['normal', 'large', 'small', '--all', '--expanded'].includes(requested)) throw new Error('Specify normal, large, small or --all');
  for (const size of requested === '--all' ? ['normal', 'large', 'small'] : requested === '--expanded' ? ['normal', 'large'] : [requested]) {
    const output = join(root, size === 'normal' ? 'art/adventure' : `art/adventure-${size}`); mkdirSync(output, { recursive: true });
    const source = join(output, 'world.json');
    const world = createAdventurePreset(size);
    writeFileSync(source, JSON.stringify(world, null, 2) + '\n');
    execFileSync('python3', [join(root, 'compiler/build.py'), '--maps', source, '--compact', '--out', join(output, 'world.bin')], { stdio: 'inherit' });
    const king = { image: readPng(join(root, 'web/src/assets/king/king-sheet-64.png')), sourceX: 0, sourceY: 0, width: 64, height: 64 };
    const player = { image: readPng(join(root, 'web/src/assets/player/hero-sheet-64.png')), sourceX: 0, sourceY: 0, width: 64, height: 64 };
    const { lootSparkleFrames } = await import(pathToFileURL(join(temporary, 'sparkle.mjs')));
    const previews = world.stages.map(stage => ({ id: stage.id, scene: toSceneData(stage) }));
    if (size === 'normal') previews.push({ id: 255, scene: dimensionScene(255, 5, 1, 1) });
    for (const { id, scene } of previews) {
      const stage = scene;
      const scale = 2, width = stage.width * 16 * scale, height = stage.height * 16 * scale, rgba = Buffer.alloc(width * height * 4);
      const context = { fillStyle: '', fillRect(x, y, w, h) {
        const color = [...Buffer.from(this.fillStyle.slice(1), 'hex'), 255];
        for (let row = Math.max(0, y * scale); row < Math.min(height, (y + h) * scale); row++) for (let col = Math.max(0, x * scale); col < Math.min(width, (x + w) * scale); col++) rgba.set(color, (row * width + col) * 4);
      }, drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh) {
        for (let row = Math.max(0, dy * scale); row < Math.min(height, (dy + dh) * scale); row++) for (let col = Math.max(0, dx * scale); col < Math.min(width, (dx + dw) * scale); col++) {
          const source = (Math.floor(sy + (row / scale - dy) * sh / dh) * image.width + Math.floor(sx + (col / scale - dx) * sw / dw)) * 4;
          const target = (row * width + col) * 4, alpha = image.rgba[source + 3] / 255;
          if (!alpha) continue;
          for (let c = 0; c < 3; c++) rgba[target + c] = Math.round(image.rgba[source + c] * alpha + rgba[target + c] * (1 - alpha));
          rgba[target + 3] = 255;
        }
      } };
      drawCompiledScene(context, scene, { king, player });
      for (const entity of stage.entities) if (entity.kind === 'loot') {
        const sprite = lootSparkleFrames[2];
        sprite.pixels.forEach((row, y) => [...row].forEach((code, x) => {
          if (code === '.') return;
          context.fillStyle = sprite.palette[parseInt(code, 36)]; context.fillRect(entity.x + x, entity.y + y, 1, 1);
        }));
      }
      const expansionNames = {'旅人の港と商人街':'traveler-port','地下水路と闇市':'black-market','沈没神殿':'sunken-temple','古い民家の地下蔵':'locked-house','霧深き腐海・毒の湿原':'poison-marsh','蜘蛛の毒巣':'arachne-nest','凍てつく霊峰・氷狼の谷':'frost-peak','氷狼の洞穴':'fenrir-nest','灼熱の古戦場・竜の巣':'burning-battlefield','紅蓮の竜穴':'volkex-nest'};
      const stageName=world.stages.find(stage=>stage.id===id)?.name;
      const file = expansionNames[stageName] ?? ['castle', 'town', 'world', 'forest', 'cave', 'demon-castle', 'north-world', 'north-town', 'deep-forest', 'crystal-cave', 'east-world', 'ruins', 'north-castle', 'seaside-town', 'fairy-garden', 'frontier-world', 'frontier-forest', 'forgotten-fort'][stage.id];
      if (id === 255) { const realmOutput = join(root, 'art/postgame'); mkdirSync(realmOutput, { recursive: true }); png(join(realmOutput, 'void-realm.png'), width, height, rgba); }
      else png(join(output, `${file}.png`), width, height, rgba);
    }
    console.log(`Exported ${world.stages.length} ${size} adventure previews to ${output}`);
  }
} finally { rmSync(temporary, { recursive: true, force: true }); }
