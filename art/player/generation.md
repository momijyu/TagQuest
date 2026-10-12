# プレイヤー画像の生成記録

この記録は初回と128×128版のもの。現在の素材は [ドット感の調整記録](./chunky-generation.md) を参照。

組み込みの画像生成ツールで制作。原画像は `hero-generated.png` に保存。
原画の2×2配置は左上が正面、右上が背面、左下が左向き、右下が右向き。
当初は各方向32×32へ縮小したが、目がつぶれたため使用を見送った。
現在は同じ原画像から切り出し直し、人物を縦112ドット、上下の余白を8ドットにそろえ、各方向128×128セル内に配置。
縮小は最近傍で補間を切り、透過を保持して `web/src/assets/player/` に保存。
使用素材は `hero-sheet-128.png` と各方向の `hero-*-128.png`。旧32×32素材は試作として残す。
城での表示は床1マス分を維持。Canvas自体の描画解像度を8倍にして128×128の細部を保持する。画像の生成し直しや顔への加筆は行っていない。

## 生成に使用したプロンプト

```text
Use case: stylized-concept
Asset type: production pixel-art RPG character sprite sheet, one image containing four views of the same character.
Primary request: Design a handsome, cool young adult male fantasy hero, visibly polished professional pixel art. This replaces an awkward-looking placeholder. Strong elegant face, composed confident expression, well-spaced normal-sized blue eyes with visible whites, defined eyebrows, small straight nose, tapered jaw, stylish swept dark charcoal hair. NOT a baby, not a goofy face, not huge round staring eyes. No beard.
Clothing: rich blue tunic with neat gold fasteners and belt buckle, short crimson red cape, dark trousers, brown boots. Athletic slim build, approximately 3 heads tall; refined 16-bit JRPG overworld style.
Composition: STRICT square 2-by-2 sprite sheet of FOUR equal square cells. Top-left FRONT, top-right BACK, bottom-left LEFT FACING, bottom-right RIGHT FACING. Full body standing idle in every cell, identical design, matching scale, centered in each cell, feet on the same baseline. Each cell represents EXACTLY 32 by 32 logical pixels; entire sheet 64 by 64 logical pixels, enlarged with crisp nearest-neighbor squares. One physical pixel block size consistent everywhere. Leave two logical pixels of transparent margin around each character. Each character about 27 logical pixels tall and 15 logical pixels wide. Every sprite fully within its own cell.
Style: authentic hand-placed low-resolution pixel art, crisp hard pixel edges, restrained palette about 24 colors, thoughtful clusters, clear silhouette, refined hair strands, deliberate face pixels. Attractive readable face at 32x32, handsome anime-inspired adult hero, three-quarter overhead RPG view with face visible in front sprite. Do not simply draw a high resolution painting with a pixel texture.
Background: genuinely transparent alpha across all empty space. No grid lines, no cell borders, no backgrounds, no shadows behind characters, no ground plane.
Constraints: only these four sprites; no text, letters, labels, watermark, UI, weapons, extra poses, or ornaments outside the character.
```
