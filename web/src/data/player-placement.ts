// 編集用の配置枠・足元の当たり判定・描画サイズを分ける。
export const playerPlacement = { width: 16, height: 32, drawingWidth: 32, drawingHeight: 32 } as const;
export const playerCollision = { width: 16, height: 16, offsetY: 16 } as const;

export function playerFrame(position: { readonly x: number; readonly y: number }) {
  return { ...position, width: playerPlacement.width, height: playerPlacement.height };
}

/** 配置枠の下側1マス。頭や左右にはみ出す絵は移動判定に含めない。 */
export function playerCollisionFrame(position: { readonly x: number; readonly y: number }) {
  return { x: position.x, y: position.y + playerCollision.offsetY,
    width: playerCollision.width, height: playerCollision.height };
}

export function playerDrawingPosition(position: { readonly x: number; readonly y: number }) {
  return { x: position.x - (playerPlacement.drawingWidth - playerPlacement.width) / 2, y: position.y };
}

export function legacyPlayerPosition(position: { readonly x: number; readonly y: number }) {
  return { x: position.x + (playerPlacement.drawingWidth - playerPlacement.width) / 2, y: position.y };
}

export function fitPlayerPosition(position: { readonly x: number; readonly y: number }, width: number, height: number, step = 16) {
  const maxX = width * 16 - playerPlacement.width;
  const maxY = height * 16 - playerPlacement.height;
  if (maxX < 0 || maxY < 0) throw new Error('主人公の配置には横1×縦2マス以上が必要です。');
  const align = (value: number, max: number) => Math.min(Math.floor(max / step) * step, Math.max(0, Math.floor(value / step) * step));
  return { x: align(position.x, maxX), y: align(position.y, maxY) };
}
