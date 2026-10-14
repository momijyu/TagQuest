# 冒険のドット素材

画像生成ではなく、Webのパレットとピクセル配列から出力した素材です。

- `treasure-chest.png`：閉じた宝箱、16×16px。
- `treasure-chest-open.png`：開いた宝箱、16×16px。開封後も同じ1×1マスの判定です。
- `cave-witch.png`：紫の帽子・ローブ、銀髪と鉱石の杖の魔女、32×32px。
- `forest-fairy.png`：花冠、金髪、緑の服と淡い羽の妖精、32×32px。
- `demon-lord.png`：角兜、黒紫の鎧と赤いマントの魔王、32×32px。
- `signpost.png`：道しるべ、16×16px・1×1マスの判定。
- `cave-crystal.png`：洞窟の水晶、16×32px。下側1×1マスのみ通行不可。
- `stone-tablet.png`：古い石碑、16×32px。下側1×1マスのみ通行不可。
- `meadow-flowers.png`：花の草地、16×16pxの通行可能な床。
- `ruins-floor.png`：遺跡の石畳、16×16pxの通行可能な床。
- `preview.png`：上記順の4倍の一覧。原寸PNGの透明部分を暗い背景で表示しています。

魔女・妖精・魔王は横1×縦2マスの配置枠、下側の1×1マスの当たり判定。絵は枠から左右8pxずつはみ出します。木・NPC・宝箱は足元の下端で描画順を共有します。

紹介画面とエディタで素材を選べます。宝箱にはアイテムIDとメッセージ、NPCには会話テンプレートまたは自由文を指定します。単体マップへの自動配置は行いません。巨大版の固定見本には、道しるべや水晶の会話を設定しています。

ソースは `web/src/data/objects/treasure-chest.ts` と `web/src/data/characters/forest-cave-npcs.ts`、`web/src/data/characters/demon-lord.ts`。`web/` で `npm run export:adventure-materials` を実行すると再出力できます。魔王の戦闘用も含む記録は [魔王](../demon-lord/README.md)。

追加素材のソースは [exploration.ts（床）](../../web/src/data/tiles/exploration.ts) と [exploration.ts（配置物）](../../web/src/data/objects/exploration.ts)。道しるべ・水晶・石碑は会話と一度だけのアイテム取得に対応し、足元で主人公との前後を並べます。エディタ・紹介の素材一覧から選べます。全体マップの遺跡アイコンは [world-ruins.png](../world/world-ruins.png) に出力します。

宿屋 `inn-building.png`（緑屋根・ベッド）、酒場 `tavern.png`（レンガ・樽）、教会 `church.png`（白石・青屋根・鐘楼）、工房 `witch-hut.png`（紫屋根・曲がった煙突）を追加しました。絵は64×64px、配置2×4マス、下側4×2マスが衝突範囲です。`bounty-board.png` は32×32pxの賞金首掲示板。ソースは [service-buildings.ts](../../web/src/data/objects/service-buildings.ts)。プレビューは最大素材寸法に合わせたセルで並べます。

さらに鍛冶屋 `blacksmith-building.png`・祠 `teleport-shrine.png`・遊技場 `casino-building.png`・占いの館 `observatory.png`・港の詰所 `port-building.png`・牧場 `monster-corral.png`、帆船 `ship.png`・鉄格子 `iron-gate.png` を追加しました。建物は64×64、船も64×64、鉄格子は16×32です。[ultimate-facilities.ts](../../web/src/data/objects/ultimate-facilities.ts) にピクセル単位で描いています。`preview.png` は23素材の一覧です。
