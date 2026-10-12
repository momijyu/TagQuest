# 王様画像の生成記録

この記録は初回の立ち姿と玉座込みの座り姿についてのもの。城で使用する王様だけの座り姿は [重ね描き用の生成記録](./overlay-generation.md) を参照。

組み込み画像生成ツールを使用。勇者の `hero-sheet-64.png` を画風の参考にし、既存の `throne.ts` を描画した画像を玉座の参考にした。
原画像: `king-generated.png`。
使用素材: `web/src/assets/king/king-sheet-64.png`（128×64、左が正面立ち姿・右が玉座に座った姿）と各ポーズの64×64透過PNG。
人物・玉座の領域を切り出し、最近傍で立ち姿を高さ56、座り姿（玉座込み）を高さ60に縮小してセル中央に配置。生成された透過を保持。
座り姿は玉座を含む一体の描画素材。既存の空の玉座素材も保持し、城では座り姿を24×24の表示枠で配置する。

## 生成プロンプト

```text
Use case: stylized-concept. Asset type: two-pose king NPC sprite sheet for the same pixel-art RPG as input image 1.
Input image 1 is STYLE REFERENCE ONLY: match its coarse square pixels, strong dark outlines, simple flat color clusters and 16-bit overworld proportions; do NOT depict the hero.
Input image 2 is THRONE DESIGN REFERENCE: retain its slim gold frame, red high back and cushion, gold armrests, gold feet, three-point top ornament.
Primary request: two full-body FRONT-FACING sprites of THE SAME KING. LEFT: king standing upright, without any chair. RIGHT: same king sitting naturally in the referenced gold and red throne, include the full chair in this sprite. Hands rest on armrests, bent knees, booted feet below the seat; clearly seated rather than standing in front of chair.
King design: dignified friendly older man, gray hair, neatly shaped short gray beard and mustache, visible alert eyes and eyebrows. Gold crown with red jewel, deep crimson royal mantle with white ermine edging, cream tunic with simple gold trim, gold belt, dark boots. About three heads tall, modest strong face, regal posture. Identical crown, face and outfit in both poses. No staff, no weapons.
Composition: STRICT landscape 2:1 sheet, TWO equal square cells side by side, left standing and right seated with throne. Each cell represents 64x64 logical pixels uniformly enlarged. Full subjects centered in their cells with transparent margins. Standing king about 54 pixels tall; entire occupied throne about 56 pixels tall. Keep face/head scale consistent between poses.
Style: authentic coarse hand-drawn low-resolution pixel art. Visible large square pixels, thick clear clusters, maximum 3 shades per material, restrained shared palette about 24 colors. Make eyes readable after each cell is reduced to 64x64. No smooth shading, gradients, antialiasing, dithering, tiny noisy details or realistic illustration. Throne should be sturdy and visually match the supplied simple gold/red design.
Transparent alpha background everywhere outside sprites. No floor, shadows, grid, labels, text, watermarks, extra poses or extra people.
```
