// 通常のオブジェクトは絵の左上を保存し、編集時に余白を考慮する。
// 全NPC・建物は枠の左上を保存し、絵の左右のはみ出しは描画側で扱う。
export function placementInsets(kind: string): { left: number; right: number; top: number; bottom: number } {
  if (kind === 'throne' || kind === 'demon-throne') return { left: 12, right: 12, top: 0, bottom: 8 }; // 24×24の絵 → 3×2マス。
  if (kind === 'pillar' || kind === 'demon-pillar' || kind === 'well' || kind === 'well-entrance') return { left: 0, right: 0, top: 8, bottom: 0 };
  return { left: 0, right: 0, top: 0, bottom: 0 };
}
