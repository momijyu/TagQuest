import type { PixelSprite } from '../data/objects/types';

const cache = new WeakMap<PixelSprite, OffscreenCanvas>();
export function drawSprite(
  context: CanvasRenderingContext2D,
  sprite: PixelSprite,
  x: number,
  y: number,
  scale = 1,
): void {
  context.imageSmoothingEnabled = false;
  if (typeof OffscreenCanvas !== 'undefined' && typeof context.drawImage === 'function') {
    let image = cache.get(sprite);
    if (!image) {
      image = new OffscreenCanvas(sprite.width, sprite.height);
      const paint = image.getContext('2d');
      if (paint) { paintPixels(paint as unknown as CanvasRenderingContext2D, sprite, 0, 0, 1); cache.set(sprite, image); }
      else { paintPixels(context, sprite, x, y, scale); return; }
    }
    context.drawImage(image, x, y, sprite.width * scale, sprite.height * scale); return;
  }
  paintPixels(context, sprite, x, y, scale);
}
function paintPixels(context: CanvasRenderingContext2D, sprite: PixelSprite, x: number, y: number, scale: number): void {

  for (let row = 0; row < sprite.height; row += 1) {
    for (let column = 0; column < sprite.width; column += 1) {
      const pixel = sprite.pixels[row][column];
      if (pixel === '.') continue;

      context.fillStyle = sprite.palette[Number.parseInt(pixel, 36)];
      context.fillRect(x + column * scale, y + row * scale, scale, scale);
    }
  }
}
