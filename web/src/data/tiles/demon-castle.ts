import type { PixelTile } from './types';
import { castleFloor } from './castle-floor';
import { castleCarpet } from './castle-carpet';
import { castleWall } from './castle-wall';
import { castleWallLeft, castleWallRight } from './castle-side-wall';
import { castleWallTopLeft, castleWallTopRight } from './castle-wall-corner';

const wallPalette = ['#393443', '#898090', '#625a6c', '#4b4555', '#736a7e', '#25212e'];

/** 既存の城と同じ石積み・ドットの密度で、暗い紫灰色の城を描く。 */
export const demonCastleTiles = {
  'demon-floor': { ...castleFloor, palette: ['#37333f', '#655c71', '#443f4f', '#51495e', '#24212b'] },
  'demon-carpet': { ...castleCarpet, palette: ['#553365', '#3f254e', '#70437f', '#bd9a60'] },
  'demon-wall-top': { ...castleWall, palette: wallPalette },
  'demon-wall-left': { ...castleWallLeft, palette: wallPalette },
  'demon-wall-right': { ...castleWallRight, palette: wallPalette },
  'demon-wall-top-left': { ...castleWallTopLeft, palette: wallPalette },
  'demon-wall-top-right': { ...castleWallTopRight, palette: wallPalette },
} as const satisfies Record<string, PixelTile>;
