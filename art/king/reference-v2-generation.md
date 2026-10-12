# 参考画像をもとにした別バージョン（不採用）

組み込み image_gen を使用。ユーザー添付の王様と主人公の画像をデザイン参考にして、新しい透過PNGを生成した。既存素材は保持。

保存先: `art/king/king-reference-v2-rejected.png`（1261×1247、透過あり、生成画像を未加工で保存）。
実際のセルは長方形で、左上が正面・右上が後ろ・左下が右向き・右下が左向き。シートの縦横を半分に分け、Canvasの最近傍補間で縮小表示する。要求した32×32の厳密なピクセル格子や16色制限は保証しない。
不採用の制作履歴として保存し、画面からは外している。歩行・攻撃・魔法などのアニメーションは今回の範囲に含めない。

## 使用プロンプト

```text
Use case: stylized-concept
Asset type: transparent pixel-art sprite sheet for an existing Japanese top-down RPG.
Input images: the user's first attached image is the KING character design reference; the user's second attached image is only the companion hero style reference.
Primary request: create a NEW alternate king sprite asset inspired closely by the reference king. Elderly dignified king, short stout chibi RPG proportions, clearly visible dark eyes, large white eyebrows, white hair and beard, large red and gold crown with ruby, red cape with white ermine trim, dark charcoal royal suit with gold edges, brown boots, royal gold/brown staff with a red gem.
Composition: a square sheet divided into EXACTLY FOUR equal square cells in a 2 by 2 arrangement. Top left FRONT facing camera; top right BACK facing away, no face; bottom left LEFT facing screen left with staff; bottom right RIGHT facing screen right with staff. One single fully visible standing idle king per cell, same size, same baseline and center alignment in every cell. Generous transparent margin to prevent any overlap. No throne, no chair, no seated poses.
Style: genuine coarse 32x32-style pixel art, designed on a consistent 32 by 32 logical grid PER CELL and enlarged with nearest-neighbor square pixels. Crisp stair-step silhouettes, strong dark outline, flat limited palette of about 16 colors, NO antialiasing, NO smooth gradients, NO fine subpixel detail. Preserve old age and royal design rather than making a young prince. Use large readable eye pixels.
Scene/backdrop: genuinely transparent alpha background throughout unused areas. NO white background, NO checkerboard drawing, NO grid lines, NO text, NO labels, NO swatches, NO decorative frames, NO shadows outside sprites. This must be a clean production sprite sheet that can be split in half horizontally and vertically into the four sprite frames.
```
