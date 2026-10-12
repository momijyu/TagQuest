# 勇者をベースにした王様

組み込み画像生成ツールで勇者の正面素材 `web/src/assets/player/hero-front-64.png` を編集し、同じ頭身・顔の大きさ・目の描き方を目指した王様を試作。
白髪・小さな金の王冠・赤い服・小さなあごひげに変更し、以前の長い衣装や毛皮・大きなひげを省いた。
原画像: `king-hero-style-generated.png`。
使用素材: `web/src/assets/king/king-standing-hero-style-64.png`（64×64透過PNG）。人物の領域を切り出し、最近傍で高さ56ドットに縮小して上下4ドットの余白で中央に配置。生成された透過を保持。
初回は城の24×24枠で試用し、その後は年配の王様へ戻して試作として保存した。現在は王の3点セット装備中の主人公の正面素材として採用し、32×32の枠に描画する。左右・後ろは主人公の方向素材をベースに同じ衣装へ変更している（`directions/README.md`）。城のNPCと戦闘の王様には元の年配の素材を使い、元画像は変更しない。

## 編集プロンプト

```text
Use case: precise-object-edit.
Edit target: attached FRONT-facing hero pixel sprite. Make a KING variant of this same game's character base.
CRITICAL: keep the hero's exact front-facing idle pose, head-to-body ratio, face width, eye shape and spacing, shoulder width, limb lengths, boot shapes, silhouette proportions and coarse pixel-cluster style. It must look like the same sprite artist used the same base sprite, not a different illustration. Approximately three heads tall. Keep a strict 64x64 logical pixel grid, body about 56 logical pixels high with margins, enlarged uniformly if necessary.
Change only what identifies him as the king:
- turn swept black hair to silver/white, keep similar chunky locks and hair volume;
- add a compact three-point GOLD CROWN with one red square jewel;
- make him a mature dignified king with gray eyebrows and a tiny simple gray chin beard of just a few logical pixels, leave face and eyes unobscured;
- recolor blue tunic to crimson red with restrained gold trim; keep short red cape, simple pale edging, brown boots, gold belt.
Eyes must be as readable and similar to the hero reference as possible. Preserve slim compact body, clear separated legs, relaxed hands at sides. Do not add a floor-length robe, broad ermine mantle, complicated fur spots, huge beard, broad face, chubby body, staff, chair or extra jewelry.
Pixel-art rules: same chunky dark outlines as reference; broad deliberate solid color clusters; 2 or 3 shades per material; no fine fabric texture, thin tiny gold filigree, dithering, gradients, antialiasing or miniature painting. Simple attractive and readable at game size. White hair, crown and red tunic are enough to identify royalty.
ONE centered full-body FRONT-facing STANDING character only, square image, transparent alpha background, no shadow, text, grid, labels, other poses or extra objects.
```
