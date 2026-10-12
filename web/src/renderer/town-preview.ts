import { townGrass } from '../data/tiles/town-grass';
import { townDirt } from '../data/tiles/town-dirt';
import { townBrick } from '../data/tiles/town-brick';
import { drawTile } from './tile';

export const townFloorTiles = {
  grass: townGrass,
  dirt: townDirt,
  brick: townBrick,
} as const;

// 配置は素材のつながりを確認するための試作。ゲーム用マップではない。
export function drawTownPreview(context: CanvasRenderingContext2D): void {
  const size = townGrass.size;
  const columns = context.canvas.width / size;
  const rows = context.canvas.height / size;
  const centerX = Math.floor(columns / 2);
  const centerY = Math.floor(rows / 2);

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const dx = Math.abs(column - centerX);
      const dy = Math.abs(row - centerY);
      const plaza = dx <= 1 && dy <= 1;
      const road = dx === 0 || dy === 0;
      const shoulder = dx === 1 || dy === 1;
      const tile = plaza || road ? townBrick : shoulder ? townDirt : townGrass;
      drawTile(context, tile, column * size, row * size);
    }
  }
}
