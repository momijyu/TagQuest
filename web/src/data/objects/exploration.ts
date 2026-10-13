import type { PixelSprite } from './types';

function sprite(width: number, height: number, palette: readonly string[], paint: (rect: (x: number, y: number, w: number, h: number, color: string) => void) => void): PixelSprite {
  const rows = Array.from({ length: height }, () => Array<string>(width).fill('.'));
  paint((x, y, w, h, color) => {
    for (let row = y; row < y + h; row++) for (let col = x; col < x + w; col++) rows[row][col] = color;
  });
  return { width, height, palette, pixels: rows.map(row => row.join('')) };
}

export const signpost = sprite(16, 16, ['#483426', '#755033', '#a37746', '#d3a965', '#ead49c'], rect => {
  rect(7, 3, 3, 13, '0'); rect(8, 4, 1, 11, '2');
  rect(1, 2, 13, 8, '0'); rect(2, 3, 11, 6, '2');
  rect(2, 3, 11, 1, '3'); rect(2, 8, 11, 1, '1');
  rect(4, 5, 6, 1, '0'); rect(4, 7, 3, 1, '1'); rect(11, 5, 1, 1, '4');
  rect(6, 15, 6, 1, '1');
});

export const caveCrystal = sprite(16, 32, ['#344954', '#427b86', '#6aa9b2', '#a4d7d4', '#e4f5e5', '#6c6970', '#8a8890'], rect => {
  // 中央の長い結晶と、左右の小さな結晶。輪郭は階段状の整数ドット。
  rect(7, 2, 2, 1, '4'); rect(6, 3, 4, 2, '0'); rect(5, 5, 6, 21, '0');
  rect(6, 5, 2, 20, '3'); rect(8, 5, 2, 20, '1'); rect(6, 5, 1, 4, '4');
  rect(2, 12, 2, 2, '3'); rect(1, 14, 5, 13, '0'); rect(2, 15, 2, 11, '2'); rect(2, 15, 1, 5, '3');
  rect(12, 9, 1, 2, '3'); rect(11, 11, 4, 16, '0'); rect(12, 12, 2, 14, '1'); rect(12, 12, 1, 8, '3');
  rect(2, 27, 12, 4, '5'); rect(4, 26, 8, 1, '6'); rect(1, 29, 14, 2, '5');
  rect(3, 28, 3, 1, '6'); rect(9, 29, 3, 1, '0');
});

export const stoneTablet = sprite(16, 32, ['#424c47', '#7b8375', '#a5ad99', '#d0d3b8', '#536847', '#7b935c', '#5f665b'], rect => {
  rect(5, 2, 6, 2, '0'); rect(3, 4, 10, 25, '0');
  rect(4, 5, 8, 22, '2'); rect(4, 5, 1, 19, '3'); rect(5, 4, 6, 1, '3'); rect(11, 5, 1, 22, '1');
  rect(9, 5, 1, 3, '6'); rect(8, 8, 1, 2, '6');
  for (const [y, width] of [[12, 5], [15, 4], [18, 5], [21, 3]]) { rect(6, y, width, 1, '6'); rect(5, y, 1, 1, '1'); }
  rect(3, 25, 2, 4, '4'); rect(4, 26, 2, 2, '5'); rect(10, 27, 3, 2, '4');
  rect(2, 29, 12, 3, '0'); rect(3, 29, 10, 1, '1'); rect(3, 30, 9, 1, '2');
});

export const explorationObjects = {
  signpost: { name: '道しるべ', sprite: signpost },
  'cave-crystal': { name: '洞窟の水晶', sprite: caveCrystal },
  'stone-tablet': { name: '古い石碑', sprite: stoneTablet },
};
