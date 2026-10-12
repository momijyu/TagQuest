import sheetUrl from '../../assets/player/hero-sheet-64.png';
import type { ImageSprite } from './types';

// 目を残しつつ、粗いドットで陰影を整理した64×64の原画。
export async function loadPlayerSprites() {
  const image = new Image();
  image.src = sheetUrl;
  await image.decode();

  function frame(sourceX: number, sourceY: number): ImageSprite {
    return { image, sourceX, sourceY, width: 64, height: 64 };
  }

  return {
    front: {
      ...frame(0, 0),
      // 向かって右の眉の厚い上端と内側だけを肌色に戻す。
      // 右の黒目は左と同じ1×2ドット。左眉は前髪の隙間だけに描く。
      pixelCorrections: [
        { x: 34, y: 16, color: '#fbc475' },
        { x: 35, y: 16, color: '#fbc273' },
        { x: 36, y: 16, color: '#f3b270' },
        { x: 33, y: 17, color: '#facb79' },
        { x: 35, y: 18, color: '#f0eff1' },
        { x: 35, y: 19, color: '#f9f9fa' },
        { x: 36, y: 18, color: '#f3b270' },
        { x: 36, y: 19, color: '#f3b270' },
        // 左眉の両端（x=28,30）は前髪で隠し、中央だけ見せる。
        { x: 29, y: 17, color: '#7c3b2a' },
      ],
    } satisfies ImageSprite,
    back: frame(64, 0),
    left: frame(0, 64),
    right: frame(64, 64),
  } as const;
}
