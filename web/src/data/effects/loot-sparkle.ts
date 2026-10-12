import type { PixelSprite } from '../objects/types';

const palette = ['#9d783a', '#d7aa4f', '#f8d77d', '#fff4bd', '#ffffff'];

// 中身未定の落とし物を示す光。実アイテムの定義・取得状態とは分離する。
export const lootSparkleFrames: readonly PixelSprite[] = [1, 2, 3, 4, 3, 2, 1, 0].map((radius, frame) => {
  const pixels = Array.from({ length: 16 }, () => Array<string>(16).fill('.'));
  const put = (x: number, y: number, color: string): void => { pixels[y][x] = color; };
  // 床に残る小さな金色の点。光が縮んだ時も落とし物の場所を示す。
  for (const x of [6, 7, 8, 9]) put(x, 12, '0');
  put(7, 11, '2');
  put(8, 11, '1');
  if (radius > 0) {
    put(8, 7, '4');
    for (let step = 1; step <= radius; step += 1) {
      const color = step === radius ? '2' : '3';
      put(8 - step, 7, color);
      put(8 + step, 7, color);
      put(8, 7 - step, color);
      put(8, 7 + step, color);
    }
    if (radius >= 3) {
      for (const [x, y] of [[7, 6], [9, 6], [7, 8], [9, 8]]) put(x, y, '3');
    }
  }
  // 周囲の小さな光をずらして、単なる点滅よりきらめきに見せる。
  if (frame >= 1 && frame <= 3) {
    put(3, 3, '3');
    if (frame === 2) for (const [x, y] of [[2, 3], [4, 3], [3, 2], [3, 4]]) put(x, y, '2');
  }
  if (frame >= 4 && frame <= 6) {
    put(13, 10, '4');
    if (frame === 5) for (const [x, y] of [[12, 10], [14, 10], [13, 9], [13, 11]]) put(x, y, '2');
  }
  return { width: 16, height: 16, palette, pixels: pixels.map((row) => row.join('')) };
});
