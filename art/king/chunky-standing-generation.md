# 粗いドットの王様・正面立ち姿

組み込み画像生成ツールを使用。以前の王様を参考に、王冠・灰色の髪とひげ・赤いマント・白い縁取りを保った新しい正面立ち姿を別素材として制作。
原画像: `king-standing-chunky-generated.png`。
使用素材: `web/src/assets/king/king-standing-chunky-48.png`（48×48透過PNG）。
32×32では目がつぶれたため、48×48を採用。人物の領域を切り出して最近傍で高さ42ドットに縮小し、上下3ドットの余白で中央に配置。生成された透過を保持。
城では24×24の表示枠で、以前と同じ玉座の手前の位置に配置。描画解像度8倍のCanvas上では4倍の整数拡大になる。
以前の立ち姿・玉座込みの座り姿・椅子なしの座り姿は変更せず、素材一覧に残す。

## 生成プロンプト

```text
Use case: style-transfer.
Input image is an IDENTITY REFERENCE for the standing king on the LEFT only. Create ONE NEW, much coarser pixel-art standing king sprite, facing directly forward. Keep gold crown with red jewel, gray hair and compact gray beard, cream tunic, gold belt, red mantle with white ermine edges, brown boots. Upright full-body standing pose, hands by sides. No chair, no sitting pose.
MOST IMPORTANT: radically simplify to genuine 32x32 logical pixel overworld art. Draw on a strict 32-column by 32-row pixel grid enlarged uniformly; king about 28 logical pixels tall and 18 wide with clear margins. Every detail must occupy whole large square pixels. The existing reference has far too many tiny highlights and shades. Redraw from scratch in a much simpler 16-color retro-console style, confident broad solid clusters, 2 shades per material, thin dark one-logical-pixel outline. Simplify hair to 3 chunky locks, beard to a readable gray shape, cape to solid crimson with one dark red fold, white trim as continuous wide ivory bands. Simplify crown to 3 gold points and one red square jewel. Hands simple mitt shapes. Boots simple brown clusters. No fur speckle, no tiny fingers, no jewelry micro-details, no fabric texture, no dithering, no gradients, no antialiasing, no smooth painted shading. A recognizable dignified older king, not a miniature detailed illustration.
Face must be readable at actual 32x32: two clearly separated small dark eyes under gray brows, simple warm skin, gray beard, no blank face. 3 heads tall overall. The square logical pixels must be immediately obvious.
Only ONE centered character, full silhouette within square image, genuinely transparent alpha background, no ground, shadow, text, labels, grid or decorations.
```
