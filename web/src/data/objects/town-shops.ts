import type { PixelSprite } from './types';

export type ShopKind = 'weapon' | 'armor' | 'item';

// 屋根を省いた見下ろしの売り場。カウンターは店員より手前に重ねる。
function makeShop(kind: ShopKind): { building: PixelSprite; counter: PixelSprite } {
  const width = 80;
  const height = 80;
  const background = Array.from({ length: height }, () => Array<string>(width).fill('.'));
  const foreground = Array.from({ length: height }, () => Array<string>(width).fill('.'));
  const palette = [
    '#393c38', '#68513b', '#9d733e', '#c5954b', '#e7c276',
    '#656b60', '#969b88', '#bec1a5', '#e0d9b5',
    '#694c64', '#88617e', '#a57892', '#513c52',
    '#516771', '#8da3a6', '#cbd6cb', '#f3edc9', '#a45241', '#d48b58',
    '#4e714c', '#8db276', '#d0d9a1',
  ];
  let pixels = background;
  const rect = (x: number, y: number, w: number, h: number, color: string): void => {
    for (let row = y; row < y + h; row += 1) {
      for (let col = x; col < x + w; col += 1) pixels[row][col] = color;
    }
  };
  const sword = (x: number, y: number): void => {
    rect(x + 3, y, 1, 1, 'g');
    rect(x + 2, y + 1, 3, 9, 'd');
    rect(x + 2, y + 1, 1, 8, 'f');
    rect(x + 3, y + 2, 1, 8, 'e');
    rect(x, y + 10, 7, 2, '1');
    rect(x, y + 10, 7, 1, '4');
    rect(x + 2, y + 12, 3, 3, '2');
    rect(x + 2, y + 15, 3, 1, '4');
  };
  const shield = (x: number, y: number): void => {
    rect(x, y, 10, 10, '0');
    rect(x + 1, y + 1, 8, 8, '4');
    rect(x + 2, y + 10, 6, 2, '4');
    rect(x + 4, y + 12, 2, 1, '4');
    rect(x + 2, y + 2, 6, 6, 'd');
    rect(x + 3, y + 8, 4, 2, 'd');
    rect(x + 4, y + 2, 2, 8, 'f');
    rect(x + 2, y + 5, 6, 2, 'e');
  };
  const potion = (x: number, y: number, color: string): void => {
    rect(x + 2, y, 5, 3, '1');
    rect(x + 3, y, 3, 2, '4');
    rect(x + 3, y + 3, 3, 3, 'f');
    rect(x + 1, y + 6, 7, 7, '0');
    rect(x, y + 7, 9, 5, '0');
    rect(x + 1, y + 7, 7, 5, color);
    rect(x + 2, y + 7, 1, 4, 'f');
    rect(x + 2, y + 10, 5, 1, 'g');
  };
  const herb = (x: number, y: number): void => {
    rect(x + 5, y + 3, 1, 10, 'j');
    rect(x + 6, y + 1, 2, 4, 'k');
    rect(x + 1, y + 3, 4, 2, 'k');
    rect(x + 2, y + 5, 4, 2, 'j');
    rect(x + 6, y + 6, 4, 2, 'k');
    rect(x + 6, y + 8, 3, 1, 'j');
    rect(x + 3, y + 11, 6, 3, '2');
    rect(x + 3, y + 11, 6, 1, '4');
  };

  // 紫系の小さなタイルと、金色の縁のある床。
  rect(3, 20, 74, 58, '0');
  rect(5, 20, 70, 56, '3');
  rect(6, 21, 68, 53, '4');
  for (let y = 23; y < 73; y += 1) {
    for (let x = 8; x < 72; x += 1) {
      const tx = x % 6;
      const ty = y % 6;
      background[y][x] = tx === 0 || ty === 0 ? 'c' : (Math.floor(x / 6) + Math.floor(y / 6)) % 2 === 0 ? '9' : 'a';
      if (tx === 2 && ty === 2) background[y][x] = 'b';
    }
  }

  // 石積みの背面と、売り場を囲む木の縁。左右の壁は低く切り開く。
  rect(2, 3, 76, 24, '0');
  for (let y = 6; y < 25; y += 1) {
    for (let x = 6; x < 74; x += 1) {
      const offset = Math.floor((y - 6) / 5) % 2 === 0 ? 0 : 6;
      background[y][x] = y % 5 === 0 || (x + offset) % 12 === 0 ? '5' : y % 5 === 1 ? '7' : '6';
    }
  }
  rect(3, 3, 74, 2, '4');
  rect(3, 5, 74, 1, '2');
  rect(3, 25, 74, 2, '1');
  for (const x of [2, 73]) {
    rect(x, 6, 5, 63, '1');
    rect(x + 1, 6, 2, 61, '3');
    rect(x + 1, 6, 1, 60, '4');
    for (const y of [7, 27, 48, 65]) rect(x, y, 5, 2, '2');
  }
  // 商品を掛ける木のラック。
  rect(10, 8, 60, 2, '1');
  rect(10, 8, 60, 1, '3');
  if (kind === 'weapon') {
    sword(13, 8);
    sword(28, 8);
    // 斧と長槍。
    rect(48, 9, 2, 16, '2');
    rect(43, 11, 6, 6, 'd');
    rect(43, 11, 5, 2, 'f');
    rect(44, 13, 4, 3, 'e');
    rect(61, 10, 1, 15, '3');
    rect(60, 7, 3, 6, 'e');
    rect(61, 6, 1, 5, 'g');
  } else if (kind === 'armor') {
    shield(12, 9);
    shield(29, 9);
    // 肩の付いた胸当てと、兜。
    rect(48, 9, 6, 2, '1');
    rect(44, 11, 14, 4, 'd');
    rect(45, 11, 12, 2, 'f');
    rect(47, 14, 8, 10, 'd');
    rect(48, 14, 6, 8, 'e');
    rect(48, 15, 1, 5, 'f');
    rect(47, 23, 8, 1, '4');
    rect(63, 13, 5, 2, 'f');
    rect(61, 15, 9, 7, 'd');
    rect(62, 15, 7, 4, 'e');
    rect(65, 14, 1, 8, 'f');
    rect(61, 21, 9, 2, '0');
  } else {
    // 薬瓶・薬草・包みを並べた道具屋。棚の小物は表示用で効果は未設定。
    rect(10, 23, 60, 2, '2');
    rect(10, 23, 60, 1, '4');
    potion(13, 10, 'h');
    potion(29, 10, 'j');
    herb(45, 9);
    rect(61, 13, 8, 10, '2');
    rect(62, 13, 6, 9, '3');
    rect(61, 17, 8, 2, '4');
    rect(64, 13, 2, 9, '1');
  }

  // 売り場の脇の木箱と、商品を載せた小卓。
  rect(9, 35, 12, 15, '1');
  rect(10, 36, 10, 12, '2');
  rect(11, 37, 8, 2, '4');
  rect(11, 41, 8, 1, '1');
  rect(11, 45, 8, 1, '1');
  rect(14, 39, 2, 9, '3');
  rect(60, 33, 10, 17, '1');
  rect(59, 32, 12, 2, '4');
  rect(60, 34, 10, 2, '2');
  if (kind === 'weapon') sword(62, 35);
  else if (kind === 'armor') shield(60, 36);
  else potion(61, 36, 'j');

  // 店員の下半身を隠す手前のカウンター。別レイヤーで重ねる。
  pixels = foreground;
  rect(7, 54, 66, 12, '0');
  rect(8, 54, 64, 3, '4');
  rect(8, 57, 64, 2, '3');
  rect(9, 59, 62, 6, '2');
  rect(10, 59, 60, 1, '1');
  for (const x of [10, 24, 40, 56, 69]) rect(x, 60, 1, 5, '1');
  rect(9, 64, 62, 1, '3');
  // カウンターの表側にも剣／盾／薬瓶の紋章。
  rect(8, 57, 12, 17, '0');
  rect(9, 58, 10, 15, '4');
  rect(10, 59, 8, 13, '1');
  if (kind === 'weapon') sword(10, 57);
  else if (kind === 'armor') shield(9, 59);
  else potion(10, 59, 'j');
  // 天板の小物（帳簿と金貨）。
  rect(56, 54, 9, 3, '1');
  rect(57, 54, 7, 2, 'g');
  rect(60, 54, 1, 2, '2');
  rect(25, 55, 2, 1, '2');
  rect(25, 54, 2, 1, '4');

  const sprite = (rows: string[][]): PixelSprite => ({ width, height, palette, pixels: rows.map((row) => row.join('')) });
  return { building: sprite(background), counter: sprite(foreground) };
}

export const weaponShop = makeShop('weapon');
export const armorShop = makeShop('armor');
export const itemShop = makeShop('item');
