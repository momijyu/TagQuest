import type { PixelTile } from './types';

/** 床を描かない空白のマス。背景は透過する。 */
export const emptyTile = {
  size: 16,
  palette: [],
  pixels: Array.from({ length: 16 }, () => '................'),
} as const satisfies PixelTile;
