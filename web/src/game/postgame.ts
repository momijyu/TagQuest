import type { SceneData } from '../codec/scenes';
import catalog from '../data/scene-catalog.json';

export function dimensionScene(id: number, targetStageId: number, targetX: number, targetY: number): SceneData {
  const width = 19, height = 23, tiles = new Uint8Array(width * height).fill(catalog.tiles.indexOf('empty'));
  for (let y = 1; y < 22; y++) for (let x = 1; x < 18; x++) tiles[y * width + x] = catalog.tiles.indexOf(x === 1 || x === 17 || y === 1 ? 'demon-wall-top' : x >= 8 && x <= 10 ? 'demon-carpet' : 'demon-floor');
  tiles[22 * width + 9] = catalog.tiles.indexOf('void-rift');
  // 入口から奥へ伸びる回廊と、左右の広間。既存の通行範囲を保って描き分ける。
  for (const area of [{ x: 3, y: 13, w: 5, h: 4 }, { x: 11, y: 7, w: 5, h: 4 }]) {
    for (let y = area.y; y < area.y + area.h; y++) for (let x = area.x; x < area.x + area.w; x++) tiles[y * width + x] = catalog.tiles.indexOf('demon-carpet');
  }
  return { id, width, height, tiles, spawn: { x: 144, y: 320 }, encounter: { enabled: true, rate: 6, enemyId: 12,
    enemies: [{ enemyId: 12, weight: 45 }, { enemyId: 13, weight: 35 }, { enemyId: 14, weight: 20 }] }, entities: [
    { kind: 'demon-lord', x: 144, y: 48, parameters: [], dialogue: { type: 'template', id: 86 }, battleEvent: { enemyId: 11, once: true, clear: false } },
  ], exits: [{ x: 9, y: 22, targetStageId, targetX, targetY, direction: 'front' }] };
}
