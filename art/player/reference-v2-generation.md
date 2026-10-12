# 参考画像をもとにした別バージョン（不採用）

組み込み image_gen を使用。ユーザー添付の王様と主人公の画像をデザイン参考にして、新しい透過PNGを生成した。既存素材は保持。

保存先: `art/player/hero-reference-v2-rejected.png`（1402×1122、透過あり、生成画像を未加工で保存）。
実際のセルは長方形で、左上が正面・右上が後ろ・左下が右向き・右下が左向き。シートの縦横を半分に分け、Canvasの最近傍補間で縮小表示する。要求した32×32の厳密なピクセル格子や16色制限は保証しない。
不採用の制作履歴として保存し、画面からは外している。歩行・攻撃・魔法などのアニメーションは今回の範囲に含めない。

## 使用プロンプト

```text
Use case: stylized-concept
Asset type: transparent pixel-art sprite sheet for an existing Japanese top-down RPG.
Input images: the user's SECOND attached image is the primary HERO design reference; the FIRST attached image is a king, only for coherent RPG art style. If another generated king is visible, it is a companion style reference only.
Primary request: create a NEW alternate hero sprite asset closely inspired by the blue-scarf dark-haired young male hero in the reference. Handsome composed face, very dark navy tousled side-swept hair, two separated clearly visible dark eyes, cobalt blue scarf tied around his neck with a long trailing blue scarf tail, charcoal adventurer clothing, brown leather cross straps, silver/light gray small armor accents and cuffs, brown boots. Blue scarf, NOT a red cape. Short compact chibi RPG overworld proportions, large head, readable simple face.
Composition: square sheet divided into EXACTLY FOUR equal square cells in a 2 by 2 arrangement. Top left FRONT facing camera; top right BACK facing away, no face; bottom left LEFT facing screen left; bottom right RIGHT facing screen right. One single fully visible idle standing hero per cell, same size, same baseline and center alignment in every cell. Generous transparent margin; all scarf ends fully contained inside each frame.
Style: genuine coarse 32x32-style pixel art, designed on a consistent 32 by 32 logical grid PER CELL and enlarged using nearest-neighbor square pixels. Crisp stair-step silhouettes, strong dark outline, limited flat palette about 16 colors, chunky pixel clusters. NO antialiasing, NO smooth gradients, NO fine subpixel detail. Face should look confident and not vacant, two readable simple dark eyes on front view.
Scene/backdrop: genuinely transparent alpha background throughout unused areas. NO grid lines, NO checkerboard drawing, NO white background, NO text, NO labels, NO palette, NO decorative frames, NO ground shadows or glow. No action poses, no action effects. This must be a clean production sprite sheet that can be split in half horizontally and vertically into four sprite frames.
```
