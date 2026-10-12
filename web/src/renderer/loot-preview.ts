import { lootSparkleFrames } from '../data/effects/loot-sparkle';
import { townGrass } from '../data/tiles/town-grass';
import { drawSprite } from './sprite';
import { drawTile } from './tile';

interface LootPlacement {
  readonly x: number;
  readonly y: number;
  readonly phase: number;
}

export function drawLootPreview(
  overlay: CanvasRenderingContext2D,
  sample: CanvasRenderingContext2D,
  frame: number,
  placements: readonly LootPlacement[],
): void {
  overlay.clearRect(0, 0, overlay.canvas.width, overlay.canvas.height);
  for (const { x, y, phase } of placements) {
    drawSprite(overlay, lootSparkleFrames[(frame + phase) % lootSparkleFrames.length], x, y);
  }
  for (const x of [0, 16]) for (const y of [0, 16]) drawTile(sample, townGrass, x, y);
  drawSprite(sample, lootSparkleFrames[frame], 8, 8);
}

// 背景とは別のCanvasだけを更新する。HMR時には呼び出し元から停止する。
export function startLootPreview(
  overlay: CanvasRenderingContext2D,
  sample: CanvasRenderingContext2D,
  placements: readonly LootPlacement[],
  isActive = () => true,
): () => void {
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let request: number | undefined;
  let previousFrame = -1;
  function paint(time: number): void {
    const frame = motion.matches ? 2 : Math.floor(time / 160) % lootSparkleFrames.length;
    if (frame !== previousFrame) {
      drawLootPreview(overlay, sample, frame, placements);
      previousFrame = frame;
    }
  }
  function tick(time: number): void {
    if (!document.hidden && isActive()) paint(time);
    request = window.requestAnimationFrame(tick);
  }
  function restart(): void {
    if (request !== undefined) window.cancelAnimationFrame(request);
    request = undefined;
    previousFrame = -1;
    if (isActive()) paint(0);
    if (!motion.matches) request = window.requestAnimationFrame(tick);
  }
  restart();
  motion.addEventListener('change', restart);
  return () => {
    if (request !== undefined) window.cancelAnimationFrame(request);
    motion.removeEventListener('change', restart);
  };
}
