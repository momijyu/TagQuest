import type { PixelTile } from './types';
import { castleWallMaterial } from './castle-wall-material';

/** 石積みの正面に、明るい天端と側面・下端の陰を付けた奥の壁。 */
export const castleWall = {
  ...castleWallMaterial,
  pixels: castleWallMaterial.pixels.map((row, y) => {
    const edge = { 0: '1', 1: '2', 2: '3', 3: '0', 14: '3', 15: '5' }[y];
    return edge ? edge.repeat(castleWallMaterial.size) : row;
  }),
} satisfies PixelTile;
