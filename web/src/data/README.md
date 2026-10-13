# ゲーム設定の編集場所

ゲーム共通の数値・ルールはこのフォルダのJSONで編集します。開発中は保存してページを再読み込みすると反映されます。公開済みのゲームへの反映には再ビルド・公開が必要です。これらのconfigはWeb側にあり、NFC容量には加算しません。

## 魔王

**[encounters/enemies/demon-lord.json](./encounters/enemies/demon-lord.json)** に能力・行動・戦闘のセリフ・報酬をまとめています。

| 編集するキー | 内容 | 現在の設定 |
|---|---|---|
| `stats.hp` | 最大HP | 360（以前の3倍） |
| `stats.attack` / `stats.defense` | 基礎攻撃力 / 防御力 | 36 / 12 |
| `patterns.beforeAttacked` | 主人公から攻撃される前の行動 | 剣 → 闇の炎 |
| `patterns.afterAttacked` | 一度でも攻撃された後の行動 | 剣 → 闇の炎 |
| 行動の `power` | 各攻撃の倍率 | 剣1倍 / 炎1.4倍 |
| 行動の `text` / 任意の `speech` | 行動ログ / 頭上のセリフ | ファイル内の文を編集 |
| 任意の `firstAttackedMessage` | 初めて攻撃された後の反応 | 未設定 |
| `royalEquipmentAttack.multiplier` | 王の装備への基礎攻撃力倍率 | 未設定（通常倍率） |
| `royalEquipmentAttack.match` | 発動する装備条件 | 未設定 |
| `royalEquipmentPlayerAttackMultiplier` | 王の装備による主人公の攻撃ボーナス倍率 | 未設定（通常性能） |
| `reward.gold` / `reward.experience` | 勝利報酬G / 経験値 | 0 / 0 |
| `reward.items` | ドロップのアイテムID・個数 | 空の配列 |
| `name` / `battleImage` / `background` | 名前 / 素材ID / 戦闘背景 | 魔王 / demon-lord / castle |

現在の魔王では王の装備への攻撃100倍と主人公の攻撃ボーナス低下を両方無効にしています。王の装備は魔王戦でも通常の性能です。任意の敵に補正を設定する場合は `royalEquipmentAttack`（敵の攻撃倍率・装備条件）と `royalEquipmentPlayerAttackMultiplier`（主人公の王装備の攻撃ボーナス倍率）を使えます。どちらも省略時は通常性能で、詳細は [敵configの編集方法](./encounters/README.md) を参照してください。装備の対象IDは [royal-equipment.json](./royal-equipment.json)、装備そのものの性能は [item-catalog.json](./item-catalog.json) で編集します。

魔王の出現場所・出現率・会話・勝利時の消失・GAME CLEARはワールド固有のため、エディタからNFC用データに設定します。魔王NPCを選び、会話と「話しかけて戦闘」で魔王（敵ID 4）を指定し、「勝つとこのNPCが消える」「勝つとGAME CLEAR」を有効にします。敗北では消えず、再戦できます。魔王は逃走不可、王様は一度も攻撃していない間だけ逃走できます。逃走を許可する設定に変更した場合も、逃走だけでは消えません。確率エンカウントで敵ID 4を選ぶだけではNPCイベントのクリア設定は付きません。

## その他のconfig

| 内容 | 編集ファイル | 説明 |
|---|---|---|
| 王様 | [encounters/enemies/king.json](./encounters/enemies/king.json) | 能力・セリフ・行動・1500Gと王の装備のドロップ |
| リーフジェル | [encounters/enemies/leaf-gel.json](./encounters/enemies/leaf-gel.json) | 草原の敵 |
| おばけキノコ | [encounters/enemies/ghost-mushroom.json](./encounters/enemies/ghost-mushroom.json) | 森の敵 |
| 森オオカミ | [encounters/enemies/forest-wolf.json](./encounters/enemies/forest-wolf.json) | 森の敵 |
| 敵の登録一覧 | [encounters/enemy-catalog.json](./encounters/enemy-catalog.json) | 敵configのファイル名（拡張子なし） |
| 主人公の初期状態 | [encounters/player-config.json](./encounters/player-config.json) | 名前・Lv1基礎能力（魔力を含む）・初期G・アイテム・技・経験値・防御倍率・敗北G減額率 |
| レベル・成長 | [progression-config.json](./progression-config.json) | 必要経験値・レベルごとの能力上昇（魔力は+2）。[編集方法](./progression.md) |
| アイテム・装備 | [item-catalog.json](./item-catalog.json) | 使用効果・装備補正・価格・必要レベル。[編集方法](./economy.md) |
| 王の装備セット | [royal-equipment.json](./royal-equipment.json) | 王様の姿になる装備・自動装備する武器 |
| 魔法・特技 | [skill-catalog.json](./skill-catalog.json) | 効果・消費MP・習得レベル。[編集方法](./skills.md) |
| 素材交換 | [exchange-recipes.json](./exchange-recipes.json) | 素材・完成品・個数・手数料。[編集方法](./economy.md) |
| 店の商品 | [shop-catalog.json](./shop-catalog.json) | 店ごとの販売アイテムID・交換レシピID |
| 会話テンプレート | [dialogue-templates.json](./dialogue-templates.json) | NPC・オブジェクトの共通会話・話者・後日談 |
| 冒険の物語 | [adventure-story.json](./adventure-story.json) | 章ごとの目的・クリア後の目的・結末 |

