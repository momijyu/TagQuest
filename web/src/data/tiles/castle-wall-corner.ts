import type { PixelTile } from './types';
import { castleWallMaterial } from './castle-wall-material';
import { castleWall } from './castle-wall';
import { castleWallLeft, castleWallRight } from './castle-side-wall';

/** 天端の明るい縁と内側の陰を曲げ、厚みをつなげる左上の角。 */
export const castleWallTopLeft = {
  ...castleWallMaterial,
  pixels: castleWallMaterial.pixels.map((row, y) => {
    if (y === 0) return castleWall.pixels[y];
    if (y === 1) return '1' + castleWall.pixels[y].slice(1);
    if (y === 2) return '12' + castleWall.pixels[y].slice(2);
    if (y === 3) return '123' + castleWall.pixels[y].slice(3);
    if (y >= 14) return castleWallLeft.pixels[y];
    return '1230' + row.slice(4);
  }),
} satisfies PixelTile;

/** 石積みの模様を保ちながら厚みをつなげる右上の角。 */
export const castleWallTopRight = {
  ...castleWallMaterial,
  pixels: castleWallMaterial.pixels.map((row, y) => {
    if (y === 0) return castleWall.pixels[y];
    if (y === 1) return castleWall.pixels[y].slice(0, -1) + '1';
    if (y === 2) return castleWall.pixels[y].slice(0, -2) + '21';
    if (y === 3) return castleWall.pixels[y].slice(0, -3) + '321';
    if (y >= 14) return castleWallRight.pixels[y];
    return row.slice(0, -4) + '0321';
  }),
} satisfies PixelTile;
