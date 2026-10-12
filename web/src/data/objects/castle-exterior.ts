import type { PixelSprite } from './types';
import { castleWallMaterial } from '../tiles/castle-wall-material';

const width = 80;
const height = 64;
const pixels = Array.from({ length: height }, () => Array<string>(width).fill('.'));
const palette = [
  ...castleWallMaterial.palette,
  '#202f3d', '#3d5665', '#9e3048', '#ce4c60', '#d6ab58',
] as const;

function rect(x: number, y: number, w: number, h: number, color: string): void {
  for (let row = y; row < y + h; row += 1) {
    for (let column = x; column < x + w; column += 1) {
      pixels[row][column] = color;
    }
  }
}

function stone(x: number, y: number, w: number, h: number): void {
  for (let row = y; row < y + h; row += 1) {
    for (let column = x; column < x + w; column += 1) {
      pixels[row][column] = castleWallMaterial.pixels[row % 16][column % 16];
    }
  }
  rect(x, y, 1, h, '1');
  rect(x + w - 3, y, 2, h, '3');
  rect(x + w - 1, y, 1, h, '5');
}

function parapet(x: number, y: number, w: number): void {
  rect(x, y + 4, w, 2, '1');
  rect(x, y + 6, w, 2, '3');
  rect(x, y + 8, w, 1, '5');
  for (let column = x; column < x + w; column += 8) {
    rect(column, y, 4, 1, '1');
    rect(column, y + 1, 4, 3, '2');
    rect(column + 3, y + 1, 1, 3, '3');
  }
}

function windowSlit(x: number, y: number): void {
  rect(x, y, 5, 10, '1');
  rect(x + 1, y + 1, 3, 8, '6');
  rect(x + 2, y + 2, 1, 6, '7');
  rect(x, y + 10, 5, 1, '5');
}

// 中央の高い塔、前面の城壁、左右の塔の順に重ねる。
rect(40, 0, 1, 12, 'a');
rect(41, 1, 8, 5, '8');
rect(41, 1, 8, 1, '9');
rect(47, 5, 2, 1, '.');
stone(26, 12, 28, 41);
parapet(26, 8, 28);
windowSlit(31, 22);
windowSlit(44, 22);

stone(18, 36, 44, 27);
parapet(18, 30, 44);
rect(18, 60, 44, 2, '3');
rect(18, 62, 44, 2, '5');

for (const x of [2, 58]) {
  stone(x, 24, 20, 39);
  parapet(x, 18, 20);
  windowSlit(x + 7, 33);
  rect(x, 49, 20, 1, '1');
  rect(x, 50, 20, 2, '3');
  rect(x, 61, 20, 2, '3');
  rect(x, 63, 20, 1, '5');
}

// 石のアーチに囲まれた暗い入口。奥に赤いカーペットをのぞかせる。
rect(34, 42, 12, 2, '1');
rect(32, 44, 16, 2, '1');
rect(30, 46, 20, 16, '1');
rect(35, 44, 10, 2, '6');
rect(33, 46, 14, 2, '6');
rect(32, 48, 16, 14, '6');
rect(30, 48, 1, 14, '3');
rect(49, 48, 1, 14, '3');
rect(38, 42, 4, 3, '2');
rect(35, 58, 10, 4, '8');
rect(35, 58, 1, 4, '9');
rect(44, 58, 1, 4, '9');
rect(30, 62, 20, 1, '2');
rect(30, 63, 20, 1, '3');

/** 街側から見る石造りの城。床・堀・橋とは独立した80×64の素材。 */
export const castleExterior = {
  width, height, palette,
  pixels: pixels.map((row) => row.join('')),
} as const satisfies PixelSprite;
