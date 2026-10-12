import type { PixelSprite } from '../objects/types';
import type { ShopKind } from '../objects/town-shops';

function makeShopkeeper(kind: ShopKind): PixelSprite {
  const pixels = Array.from({ length: 32 }, () => Array<string>(32).fill('.'));
  const palette = [
    '#302c30', '#704b36', '#b98254', '#e2b27c', '#f4d09a',
    ...(kind === 'weapon' ? ['#a35043', '#cf7960', '#594537', '#856747']
      : kind === 'armor' ? ['#456478', '#70949c', '#929b96', '#c3c6b3']
      : ['#4b7955', '#83a86f', '#563c32', '#8e6450']),
    '#d0b485', '#f4e3b4', '#b9c9ce', '#4c6673',
  ];
  const rect = (x: number, y: number, w: number, h: number, color: string): void => {
    for (let row = y; row < y + h; row += 1) {
      for (let col = x; col < x + w; col += 1) pixels[row][col] = color;
    }
  };
  // 正面向き。大きめの顔に目を離して置き、縮小しても表情を残す。
  rect(10, 1, 12, 2, '0');
  rect(8, 3, 16, 6, '0');
  rect(9, 3, 14, 5, '7');
  rect(11, 2, 10, 2, '8');
  rect(9, 5, 3, 4, '8');
  rect(20, 5, 3, 4, '8');
  rect(10, 7, 12, 7, '2');
  rect(11, 7, 10, 6, '3');
  rect(12, 7, 8, 2, '4');
  rect(8, 9, 2, 3, '3');
  rect(22, 9, 2, 3, '2');
  rect(12, 9, 2, 2, '0');
  rect(18, 9, 2, 2, '0');
  rect(15, 11, 2, 2, '2');
  rect(11, 13, 10, 3, '7');
  rect(13, 14, 6, 3, '8');
  rect(14, 13, 4, 1, '1');
  // 幅のある肩、袖と革の作業エプロン。
  rect(8, 16, 16, 12, '0');
  rect(6, 18, 20, 7, '0');
  rect(7, 18, 5, 5, '5');
  rect(20, 18, 5, 5, '5');
  rect(8, 18, 2, 3, '6');
  rect(22, 18, 2, 3, '6');
  rect(11, 17, 10, 10, '9');
  rect(12, 17, 2, 3, 'a');
  rect(18, 17, 2, 3, 'a');
  rect(12, 21, 8, 5, 'a');
  rect(14, 22, 4, 2, '2');
  rect(14, 22, 4, 1, '1');
  rect(7, 23, 4, 3, '2');
  rect(7, 23, 3, 2, '3');
  rect(21, 23, 4, 3, '2');
  rect(22, 23, 3, 2, '3');
  // ベルトの金具、左右に分かれた靴。
  rect(10, 27, 12, 1, '1');
  rect(15, 27, 2, 1, 'b');
  rect(10, 28, 5, 3, '0');
  rect(17, 28, 5, 3, '0');
  rect(10, 28, 4, 2, '1');
  rect(18, 28, 4, 2, '1');
  return { width: 32, height: 32, palette, pixels: pixels.map((row) => row.join('')) };
}

export const weaponShopkeeper = makeShopkeeper('weapon');
export const armorShopkeeper = makeShopkeeper('armor');
export const itemShopkeeper = makeShopkeeper('item');
