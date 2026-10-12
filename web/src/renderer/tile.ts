import type { PixelTile } from '../data/tiles/types';
import type { PixelSprite } from '../data/objects/types';
const sprites = new WeakMap<PixelTile, PixelSprite>();
import { drawSprite } from './sprite';

export function drawTile(
  context: CanvasRenderingContext2D,
  tile: PixelTile,
  x: number,
  y: number,
): void {
  let sprite = sprites.get(tile);
  if (!sprite) { sprite = { ...tile, width: tile.size, height: tile.size }; sprites.set(tile, sprite); }
  drawSprite(context, sprite, x, y);
}
