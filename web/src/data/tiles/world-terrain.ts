import { forestGround } from './forest-ground';
import { townGrass } from './town-grass';
import { worldMountain, worldForest } from '../objects/world-terrain';
import type { PixelTile } from './types';
function terrain(sprite: { readonly palette: readonly string[]; readonly pixels: readonly string[] }, base: PixelTile = townGrass): PixelTile {
  const palette = [...base.palette, ...sprite.palette];
  const pixels = base.pixels.map((row, y) => [...row].map((c, x) => sprite.pixels[y][x] === '.' ? c : (base.palette.length + parseInt(sprite.pixels[y][x], 36)).toString(36)).join(''));
  return { ...base, palette, pixels };
}
export const worldTerrainTiles = { 'world-mountain': terrain(worldMountain), 'world-forest': terrain(worldForest, forestGround) };
