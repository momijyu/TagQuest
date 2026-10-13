import type { PixelSprite } from './types';

function makeHouse(roof: 'red' | 'slate'): PixelSprite {
  const width = 64;
  const height = 64;
  const pixels = Array.from({ length: height }, () => Array<string>(width).fill('.'));
  const palette = [
    '#493f38', '#73543b', '#a47c50', '#d4af79',
    '#eddfb9', '#c9ba97', '#9d937c', '#686e68',
    ...(roof === 'red' ? ['#76473f', '#ae6650', '#d48b65'] : ['#4a5966', '#6d8390', '#9cabb0']),
    '#3b535b', '#7fa6a6', '#c8d8c1', '#e5bf64', '#596f44', '#a34e48',
  ];
  const rect = (x: number, y: number, w: number, h: number, color: string): void => {
    for (let row = y; row < y + h; row += 1) {
      for (let col = x; col < x + w; col += 1) pixels[row][col] = color;
    }
  };

  // 漆喰の正面と、木組みの柱。右端の陰で建物の厚みを出す。
  rect(5, 29, 54, 33, '0');
  rect(7, 31, 50, 29, '4');
  rect(53, 31, 4, 29, '5');
  rect(7, 32, 50, 3, '6');
  for (const x of [7, 21, 40, 54]) {
    rect(x, 34, 3, 26, '1');
    rect(x, 35, 1, 24, '2');
  }
  rect(7, 49, 50, 2, '1');
  rect(5, 60, 54, 3, '7');
  rect(6, 60, 52, 1, '5');
  for (const x of [15, 29, 43]) rect(x, 61, 1, 2, '6');
  rect(4, 63, 56, 1, '0');

  // 幅広の瓦屋根。瓦の列ごとに目地を半分ずらす。
  rect(10, 10, 44, 3, '0');
  for (let y = 12; y < 31; y += 1) {
    const left = 10 - Math.floor((y - 12) / 2);
    rect(left, y, 64 - left * 2, 1, '8');
    for (let x = left + 1; x < 63 - left; x += 1) {
      const offset = Math.floor((y - 12) / 4) % 2 === 0 ? 0 : 4;
      pixels[y][x] = (x + offset) % 8 === 0 || y % 4 === 3 ? '8' : y % 4 === 0 ? 'a' : '9';
    }
  }
  rect(10, 10, 44, 1, 'a');
  rect(10, 11, 44, 1, '9');
  rect(1, 31, 62, 2, '0');
  rect(2, 31, 60, 1, '2');
  // 石の煙突。
  rect(47, 1, 8, 16, '0');
  rect(48, 2, 6, 13, '6');
  rect(48, 3, 6, 2, '5');
  rect(48, 8, 6, 1, '7');
  rect(51, 9, 1, 5, '7');
  rect(46, 0, 10, 2, '5');

  // 小窓のガラスと十字の桟。商品看板は付けない普通の家。
  for (const x of [11, 44]) {
    rect(x - 1, 36, 10, 12, '1');
    rect(x, 37, 8, 9, 'b');
    rect(x + 1, 38, 6, 7, 'c');
    rect(x + 1, 38, 2, 3, 'd');
    rect(x + 3, 37, 1, 9, '1');
    rect(x, 41, 8, 1, '1');
    rect(x - 2, 47, 12, 2, '2');
    rect(x - 2, 47, 12, 1, '3');
  }

  // 閉じた板戸。扉は外観の一部で、入口やワープを持たない。
  rect(25, 36, 14, 25, '0');
  rect(26, 37, 12, 23, '1');
  rect(27, 38, 10, 21, '2');
  for (const x of [29, 32, 35]) rect(x, 38, 1, 21, '1');
  rect(27, 39, 1, 19, '3');
  rect(27, 43, 10, 2, '1');
  rect(27, 54, 10, 2, '1');
  rect(34, 48, 2, 2, '0');
  rect(34, 48, 1, 1, 'e');
  rect(24, 60, 16, 2, '5');
  rect(23, 62, 18, 1, '7');

  if (roof === 'red') {
    // 窓辺の小さな花箱で、色違いの家にも少し個性を付ける。
    rect(10, 49, 10, 3, '1');
    rect(11, 49, 8, 2, '2');
    rect(12, 47, 1, 2, 'f');
    rect(17, 47, 1, 2, 'f');
    rect(11, 46, 3, 1, 'g');
    rect(16, 46, 3, 1, 'g');
  }

  return { width, height, palette, pixels: pixels.map((row) => row.join('')) };
}

// 外観専用。下側の横4×縦2マスを通行不可にし、屋根の後ろは通れる。
export const townHouses = {
  red: { sprite: makeHouse('red'), enterable: false, blocksMovement: true },
  slate: { sprite: makeHouse('slate'), enterable: false, blocksMovement: true },
} as const;
