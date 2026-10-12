import type { PixelSprite } from '../objects/types';

// 原寸32×32。住民と同じ大きさの顔・輪郭で、服と小物を描き分ける。
function drawNpc(kind: 'witch' | 'fairy'): PixelSprite {
  const pixels = Array.from({ length: 32 }, () => Array<string>(32).fill('.'));
  const palette = kind === 'witch'
    ? ['#302b3c', '#493554', '#72517f', '#a17ab1', '#b57f60', '#edbd95', '#ffdfb0', '#63647b', '#a5acc0', '#e1e1da', '#8b633d', '#d6ad61', '#3b8d8f', '#94ded0', '#5a3a30', '#b8824c']
    : ['#33453d', '#385e42', '#618a4d', '#a9c977', '#bd865d', '#efbf99', '#ffe3b3', '#9c703d', '#d4ac54', '#f4db86', '#558e91', '#91c7bc', '#d6eee1', '#fcf6d4', '#d38aa2', '#7f5940'];
  const rect = (x: number, y: number, w: number, h: number, color: string) => {
    for (let row = y; row < y + h; row++) for (let col = x; col < x + w; col++) pixels[row][col] = color;
  };
  if (kind === 'fairy') {
    // 透ける羽の代わりに淡い3色で縁・翅脈を描く。左右の翼は配置幅に含めない。
    const wing = ['..aa...', '.abca..', 'abcda..', 'abccba.', 'abccba.', '.abcba.', '.abba..', '..aa...', '...aa..', '..abca.', '..abca.', '...aa..'];
    wing.forEach((row, y) => [...row].forEach((color, x) => {
      if (color === '.') return;
      pixels[y + 10][x + 3] = color;
      pixels[y + 10][28 - x] = color;
    }));
  }
  // 髪、横顔の耳、顔。目は各1×2ドット。
  rect(12, 6, 8, 1, '0'); rect(10, 7, 12, 9, '0');
  rect(11, 7, 10, 8, '7'); rect(12, 7, 8, 3, '8');
  rect(12, 9, 8, 6, '4'); rect(12, 9, 7, 5, '5');
  rect(13, 9, 6, 1, '6');
  rect(10, 11, 2, 2, '5'); rect(20, 11, 2, 2, '4');
  rect(13, 11, 1, 2, '0'); rect(18, 11, 1, 2, '0');
  rect(16, 12, 1, 1, '4'); rect(15, 14, 2, 1, '4');
  rect(14, 15, 4, 2, '5');
  // 肩と腕、胴、足。頭の大きさを32pxの住民とそろえる。
  rect(10, 17, 12, 9, '0'); rect(8, 18, 16, 5, '0');
  rect(9, 18, 14, 4, '1'); rect(11, 17, 10, 9, '1');
  rect(12, 18, 2, 7, '2'); rect(15, 17, 3, 2, '3');
  rect(8, 22, 3, 3, '4'); rect(8, 22, 2, 2, '5');
  rect(21, 22, 3, 3, '4'); rect(22, 22, 2, 2, '5');
  rect(11, 28, 4, 3, '0'); rect(17, 28, 4, 3, '0');
  rect(12, 28, 2, 2, 'f'); rect(18, 28, 2, 2, 'f');
  if (kind === 'witch') {
    // 銀髪と紫のとんがり帽子、金の留め具、鉱石の杖。
    rect(10, 9, 2, 8, '7'); rect(20, 9, 2, 8, '7');
    rect(10, 10, 1, 6, '9'); rect(20, 10, 1, 6, '8');
    rect(12, 8, 4, 2, '8'); rect(17, 8, 3, 1, '9');
    rect(17, 0, 3, 1, '0'); rect(15, 1, 5, 2, '0');
    rect(13, 3, 8, 2, '0'); rect(11, 5, 11, 2, '0');
    rect(16, 1, 3, 1, '2'); rect(15, 2, 4, 1, '2');
    rect(14, 3, 6, 2, '1'); rect(14, 3, 2, 2, '3');
    rect(12, 5, 9, 2, '2'); rect(12, 6, 9, 1, 'a'); rect(16, 6, 2, 1, 'b');
    rect(7, 7, 18, 1, '0'); rect(8, 7, 15, 1, '2');
    rect(15, 18, 2, 1, 'b');
    rect(9, 25, 14, 4, '0'); rect(10, 25, 12, 3, '1');
    rect(11, 25, 2, 3, '2'); rect(15, 26, 2, 2, '2');
    rect(24, 17, 2, 14, '0'); rect(24, 18, 1, 12, 'a');
    rect(23, 14, 4, 4, '0'); rect(24, 14, 2, 3, 'c');
    rect(24, 14, 1, 2, 'd'); rect(23, 18, 3, 1, 'b');
    rect(23, 22, 2, 2, '5');
  } else {
    // 金髪、尖った耳、花冠と葉のワンピース。
    rect(10, 9, 2, 7, '7'); rect(20, 9, 2, 7, '7');
    rect(10, 9, 1, 6, '9'); rect(21, 9, 1, 6, '8');
    rect(12, 8, 3, 2, '8'); rect(16, 8, 4, 1, '9');
    rect(9, 11, 1, 1, '6'); rect(22, 11, 1, 1, '5');
    rect(11, 6, 10, 1, '1');
    for (const x of [11, 15, 19]) { rect(x, 5, 2, 2, 'e'); rect(x, 5, 1, 1, 'd'); }
    rect(9, 24, 14, 2, '0'); rect(10, 24, 12, 2, '2');
    rect(11, 26, 10, 2, '0'); rect(12, 26, 8, 1, '2');
    rect(12, 24, 2, 2, '3'); rect(18, 24, 2, 2, '3');
    rect(15, 20, 2, 2, '3'); rect(15, 20, 1, 1, 'd');
  }
  return { width: 32, height: 32, palette, pixels: pixels.map(row => row.join('')) };
}

export const forestCaveNpcs = {
  'cave-witch': { name: '洞窟の魔女', sprite: drawNpc('witch') },
  'forest-fairy': { name: '森の妖精', sprite: drawNpc('fairy') },
} as const;
