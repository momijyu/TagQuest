import type { PixelTile } from './types';
import { castleWallMaterial } from './castle-wall-material';

/** 明るい縁・石積みの正面・内側の陰を描き分けた左壁。 */
export const castleWallLeft = {
  ...castleWallMaterial,
  pixels: castleWallMaterial.pixels.map((row) => '1230' + row.slice(4, 12) + '3355'),
} satisfies PixelTile;

/** 石積みの模様を保ち、縁と内側の陰を右壁の向きに合わせる。 */
export const castleWallRight = {
  ...castleWallMaterial,
  pixels: castleWallMaterial.pixels.map((row) => '5533' + row.slice(4, 12) + '0321'),
} satisfies PixelTile;
