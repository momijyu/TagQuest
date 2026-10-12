import type { ImageSprite } from '../data/characters/types';

export function drawImageSprite(
  context: CanvasRenderingContext2D,
  sprite: ImageSprite,
  x: number,
  y: number,
  scale = 1,
): void {
  context.imageSmoothingEnabled = false;
  context.drawImage(
    sprite.image,
    sprite.sourceX, sprite.sourceY, sprite.width, sprite.height,
    x, y, sprite.width * scale, sprite.height * scale,
  );
  for (const pixel of sprite.pixelCorrections ?? []) {
    context.fillStyle = pixel.color;
    context.fillRect(x + pixel.x * scale, y + pixel.y * scale, scale, scale);
  }
}
