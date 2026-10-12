import type { SceneData } from '../codec/scenes';
import catalog from '../data/scene-catalog.json';

/** 同じ砂浜IDのまま、海／川へ接する辺だけ湿った砂と明るい縁を描く。 */
export function drawCoast(context: CanvasRenderingContext2D, scene: SceneData): void {
  const sand = catalog.tiles.indexOf('sand'), sea = catalog.tiles.indexOf('sea');
  for (let y = 0; y < scene.height; y++) for (let x = 0; x < scene.width; x++) {
    if (scene.tiles[y * scene.width + x] !== sand) continue;
    for (const [dx, dy] of [[0,-1], [0,1], [-1,0], [1,0]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= scene.width || ny >= scene.height || scene.tiles[ny * scene.width + nx] !== sea) continue;
      const left = x * 16 + (dx === 1 ? 14 : 0), top = y * 16 + (dy === 1 ? 14 : 0);
      context.fillStyle = '#b4a474'; context.fillRect(left, top, dx === 0 ? 16 : 2, dy === 0 ? 16 : 2);
      context.fillStyle = '#eee0b0'; context.fillRect(left + (dx === 1 ? 1 : 0), top + (dy === 1 ? 1 : 0), dx === 0 ? 16 : 1, dy === 0 ? 16 : 1);
    }
  }
}
