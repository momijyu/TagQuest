# 宝箱・洞窟の魔女・森の妖精・魔王

画像生成ではなく、Webのパレットとピクセル配列から出力した素材です。

- `treasure-chest.png`：閉じた宝箱、16×16px。
- `treasure-chest-open.png`：開いた宝箱、16×16px。開封後も同じ1×1マスの判定です。
- `cave-witch.png`：紫の帽子・ローブ、銀髪と鉱石の杖の魔女、32×32px。
- `forest-fairy.png`：花冠、金髪、緑の服と淡い羽の妖精、32×32px。
- `demon-lord.png`：角兜、黒紫の鎧と赤いマントの魔王、32×32px。
- `preview.png`：上記順の4倍の一覧。原寸PNGの透明部分を暗い背景で表示しています。

魔女・妖精・魔王は横1×縦2マスの配置枠、下側の1×1マスの当たり判定。絵は枠から左右8pxずつはみ出します。木・NPC・宝箱は足元の下端で描画順を共有します。

紹介画面とエディタで素材を選べます。宝箱にはアイテムIDとメッセージ、NPCには会話テンプレートまたは自由文を指定します。見本マップへの自動配置や仮の報酬指定は行いません。

ソースは `web/src/data/objects/treasure-chest.ts` と `web/src/data/characters/forest-cave-npcs.ts`、`web/src/data/characters/demon-lord.ts`。`web/` で `npm run export:adventure-materials` を実行すると再出力できます。魔王の戦闘用も含む記録は [魔王](../demon-lord/README.md)。
