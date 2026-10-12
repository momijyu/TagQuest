import type { PixelSprite } from '../objects/types';

type Point = readonly [number, number];

/** 整数座標の色を直接置く。輪郭も1ドット、透過は「.」。 */
export function pixelCanvas(width: number, height: number, palette: readonly string[]) {
  const pixels = Array.from({ length: height }, () => Array<string>(width).fill('.'));
  const dot = (x: number, y: number, color: string) => {
    if (x >= 0 && x < width && y >= 0 && y < height) pixels[y][x] = color;
  };
  function rect(x: number, y: number, w: number, h: number, color: string) {
    for (let row = y; row < y + h; row++) for (let col = x; col < x + w; col++) dot(col, row, color);
  }
  function line(from: Point, to: Point, color: string) {
    let [x, y] = from;
    const [endX, endY] = to, dx = Math.abs(endX - x), dy = -Math.abs(endY - y);
    const sx = x < endX ? 1 : -1, sy = y < endY ? 1 : -1;
    let error = dx + dy;
    while (true) {
      dot(x, y, color);
      if (x === endX && y === endY) return;
      const twice = 2 * error;
      if (twice >= dy) { error += dy; x += sx; }
      if (twice <= dx) { error += dx; y += sy; }
    }
  }
  function shape(points: readonly Point[], color: string, outline = false) {
    const cells: Point[] = [];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [ax, ay] = points[i], [bx, by] = points[j];
        if ((ay > y + 0.5) !== (by > y + 0.5) && x + 0.5 < (bx - ax) * (y + 0.5 - ay) / (by - ay) + ax) inside = !inside;
      }
      if (inside) cells.push([x, y]);
    }
    if (outline) for (const [x, y] of cells) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) dot(x + dx, y + dy, '0');
    for (const [x, y] of cells) dot(x, y, color);
  }
  return { dot, rect, line, shape, finish: (): PixelSprite => ({ width, height, palette, pixels: pixels.map(row => row.join('')) }) };
}

