import type { PixelSprite } from '../objects/types';

type ResidentKind = 'traveler' | 'resident' | 'elder';

function makeResident(kind: ResidentKind): PixelSprite {
  const pixels = Array.from({ length: 32 }, () => Array<string>(32).fill('.'));
  const colors = {
    traveler: ['#4c6d4d', '#88a66b', '#453a32', '#796043'],
    resident: ['#795379', '#b481a0', '#704d37', '#b08a53'],
    elder: ['#506779', '#879ba5', '#999f95', '#d4d5bd'],
  } as const;
  const palette = [
    '#333237', '#7c553b', '#bb885f', '#e6b884', '#f3d3a1',
    ...colors[kind], '#d9c397', '#f2dfb3', '#967545',
  ];
  const rect = (x: number, y: number, w: number, h: number, color: string): void => {
    for (let row = y; row < y + h; row += 1) {
      for (let col = x; col < x + w; col += 1) pixels[row][col] = color;
    }
  };

  // 共通の正面顔。髪型と服の輪郭で住民を見分ける。
  rect(11, 1, 10, 2, '0');
  rect(9, 3, 14, 11, '0');
  rect(10, 3, 12, 6, '7');
  rect(12, 2, 8, 2, '8');
  rect(10, 4, 3, 3, '8');
  rect(11, 7, 10, 7, '2');
  rect(12, 7, 8, 6, '3');
  rect(12, 7, 8, 2, '4');
  rect(9, 9, 2, 3, '3');
  rect(21, 9, 2, 3, '2');
  rect(12, 9, 2, 2, '0');
  rect(18, 9, 2, 2, '0');
  rect(16, 11, 1, 2, '2');
  rect(15, 13, 3, 1, '1');
  rect(14, 14, 4, 2, '2');

  rect(10, 16, 12, 12, '0');
  rect(8, 17, 16, 6, '0');
  rect(9, 17, 14, 5, '5');
  rect(11, 16, 10, 10, '5');
  rect(12, 17, 2, 7, '6');
  rect(15, 16, 3, 2, '9');
  rect(8, 22, 3, 4, '2');
  rect(8, 22, 2, 3, '3');
  rect(21, 22, 3, 4, '2');
  rect(22, 22, 2, 3, '3');
  rect(11, 26, 10, 2, '1');
  rect(15, 26, 2, 1, 'a');
  rect(11, 28, 4, 3, '0');
  rect(17, 28, 4, 3, '0');
  rect(11, 28, 3, 2, '1');
  rect(18, 28, 3, 2, '1');

  if (kind === 'traveler') {
    // 横に流れた前髪と、腰の小さな革鞄。
    rect(13, 5, 8, 2, '7');
    rect(18, 7, 3, 1, '7');
    rect(19, 23, 5, 5, '0');
    rect(20, 23, 3, 4, 'b');
    rect(20, 24, 3, 1, '9');
  } else if (kind === 'resident') {
    rect(9, 5, 2, 12, '7');
    rect(21, 5, 2, 12, '7');
    rect(10, 6, 1, 10, '8');
    rect(13, 5, 6, 2, '8');
    // 小さな髪飾りと、裾の広がった服。
    rect(21, 6, 2, 2, 'a');
    rect(9, 24, 14, 5, '0');
    rect(10, 24, 12, 4, '5');
    rect(11, 25, 2, 3, '6');
    rect(10, 28, 12, 1, '9');
  } else {
    // 白い眉とひげ、長い上着、木の杖。
    rect(12, 8, 2, 1, '8');
    rect(18, 8, 2, 1, '8');
    rect(12, 13, 8, 2, '7');
    rect(14, 15, 4, 2, '8');
    rect(11, 25, 10, 3, '5');
    rect(15, 18, 1, 8, '9');
    rect(24, 20, 2, 11, '1');
    rect(24, 20, 1, 10, 'b');
    rect(22, 20, 4, 2, 'b');
    rect(22, 22, 3, 2, '3');
  }

  return { width: 32, height: 32, palette, pixels: pixels.map((row) => row.join('')) };
}

// 素材確認用。会話文・移動・イベント・NFCのNPC IDは別途決める。
export const townNpcs = {
  traveler: { name: '緑の服の若者', sprite: makeResident('traveler') },
  resident: { name: '紫の服の女性', sprite: makeResident('resident') },
  elder: { name: '杖を持ったおじいさん', sprite: makeResident('elder') },
} as const;
