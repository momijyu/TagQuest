import sheetUrl from '../../assets/king/king-sheet-64.png';
import overlayUrl from '../../assets/king/king-seated-overlay-64.png';
import chunkyUrl from '../../assets/king/king-standing-chunky-48.png';
import heroStyleUrl from '../../assets/king/king-standing-hero-style-64.png';
import type { ImageSprite } from './types';
import { makeKingDirection } from './king-directions';
import type { KingDirection } from './king-directions';
import type { Direction } from '../../game/walking';

async function loadDirection(sprite: ImageSprite, direction: KingDirection): Promise<ImageSprite> {
  const canvas = document.createElement('canvas');
  canvas.width = sprite.width; canvas.height = sprite.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('王様のドット素材を描画できませんでした。');
  context.imageSmoothingEnabled = false;
  context.drawImage(sprite.image, sprite.sourceX, sprite.sourceY, sprite.width, sprite.height, 0, 0, sprite.width, sprite.height);
  const frame = context.getImageData(0, 0, sprite.width, sprite.height);
  frame.data.set(makeKingDirection(frame.data, direction));
  context.putImageData(frame, 0, 0);
  const image = new Image();
  image.src = canvas.toDataURL('image/png');
  await image.decode();
  return { image, sourceX: 0, sourceY: 0, width: sprite.width, height: sprite.height };
}

export async function loadKingSprites(players: Readonly<Record<Direction, ImageSprite>>) {
  const image = new Image();
  const overlayImage = new Image();
  const chunkyImage = new Image();
  const heroStyleImage = new Image();
  image.src = sheetUrl;
  overlayImage.src = overlayUrl;
  chunkyImage.src = chunkyUrl;
  heroStyleImage.src = heroStyleUrl;
  const [, , , , back, left, right] = await Promise.all([
    image.decode(), overlayImage.decode(), chunkyImage.decode(), heroStyleImage.decode(),
    loadDirection(players.back, 'back'), loadDirection(players.left, 'left'), loadDirection(players.right, 'right'),
  ]);

  function frame(sourceX: number): ImageSprite {
    return { image, sourceX, sourceY: 0, width: 64, height: 64 };
  }

  return {
    standingHeroStyle: {
      image: heroStyleImage, sourceX: 0, sourceY: 0, width: 64, height: 64,
    } satisfies ImageSprite,
    standingChunky: {
      image: chunkyImage, sourceX: 0, sourceY: 0, width: 48, height: 48,
    } satisfies ImageSprite,
    standing: frame(0),
    back, left, right,
    // 玉座を含む座り姿は元の素材のまま保管・表示する。
    seated: frame(64),
    seatedOverlay: {
      image: overlayImage, sourceX: 0, sourceY: 0, width: 64, height: 64,
    } satisfies ImageSprite,
  } as const;
}
