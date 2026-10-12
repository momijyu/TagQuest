import type { SceneData } from '../codec/scenes';
import catalog from '../data/scene-catalog.json';
import { wallKind } from '../data/walls';
import type { WallKind } from '../data/walls';
import type { PixelTile } from '../data/tiles/types';
import { castleWall } from '../data/tiles/castle-wall';
import { castleWallLeft, castleWallRight } from '../data/tiles/castle-side-wall';
import { castleWallTopLeft, castleWallTopRight } from '../data/tiles/castle-wall-corner';
import { castleWallMaterial } from '../data/tiles/castle-wall-material';
import { demonCastleTiles } from '../data/tiles/demon-castle';

type WallShape = 'top' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom' | 'bottom-left' | 'bottom-right' | 'solid' | 'post';
// 下側の壁も石積み自体は反転させず、縁と角の厚みだけを下向きにする。
const bottom = { ...castleWallMaterial, pixels: castleWallMaterial.pixels.map((row, y) => y < 4 || y >= 14 ? castleWall.pixels[15 - y] : row) };
function lowerCorner(upper: PixelTile): PixelTile {
  return { ...upper, pixels: castleWallMaterial.pixels.map((row, y) => y < 4 || y >= 12 ? upper.pixels[15 - y] : upper.pixels[y].slice(0, 4) + row.slice(4, 12) + upper.pixels[y].slice(12)) };
}
const post = { ...castleWallMaterial, pixels: castleWallMaterial.pixels.map((_, y) => y < 4 || y >= 14 ? castleWall.pixels[y] : castleWallLeft.pixels[y]) };
const castle: Record<WallShape, PixelTile> = {
  top: castleWall, left: castleWallLeft, right: castleWallRight,
  'top-left': castleWallTopLeft, 'top-right': castleWallTopRight,
  bottom, 'bottom-left': lowerCorner(castleWallTopLeft), 'bottom-right': lowerCorner(castleWallTopRight),
  solid: castleWallMaterial, post,
};
const palettes: Record<WallKind, readonly string[]> = { 'wall-top': castleWall.palette, 'demon-wall-top': demonCastleTiles['demon-wall-top'].palette };
const variants = Object.fromEntries(Object.entries(palettes).map(([kind, palette]) =>
  [kind, Object.fromEntries(Object.entries(castle).map(([shape, tile]) => [shape, { ...tile, palette }]))])) as Record<WallKind, Record<WallShape, PixelTile>>;

/** 周囲8マスを参照する。空白・マップ外は部屋の床として扱わない。 */
export function wallShape(scene: SceneData, x: number, y: number): WallShape {
  const at = (dx: number, dy: number): string | undefined => {
    const column = x + dx, row = y + dy;
    return column >= 0 && column < scene.width && row >= 0 && row < scene.height
      ? catalog.tiles[scene.tiles[row * scene.width + column]] : undefined;
  };
  const kind = wallKind(at(0, 0));
  const same = (dx: number, dy: number) => kind !== undefined && wallKind(at(dx, dy)) === kind;
  const floor = (dx: number, dy: number) => {
    const name = at(dx, dy);
    return name !== undefined && name !== 'empty' && !wallKind(name) && name !== 'cave-wall';
  };
  const n = floor(0, -1), e = floor(1, 0), s = floor(0, 1), w = floor(-1, 0);
  if (!same(0, -1) && !same(1, 0) && !same(0, 1) && !same(-1, 0)) return 'post';
  // 一枚の壁の両側に床がある場合も、同じ厚みの直線にする。
  if (n && s) return 'top';
  if (e && w) return 'left';
  if ((s && e) || (!same(0, -1) && !same(-1, 0) && !n && !w && same(1, 0) && same(0, 1) && floor(1, 1))) return 'top-left';
  if ((s && w) || (!same(0, -1) && !same(1, 0) && !n && !e && same(-1, 0) && same(0, 1) && floor(-1, 1))) return 'top-right';
  if ((n && e) || (!same(0, 1) && !same(-1, 0) && !s && !w && same(1, 0) && same(0, -1) && floor(1, -1))) return 'bottom-left';
  if ((n && w) || (!same(0, 1) && !same(1, 0) && !s && !e && same(-1, 0) && same(0, -1) && floor(-1, -1))) return 'bottom-right';
  if (s) return 'top';
  if (n) return 'bottom';
  if (e) return 'left';
  if (w) return 'right';
  return 'solid';
}

export function automaticWall(scene: SceneData, x: number, y: number): PixelTile | undefined {
  const kind = wallKind(catalog.tiles[scene.tiles[y * scene.width + x]]);
  return kind ? variants[kind][wallShape(scene, x, y)] : undefined;
}
