# 玉座に重ねる王様

組み込み画像生成ツールで、既存の王様の見た目を維持した椅子なしの座り姿を別途生成。
原画像: `king-seated-overlay-generated.png`。
使用素材: `web/src/assets/king/king-seated-overlay-64.png`（64×64透過PNG）。人物の領域を切り出し、最近傍で高さ56ドットに縮小してセル内に配置。生成された透過を保持。
既存の立ち姿と玉座込みの座り姿のPNGは変更しない。
城では既存の `throne.ts` を1.5倍（24×24）で描き、王様だけの座り姿を手が肘掛けに合う位置に重ねる。
城の描画解像度を8倍にし、64×64の人物を192×192へ整数倍で描画して不均等なドット幅を抑える。

## 編集プロンプト

```text
Use case: precise-object-edit.
Input image: existing king sprite sheet, identity/outfit and sitting-pose reference.
Create ONE isolated FRONT-FACING SEATED KING sprite, character only, with no chair, throne, cushion, armrests or other furniture anywhere. Preserve the same older king's gold crown with red jewel, gray hair and short gray beard, alert eyes, cream and gold tunic, red royal mantle with white ermine trim, dark pants and brown boots.
Use the king on the RIGHT of the input as the pose: naturally seated with bent knees forward and boots below, hands resting at either side as if on invisible armrests. Slightly compact robe so this character can be overlaid on a narrow separate throne. The king must visibly sit, not stand. Both thighs/knees visible, elbows bent, palms down. Preserve recognizable face and clothes.
Simplify for low-resolution readability: a true 64x64 logical pixel sprite, about 54 pixels high and 34 pixels wide in a square transparent cell, enlarged with sharp uniform square blocks. About three heads tall. Chunky consistent outlines and flat color clusters, 2 or 3 shades per material, readable eyes with dark pupils and light whites, clear compact beard. No tiny noisy highlights, gradients, antialiasing or smooth illustration.
Only the seated king, fully within the cell and centered, transparent alpha outside body and between arms and torso and between legs. No chair or throne behind or below or under hands; transparent gaps must show where the separate chair will appear. No text, floor, shadows, other character or extra pose.
```
