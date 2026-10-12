export type KingDirection = 'back' | 'left' | 'right';

/** 主人公の方向素材の輪郭・頭身・陰影を保って、王様の色と王冠へ変更する。 */
export function makeKingDirection(source: Uint8ClampedArray, direction: KingDirection): Uint8ClampedArray {
  if (source.length !== 64 * 64 * 4) throw new Error('王様の原画は64×64です。');
  const pixels = new Uint8ClampedArray(source);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const index = (y * 64 + x) * 4;
    const [r, g, b, alpha] = pixels.subarray(index, index + 4);
    if (!alpha) continue;
    // 髪の青灰色の明暗を銀髪に置換。肌や目と輪郭はそのまま。
    if (y < 26 && b > r + 4 && b >= g && b - g < 40 && b - r < 70 && r > 20) {
      const brightness = (r + g + b) / 3;
      const silver = brightness < 38 ? [84, 78, 97] : brightness < 58 ? [138, 134, 155]
        : brightness < 83 ? [190, 188, 207] : [231, 230, 239];
      pixels.set(silver, index);
    }
    // 青い服だけ赤へ。元のマントの赤や肌・ブーツ・ズボンは変えない。
    if (y >= 25 && y <= 47 && g > r * 1.25 && b > r * 1.35 && b > g * 1.1 && b > 55) {
      const brightness = Math.max(r, g, b);
      const crimson = brightness < 95 ? [109, 13, 35] : brightness < 150 ? [172, 17, 43] : [218, 30, 55];
      pixels.set(crimson, index);
    }
  }
  const rect = (x: number, y: number, width: number, height: number, color: readonly number[]) => {
    for (let dy = 0; dy < height; dy++) for (let dx = 0; dx < width; dx++) pixels.set([...color, 255], ((y + dy) * 64 + x + dx) * 4);
  };
  // 正面と同じ小さな三山の王冠。横顔には短いあごひげを添える。
  const colors: Record<string, readonly number[]> = {
    '0': [31, 26, 39], '4': [157, 98, 28], '5': [223, 163, 43], '6': [255, 215, 95], '2': [147, 16, 39],
  };
  const offset = direction === 'back' ? 0 : direction === 'left' ? -2 : 2;
  ['......0......', '.05..060..50.', '.05056665050.', '.05066665050.', '0055554555500'].forEach((row, y) =>
    [...row].forEach((code, x) => { if (code !== '.') rect(25 + offset + x, 4 + y, 1, 1, colors[code]); }));
  if (direction !== 'back') {
    const jewelX = direction === 'right' ? 34 : 28;
    rect(jewelX, 7, 1, 2, colors['2']);
    const beardX = direction === 'right' ? 37 : 24;
    rect(beardX, 25, 3, 2, [169, 164, 179]); rect(beardX, 25, 2, 1, [228, 225, 233]);
  }
  return pixels;
}
