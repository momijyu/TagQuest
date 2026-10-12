import type { PixelSprite } from './types';

const width = 32;
const height = 40;
const pixels = Array.from({ length: height }, () => Array<string>(width).fill('.'));
const palette = [
  '#424b4b', '#6f7c79', '#a4ada0', '#d2d3b7', '#eee6c4',
  '#624b34', '#967347', '#c4a36b', '#e2c78b',
  '#1c343e', '#315867', '#5a8690',
];
function rect(x: number, y: number, w: number, h: number, color: string): void {
  for (let row = y; row < y + h; row += 1) {
    for (let col = x; col < x + w; col += 1) pixels[row][col] = color;
  }
}

// 石の胴。下側に厚みを見せ、石積みの目地を交互にずらす。
rect(5, 27, 22, 11, '0');
rect(3, 25, 26, 10, '0');
rect(4, 25, 24, 9, '2');
rect(6, 34, 20, 3, '1');
rect(7, 37, 18, 1, '0');
rect(4, 28, 24, 1, '1');
rect(5, 32, 22, 1, '1');
for (const x of [8, 16, 24]) rect(x, 25, 1, 3, '1');
for (const x of [5, 12, 20, 27]) rect(x, 29, 1, 3, '1');
for (const x of [9, 17, 24]) rect(x, 33, 1, 3, '0');
rect(26, 26, 2, 8, '1');

// 俯瞰した楕円形の縁と、奥が暗い水面。
for (const [x, y, w, h] of [[8, 18, 16, 2], [4, 20, 24, 2], [2, 22, 28, 5], [4, 27, 24, 2], [8, 29, 16, 1]]) rect(x, y, w, h, '0');
rect(8, 19, 16, 2, '3');
rect(5, 21, 22, 2, '3');
rect(3, 23, 26, 3, '3');
rect(5, 26, 22, 2, '2');
rect(8, 28, 16, 1, '1');
rect(9, 21, 14, 1, '0');
rect(7, 22, 18, 3, '9');
rect(10, 25, 12, 1, 'a');
rect(18, 24, 4, 1, 'b');
rect(5, 21, 4, 1, '4');
rect(3, 23, 2, 3, '4');
rect(15, 26, 1, 2, '1');
rect(25, 21, 1, 2, '1');

// 支柱・横木・滑車と縄。桶を水面より手前に重ねる。
for (const x of [4, 25]) {
  rect(x, 6, 3, 19, '5');
  rect(x, 6, 1, 18, '7');
  rect(x + 1, 7, 1, 16, '6');
  rect(x - 1, 24, 5, 2, '5');
}
rect(3, 5, 26, 4, '5');
rect(3, 5, 26, 1, '8');
rect(4, 6, 24, 1, '7');
rect(13, 3, 6, 7, '5');
rect(14, 4, 4, 5, '1');
rect(15, 5, 2, 3, '3');
rect(16, 9, 1, 10, '8');
rect(14, 18, 5, 1, '0');
rect(13, 19, 1, 3, '1');
rect(19, 19, 1, 3, '1');
rect(12, 22, 9, 2, '0');
rect(13, 24, 7, 5, '6');
rect(14, 24, 1, 5, '7');
rect(18, 24, 1, 5, '5');
rect(13, 25, 7, 1, '1');
rect(14, 29, 5, 1, '0');

/** 外観用の井戸。地下への入口や調べるイベントはまだ持たない。 */
export const well = { width, height, palette, pixels: pixels.map((row) => row.join('')) } as const satisfies PixelSprite;
