import type { PixelSprite } from './types';

function canvas(palette: readonly string[]) {
  const width = 32, height = 32;
  const pixels = Array.from({ length: height }, () => Array<string>(width).fill('.'));
  function rect(x: number, y: number, w: number, h: number, color: string) {
    for (let row = y; row < y + h; row++) for (let col = x; col < x + w; col++) pixels[row][col] = color;
  }
  function shape(points: readonly (readonly [number, number])[], color: string) {
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [ax, ay] = points[i], [bx, by] = points[j];
        if ((ay > y + .5) !== (by > y + .5) && x + .5 < (bx - ax) * (y + .5 - ay) / (by - ay) + ax) inside = !inside;
      }
      if (inside) pixels[y][x] = color;
    }
  }
  return { rect, shape, sprite: (): PixelSprite => ({ width, height, palette, pixels: pixels.map(row => row.join('')) }) };
}

function town(): PixelSprite {
  const { rect, shape, sprite } = canvas([
    '#493d33', '#78533e', '#a56845', '#c68b5a', '#ddb788', '#eee0b0',
    '#87513f', '#b16a50', '#d58b67', '#779491', '#b9cbc0', '#b19b70',
  ]);
  // 小さな家を三軒重ね、赤茶の瓦屋根と明るい壁で街を表す。
  rect(4,12,8,9,'0'); rect(5,12,6,8,'4'); rect(5,14,1,5,'5');
  rect(8,15,2,3,'0'); rect(8,15,1,2,'9');
  shape([[1,12],[6,6],[11,6],[15,12],[14,14],[2,14]],'0');
  shape([[3,12],[7,7],[10,7],[13,12]],'7'); rect(6,8,4,1,'8'); rect(4,11,8,1,'6');
  rect(21,10,8,10,'0'); rect(22,11,6,8,'4'); rect(22,12,1,5,'5');
  rect(25,13,2,3,'0'); rect(25,13,1,2,'9'); rect(26,4,2,4,'0'); rect(26,4,1,3,'b');
  shape([[17,10],[22,4],[27,4],[31,10],[30,12],[18,12]],'0');
  shape([[19,10],[23,5],[26,5],[29,10]],'7'); rect(22,6,4,1,'8'); rect(20,9,8,1,'6');
  rect(9,23,17,7,'b'); rect(12,29,8,3,'b'); rect(14,29,4,3,'4');
  rect(10,19,14,10,'0'); rect(11,20,12,8,'4'); rect(11,21,2,6,'5'); rect(21,20,2,8,'3');
  shape([[7,19],[12,12],[21,12],[27,19],[25,21],[8,21]],'0');
  shape([[9,18],[13,13],[20,13],[24,18],[24,19],[9,19]],'7');
  rect(13,13,7,1,'8'); rect(11,16,11,1,'8'); rect(9,19,15,1,'6');
  rect(14,23,5,6,'0'); rect(15,24,3,5,'1'); rect(15,24,1,4,'2');
  rect(20,23,2,3,'0'); rect(20,23,1,2,'9'); rect(12,28,9,1,'1');
  return sprite();
}

function forestEntrance(): PixelSprite {
  const { rect, shape, sprite } = canvas([
    '#344532', '#405636', '#52703d', '#6b8a49', '#84a258', '#a3b86b',
    '#453a2c', '#715437', '#967048', '#b19b70', '#d3c48a',
  ]);
  shape([[14,17],[19,17],[20,24],[22,31],[11,31],[13,24]],'9');
  rect(15,24,3,7,'a'); rect(15,19,2,4,'7');
  for (const [x, y] of [[1,5], [17,3]]) {
    rect(x+4,y+12,4,12,'6'); rect(x+5,y+14,2,9,'8');
    shape([[x+4,y],[x+9,y],[x+9,y+2],[x+12,y+2],[x+12,y+5],[x+14,y+5],
      [x+14,y+13],[x+11,y+13],[x+11,y+16],[x+3,y+16],[x+3,y+14],[x,y+14],[x,y+5],[x+2,y+5],[x+2,y+2],[x+4,y+2]],'0');
    shape([[x+4,y+2],[x+9,y+2],[x+12,y+6],[x+12,y+11],[x+9,y+14],[x+3,y+12],[x+2,y+7]],'2');
    shape([[x+4,y+3],[x+8,y+3],[x+10,y+6],[x+7,y+9],[x+3,y+7]],'3');
    rect(x+4,y+4,4,1,'4'); rect(x+5,y+3,2,1,'5'); rect(x+8,y+11,3,1,'3');
  }
  rect(3,28,4,2,'2'); rect(24,27,4,2,'2'); rect(8,29,3,1,'3'); rect(23,30,3,1,'3');
  return sprite();
}

function cave(): PixelSprite {
  const { rect, shape, sprite } = canvas([
    '#353936', '#565c53', '#7b8070', '#a1a18b', '#c1bea2', '#292d2b',
    '#191f20', '#615447', '#907b57', '#b49b6c',
  ]);
  shape([[11,5],[20,5],[25,9],[28,14],[30,22],[31,28],[26,30],[5,30],[1,27],[3,19],[5,12]],'0');
  shape([[11,7],[19,6],[24,11],[26,16],[28,27],[24,28],[6,28],[3,26],[5,18],[7,12]],'2');
  shape([[11,7],[18,7],[21,9],[16,11],[12,10],[9,14],[6,14],[8,11]],'3');
  rect(12,7,6,1,'4'); rect(7,12,2,1,'4');
  shape([[19,8],[23,11],[22,15],[26,17],[27,26],[23,27],[22,20],[19,17],[20,13],[17,11]],'1');
  shape([[12,14],[19,14],[23,19],[23,29],[8,29],[8,21],[10,17]],'0');
  shape([[13,16],[18,16],[21,20],[21,28],[10,28],[10,21]],'5');
  shape([[14,17],[17,17],[19,20],[19,28],[12,28],[12,21]],'6');
  rect(9,27,13,2,'7'); rect(11,29,9,2,'8'); rect(13,29,4,1,'9');
  shape([[4,22],[8,22],[10,25],[8,28],[3,28],[2,26]],'1'); rect(4,23,3,2,'3');
  shape([[24,23],[28,22],[30,27],[27,29],[23,28]],'1'); rect(25,23,2,2,'2');
  return sprite();
}