新しい敵は `encounters/enemies/` のJSONをコピーして別の名前・未使用の敵IDに変更し、`enemy-catalog.json` にファイル名を追加します。例：`forest-wolf.json` なら登録名は `"forest-wolf"`。登録名は半角英小文字・数字・ハイフンを使い、重複させません。素材の追加方法や数値の範囲は [戦闘configの説明](./encounters/README.md) を参照してください。

既存の敵・アイテム・技・会話のIDは保存データとNFCから参照するため維持してください。JSONにはコメントを書けません。編集後は `web/` で `npm run verify:all` を実行するとWeb・Python・ビルドを検証できます。

エディタの「試遊時の主人公」で開始レベル・お金・5部位の装備・アイテム個数を指定できる。「試遊用の設定を使う」をONにして「プレイ」する。HP/MP全快で開始し、「最初から」も同じ試遊条件へ戻る。装備の必要レベルに達していない場合は開始前にエラーを表示する。試遊条件はワールドJSON・NFC・通常の公開URLゲームへ含めず、ページを開き直すと初期値になる。

## 物語・会話の編集

`dialogue-templates.json` は既存IDを保持した88件の配列です。ID 46〜59は見本の「消えた灯火」の会話、60〜69は巨大版の集落・花園・道しるべ・水晶・遺跡の会話です。`name` はエディタの名前、`text` は通常本文、任意の `speaker` は表示する話者、`afterClear` はクリア後の本文、`storyRole` は物語の会話履歴を識別する役割です。本文に改行を入れられます。自由文を指定したNPCはその本文のまま表示します。

`adventure-story.json` の `title`・`chapters[].roles` と `objective`・`finalObjective`・`clearedObjective`・`ending` を変更できます。ロードした世界に役割がそろう章だけを使い、会話を聞くと「つよさ」の次の目的を更新します。会話履歴はURL起動では保存・復元し、初期化ボタンで消去し、会話を通行・戦闘の条件にはしません。物語用テンプレートのない独自ワールドには見本の目的・結末を表示しません。

北の王の `storyRole: "north-king"` は、南の王様撃破時の消失対象から除外する識別も兼ねます。見本では北の王に戦闘イベント・ランダム遭遇を設定しません。敗北の減額率は `encounters/player-config.json` の `defeatGoldLossPercent`（50＝半減、0＝無損失、100＝全額損失）で変更し、所持品・経験値は維持します。

探索素材は `tiles/exploration.ts`（花の草地・遺跡の石畳）と `objects/exploration.ts`（道しるべ・洞窟の水晶・古い石碑）にピクセル配列で保持します。`objects/world-locations.ts` に全体マップ用の遺跡アイコンを登録し、`scene-catalog.json`・`entity-frames.json`・エディタ・歩行・描画・調査に同じIDを使います。現在は床30 ID・配置37 ID、既存の順番を変えず末尾へ追加します。

## 保存・宿泊・裏ボス

保存ロジックは `game/world.ts`、キーは `tagquest.play-save.v1`。公開URLでは主人公を共通保存し、マップ位置・会話・宝箱・撃破・クリアは世界別に保存します。紹介／エディタの試遊は保存しません。名前と初期化は「つよさ」から操作できます。[保存と新機能の仕様](../../../docs/gameplay-ux-2026-10-14.md)。

レア敵ID10は `encounters/enemies/stray-crystal.json`、裏ボスID11は `encounters/enemies/void-god.json`。虚無の異空間は `game/postgame.ts` のWeb共通マップです。宿屋は `innkeeper` を配置し、15Gの宿泊メニューは `game/player-menu.ts`、回復は `game/player-state.ts` にあります。頭防具ID25〜27・永久強化ID28〜29・裏ボス報酬ID30は `item-catalog.json`、店の販売品は `shop-catalog.json`。

魔力は主人公stats.magicと成長growthPerLevel.magic、装備equipment.magicを合算して算出します。物理攻撃とは独立し、魔法・回復に使用します。初期魔力10／毎Lv+2、上限9999。旧セーブは経験値と装備IDから魔力を再計算します。

第2部「虚無の回廊」の出現表は `game/postgame.ts`、通常敵ID12〜14の能力・報酬は `encounters/enemies/void-shade.json`・`rift-wolf.json`・`abyss-sentinel.json`。虚無神ID11はHP1200・actionsPerTurn:2。星屑のオーブの新しい補正はHP100・MP50・攻撃30・防御30・魔力30です。`game/clear-record.ts` が世界別のクリア／撃破フラグを読み、紹介画面のタイトルへ真のクリアの証を表示します。
