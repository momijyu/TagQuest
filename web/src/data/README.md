# ゲーム設定の編集場所

ゲーム共通の数値・ルールはこのフォルダのJSONで編集します。開発中は保存してページを再読み込みすると反映されます。公開済みのゲームへの反映には再ビルド・公開が必要です。これらのconfigはWeb側にあり、NFC容量には加算しません。

## 魔王

**[encounters/enemies/demon-lord.json](./encounters/enemies/demon-lord.json)** に能力・行動・戦闘のセリフ・報酬・王の装備への攻撃倍率をまとめています。

| 編集するキー | 内容 | 現在の設定 |
|---|---|---|
| `stats.hp` | 最大HP | 120（武器追加後に調整） |
| `stats.attack` / `stats.defense` | 基礎攻撃力 / 防御力 | 12 / 4 |
| `patterns.beforeAttacked` | 主人公から攻撃される前の行動 | 剣 → 闇の炎 |
| `patterns.afterAttacked` | 一度でも攻撃された後の行動 | 剣 → 闇の炎 |
| 行動の `power` | 各攻撃の倍率 | 剣1倍 / 炎1.4倍 |
| 行動の `text` / 任意の `speech` | 行動ログ / 頭上のセリフ | ファイル内の文を編集 |
| 任意の `firstAttackedMessage` | 初めて攻撃された後の反応 | 未設定 |
| `royalEquipmentAttack.multiplier` | 王の装備への基礎攻撃力倍率 | 100 |
| `royalEquipmentAttack.match` | 発動する装備条件 | `any`＝1点でも装備 |
| `royalEquipmentPlayerAttackMultiplier` | 王の装備による主人公の攻撃ボーナス倍率 | 0＝魔王戦で無効 |
| `reward.gold` / `reward.experience` | 勝利報酬G / 経験値 | 0 / 0 |
| `reward.items` | ドロップのアイテムID・個数 | 空の配列 |
| `name` / `battleImage` / `background` | 名前 / 素材ID / 戦闘背景 | 魔王 / demon-lord / castle |

王の装備を所持するだけでは発動しません。条件は戦闘開始時に判定します。`match` を `set` にすると、王様の姿になる3部位を装備した場合だけ発動します。倍率を無効にしたい場合は `royalEquipmentAttack` 全体を削除します。装備の対象IDは [royal-equipment.json](./royal-equipment.json)、装備そのものの性能は [item-catalog.json](./item-catalog.json) で編集します。

`royalEquipmentPlayerAttackMultiplier` は別の設定で、主人公が装備している王冠・ローブ・杖・剣の攻撃ボーナス合計に掛けます。0〜1を指定し、0は無効、0.1は10%、1または項目の省略は通常の性能です。レベルによる基礎攻撃力と通常装備の攻撃ボーナスは維持します。物理系の特技にも反映しますが、固定ダメージ魔法・HP・MP・防御力は変更しません。戦闘終了後は通常の攻撃力へ戻ります。現在の王の3点装備・レベル10では通常攻撃24ダメージ、強打38ダメージです。魔王側の攻撃力100倍条件は引き続き有効です。

魔王の出現場所・出現率・会話・勝利時の消失・GAME CLEARはワールド固有のため、エディタからNFC用データに設定します。魔王NPCを選び、会話と「話しかけて戦闘」で魔王（敵ID 4）を指定し、「勝つとこのNPCが消える」「勝つとGAME CLEAR」を有効にします。敗北では消えず、再戦できます。王様と魔王は現在逃走不可です。逃走を許可する設定に変更した場合も、逃走だけでは消えません。確率エンカウントで敵ID 4を選ぶだけではNPCイベントのクリア設定は付きません。

## その他のconfig

| 内容 | 編集ファイル | 説明 |
|---|---|---|
| 王様 | [encounters/enemies/king.json](./encounters/enemies/king.json) | 能力・セリフ・行動・1500Gと王の装備のドロップ |
| リーフジェル | [encounters/enemies/leaf-gel.json](./encounters/enemies/leaf-gel.json) | 草原の敵 |
| おばけキノコ | [encounters/enemies/ghost-mushroom.json](./encounters/enemies/ghost-mushroom.json) | 森の敵 |
| 森オオカミ | [encounters/enemies/forest-wolf.json](./encounters/enemies/forest-wolf.json) | 森の敵 |
| 敵の登録一覧 | [encounters/enemy-catalog.json](./encounters/enemy-catalog.json) | 敵configのファイル名（拡張子なし） |
| 主人公の初期状態 | [encounters/player-config.json](./encounters/player-config.json) | 名前・Lv1基礎能力・初期G・アイテム・技・経験値・防御倍率 |
| レベル・成長 | [progression-config.json](./progression-config.json) | 必要経験値・レベルごとの能力上昇。[編集方法](./progression.md) |
| アイテム・装備 | [item-catalog.json](./item-catalog.json) | 使用効果・装備補正・価格・必要レベル。[編集方法](./economy.md) |
| 王の装備セット | [royal-equipment.json](./royal-equipment.json) | 王様の姿になる装備・自動装備する武器 |
| 魔法・特技 | [skill-catalog.json](./skill-catalog.json) | 効果・消費MP・習得レベル。[編集方法](./skills.md) |
| 店の商品 | [shop-catalog.json](./shop-catalog.json) | 店ごとの販売アイテムID |
| 会話テンプレート | [dialogue-templates.json](./dialogue-templates.json) | NPC・オブジェクトの共通会話 |

新しい敵は `encounters/enemies/` のJSONをコピーして別の名前・未使用の敵IDに変更し、`enemy-catalog.json` にファイル名を追加します。例：`forest-wolf.json` なら登録名は `"forest-wolf"`。登録名は半角英小文字・数字・ハイフンを使い、重複させません。素材の追加方法や数値の範囲は [戦闘configの説明](./encounters/README.md) を参照してください。

既存の敵・アイテム・技・会話のIDは保存データとNFCから参照するため維持してください。JSONにはコメントを書けません。編集後は `web/` で `npm run verify:all` を実行するとWeb・Python・ビルドを検証できます。

エディタの「試遊時の主人公」で開始レベル・お金・5部位の装備・アイテム個数を指定できる。「試遊用の設定を使う」をONにして「プレイ」する。HP/MP全快で開始し、「最初から」も同じ試遊条件へ戻る。装備の必要レベルに達していない場合は開始前にエラーを表示する。試遊条件はワールドJSON・NFC・通常の公開URLゲームへ含めず、ページを開き直すと初期値になる。