function demonCastle(): PixelSprite {
  const { rect, shape, sprite } = canvas([
    '#272a32', '#454352', '#686077', '#93899e', '#a99caf', '#442f42',
    '#6e3d53', '#9b5062', '#c46c68', '#d99467', '#b49b6c', '#d6c18c',
  ]);
  rect(3,15,6,15,'0'); rect(4,16,4,13,'1'); rect(4,16,1,11,'3');
  rect(24,15,6,15,'0'); rect(25,16,4,13,'1'); rect(25,16,1,11,'3');
  for (const x of [3,24]) {
    shape([[x-1,15],[x+3,2],[x+7,15]],'0');
    shape([[x+1,13],[x+3,5],[x+5,13]],'6'); rect(x+2,9,1,3,'7');
    rect(x+2,18,2,3,'0'); rect(x+2,19,1,2,'8');
  }
  rect(8,13,17,16,'0'); rect(9,14,15,14,'1'); rect(9,15,2,12,'2'); rect(22,15,2,12,'0');
  shape([[9,13],[12,7],[20,7],[24,13]],'0'); shape([[11,12],[13,8],[19,8],[22,12]],'6'); rect(13,8,6,1,'7');
  // 王冠のような尖った中央塔と、薄紫の石の稜線。
  rect(12,10,9,5,'0'); rect(13,10,7,4,'2');
  for (const x of [12,16,20]) { rect(x,7,1,5,'0'); rect(x,6,1,2,'3'); }
  rect(13,11,7,1,'3'); rect(15,13,2,3,'0'); rect(15,14,2,1,'9');
  rect(9,18,15,1,'0'); rect(10,19,13,1,'2');
  shape([[14,21],[18,21],[20,24],[20,29],[12,29],[12,24]],'0');
  rect(14,23,4,6,'5'); rect(15,24,2,5,'0'); rect(12,28,8,1,'6');
  rect(3,29,27,1,'0'); rect(12,30,8,2,'a'); rect(14,30,4,1,'b');
  for (const x of [10,21]) { rect(x,22,1,3,'7'); rect(x,23,1,1,'8'); }
  return sprite();
}

function ruins(): PixelSprite {
  const { rect, sprite } = canvas(['#42483f', '#777c68', '#a3a58e', '#d0cdb1', '#4d663c', '#75924b', '#292e2a', '#bba16e']);
  rect(2, 27, 28, 4, '1'); rect(4, 27, 24, 1, '2');
  // 崩れた左右の塔。屋根を描かず、欠けた石壁と暗いアーチで城の遺跡を示す。
  rect(4, 10, 6, 18, '0'); rect(5, 11, 4, 16, '2'); rect(5, 11, 1, 14, '3');
  rect(4, 7, 2, 4, '0'); rect(8, 8, 2, 3, '0'); rect(5, 7, 1, 2, '3');
  rect(23, 15, 5, 13, '0'); rect(24, 16, 3, 11, '1'); rect(24, 16, 1, 9, '2');
  rect(23, 12, 2, 4, '0'); rect(27, 14, 1, 3, '0');
  rect(9, 17, 15, 11, '0'); rect(10, 18, 13, 9, '2'); rect(10, 18, 13, 1, '3');
  rect(10, 15, 3, 3, '0'); rect(15, 16, 4, 2, '1'); rect(22, 16, 2, 3, '0');
  rect(13, 23, 8, 6, '6'); rect(14, 21, 6, 2, '6'); rect(15, 20, 4, 1, '6');
  rect(11, 22, 2, 1, '1'); rect(21, 24, 2, 1, '1'); rect(6, 20, 3, 1, '1');
  rect(5, 23, 2, 5, '4'); rect(6, 24, 2, 2, '5'); rect(23, 23, 3, 5, '4');
  rect(2, 28, 4, 2, '4'); rect(26, 28, 4, 2, '5');
  rect(14, 29, 6, 3, '7'); rect(15, 29, 3, 1, '3');
  return sprite();
}

export const worldLocations: Readonly<Record<string, PixelSprite>> = {
  'world-town': town(), 'world-forest-entrance': forestEntrance(),
  'world-cave': cave(), 'world-demon-castle': demonCastle(), 'world-ruins': ruins(),
};
export const worldLocationNames: Readonly<Record<string, string>> = {
  'world-town': '街', 'world-forest-entrance': '森の入口', 'world-cave': '洞窟', 'world-demon-castle': '魔王城', 'world-ruins': '古城の遺跡',
};
export const isWorldLocation = (kind: string): boolean => Object.hasOwn(worldLocations, kind);
/** 保存・入口枠は1マス。絵は中央に揃え、足元より上へはみ出す。 */
export function worldLocationDrawingPosition(entity: { kind: string; x: number; y: number }) {
  const sprite = worldLocations[entity.kind];
  return { x: entity.x + (16 - sprite.width) / 2, y: entity.y + 16 - sprite.height };
}
