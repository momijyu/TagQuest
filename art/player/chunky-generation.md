# プレイヤーのドット感と大きさの調整

組み込み画像生成ツールで `hero-sheet-128.png` を編集。黒髪・青い瞳・青い服・赤いマントと前後左右を維持し、陰影を減らした粗いドットの版を制作した。

生成原画像: `hero-chunky-generated.png`。
使用素材: `web/src/assets/player/hero-sheet-64.png` と各方向の `hero-*-64.png`。
各方向の人物を切り出し、最近傍で縦56ドットに縮小。64×64セルに中央・上下4ドットの余白で配置し、透過を保持。
城での表示枠は16×16から24×24に変更（1.5倍）。中央と足元は従来の位置を維持する。

## 編集プロンプト

```text
Use case: style-transfer.
Edit target: attached 2x2 transparent RPG hero sheet. Keep the same character, four directions and clothing: swept black hair, handsome composed face, readable blue eyes, blue gold-trimmed tunic, red cape, brown gloves and boots. Top-left front; top-right back; bottom-left left; bottom-right right. Keep full-body idle poses at matching scale and baseline.
CHANGE ONLY PIXEL ART STYLE: make the pixel clusters much larger and simpler, like a carefully hand-drawn 16-bit console overworld RPG sprite. The existing sheet is too finely detailed and looks like a miniature illustration. Redraw as true coarse low-resolution pixel art with a strict 64x64 logical pixel cell per character, enlarged uniformly for output. Character about 54 pixels tall and 28 pixels wide, approximately 3 heads tall. Sharp square steps, strong dark single-pixel outlines, chunky hair locks, 3 shades maximum per material, about 24 colors for whole sheet. Broad flat clusters on cape, tunic and hair. No gradients, no subpixel detailing, no antialiasing, no dithering, no smooth illustration.
CRITICAL preserve easily readable eyes: front has two separated blue eyes with tiny light whites and dark upper eyelids, natural confident expression. Profile has one visible blue eye. Eyes must remain visible after reducing each cell to 64x64.
Composition: one square 2x2 sheet of four equal cells, centered in each, identical feet baseline with margins. Transparent alpha background, no text, no labels, no grid, no ground shadow, no weapons, no extra characters. Preserve recognizable identity and outfit.
```
