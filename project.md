# NFC RPG 開発指示書

## 1. プロジェクト概要

NFCタグ1枚にゲーム固有データを保存し、そのデータをWebブラウザ上のRPGエンジンで読み込んで遊べる「超小容量RPG」を制作する。

基本コンセプトは以下。

- Webアプリ = ゲーム機 / RPGエンジン
- NFCタグ = ゲームカートリッジ
- NFC内データ = RPGのROM
- Python = RPGデータを作るコンパイラ

NFCタグにはゲームエンジンそのものを保存せず、マップ・ステージ・オブジェクト配置などのゲーム固有データを保存する。

NFCタグはNTAG215を想定する。

NFCへ書き込むURL全体を容量制限内に収める必要がある。

現時点ではURL全体で約450B前後を一つの目安とし、URLエンコードやNDEFのオーバーヘッドを考慮して、圧縮後のゲームバイナリは約300B前後を初期目標とする。

ただし、この値は仮定である。

最終的な容量制限は実際のNTAG215への書き込みテストによって決定する。

---

# 2. 技術構成

ゲーム制作側とゲーム実行側を明確に分離する。

## ゲーム制作・コンパイル

使用言語：

Python

役割：

- マップファイル読み込み
- ゲーム定義読み込み
- データ検証
- マップ圧縮
- 圧縮方式比較
- バイナリ生成
- URL用エンコード
- データ容量計算
- ゲームURL生成

Pythonは「NFC RPG Compiler」として扱う。

---

## ゲーム実行

使用技術：

- TypeScript
- Vite
- HTML
- CSS
- Canvas 2D

ReactなどのUIフレームワークは現時点では使用しない。

バックエンドは使用しない。

データベースも使用しない。

静的Webアプリとして動作させる。

---

# 3. 全体構成

ゲーム制作の流れ：

人間が編集可能なゲームデータ
↓
Python Compiler
↓
圧縮
↓
Binary Game Data
↓
URL-safe encoding
↓
ゲームURL
↓
NFCタグ

例：

castle.map
town.map
world.map
forest.map
demon_castle.map

↓

Python

↓

game.bin

↓

https://example.com/g#GAME_DATA

---

ゲーム実行の流れ：

NFC読み取り
↓
ブラウザ起動
↓
location.hash取得
↓
GAME_DATA取得
↓
デコード
↓
Uint8Array
↓
ゲームデータ解析
↓
ステージ生成
↓
Canvas描画
↓
ゲーム開始

---

# 4. localhostでの開発

NFCタグがなくてもゲームを完全にテストできる構成にする。

開発時：

http://localhost:5173/#GAME_DATA

本番：

https://example.com/g#GAME_DATA

Web側はどちらの場合でも `location.hash` からゲームデータを取得する。

NFCは最終的にURLを開くためだけに使用する。

ゲーム中にNFCへアクセスしたり、NFCへデータを書き戻したりしない。

---

# 5. ゲーム構成

現在想定しているゲーム進行：

お城
↓
街
↓
全体マップ
↓
森
↓
全体マップ
↓
魔王城
↓
魔王
↓
GAME CLEAR

全体マップについては同じマップデータを再利用する。

そのため基本的なマップは5種類。

1. Castle
2. Town
3. World
4. Forest
5. Demon Castle

進行状況によってWorldから移動できる場所を変化させることは可能とする。

---

# 6. マップサイズ目標

現時点での仮サイズ：

Castle
8 × 8程度

Town
12 × 10程度

World
10 × 10〜12 × 12程度

Forest
20 × 20程度

Demon Castle
16 × 20程度

合計1000マス前後を最初の目標とする。

ただし、これは保存データ上で1000個のタイルをそのまま記録するという意味ではない。

圧縮によって実現する。

マップサイズは固定仕様ではない。

圧縮結果を見ながら変更する。

---

# 7. Forest

Forestは迷路として制作する。

主要な探索ステージの一つ。

例えば、

- 木
- 道
- 宝箱
- 出口

などで構成する。

通常敵はマップ上には配置しない。

Forestについては、

「マップ全体のDefault Tileを木にして、通路だけ保存する」

方式などを検討する。

例：

Default = TREE

PATH H x y length
PATH V x y length

のような命令によって、20×20の400マスを直接保存せずに表現できる可能性がある。

---

# 8. Demon Castle

魔王城も主要探索ステージとする。

基本的には、

- 壁
- 床
- 部屋
- 通路
- イベント
- 魔王

などで構成する。

例えば、

Default = WALL

として、

ROOM
CORRIDOR
OBJECT

などを保存する方式を検討する。

最終地点には魔王を固定配置する。

---

# 9. ランダムエンカウント

通常敵はマップに配置しない。

ステージごとのランダムエンカウント方式を使用する。

敵は無限に出現可能。

処理：

プレイヤー移動
↓
エンカウント判定
↓
現在ステージのEnemy Table確認
↓
敵をランダム選択
↓
戦闘
↓
勝利
↓
マップへ戻る

倒した通常敵の状態は保存しない。

---

# 10. 敵データ

敵の詳細情報はWeb側に持つ。

例：

Enemy ID 0
SLIME

Enemy ID 1
WOLF

Enemy ID 2
GOBLIN

Web側に保存する情報：

- 名前
- HP
- 攻撃力
- Gold
- グラフィック
- その他戦闘パラメータ

NFC側には必要最低限のIDだけを保存する。

例えばステージ側には、

EnemyTable = 2

だけ保存する。

EnemyTable 2の内容そのものはWeb側で定義する。

---

# 11. Web側の役割

Web側は「RPGエンジン」を保持する。

例：

- プレイヤー
- 移動
- 当たり判定
- HP
- Gold
- 戦闘
- ランダムエンカウント
- 敵データ
- 武器データ
- アイテムデータ
- NPCの種類
- 会話辞書
- 武器屋処理
- 宿屋処理
- 回復処理
- 宝箱処理
- ボス戦
- ゲームクリア
- タイル画像
- キャラクター画像

Web側には「仕組み」を保存する。

---

# 12. NFC側の役割

NFC側には「このゲームがどのようなゲームなのか」を保存する。

例：

- ステージ
- ステージ順
- マップ
- マップサイズ
- NPC配置
- 宝箱配置
- 店配置
- 宿屋配置
- 出口配置
- ボス配置
- Enemy Table
- 必要最低限のイベント
- ステージ接続

重要：

容量削減のためにゲーム固有情報をすべてWeb側へ移動しない。

例えば、

「KINGというNPCの動作」

はWeb側でよい。

しかし、

「Castleの座標(4,2)にKINGを配置する」

という情報はゲームデータ側に持つ。

Web = Engine

NFC = Game

という関係を維持する。

---

# 13. プレイ中のデータ

セーブ機能は実装しない。

ゲーム開始時にNFC/URLからすべて読み込み、その後はJavaScriptのメモリ上で管理する。

例：

- Current HP
- Gold
- Weapon
- Inventory
- Current Stage
- Player Position
- Opened Chests
- Event Flags
- Boss Defeated

ページをリロードするとゲーム開始状態へ戻る。

NFCへの書き戻しは行わない。

---

# 14. Python Compiler

Python側はこのプロジェクトの重要な要素とする。

単なる補助スクリプトではなく、

「NFC RPG Compiler」

として設計する。

主な処理：

1. Game Definition読み込み
2. Map読み込み
3. Map検証
4. Object読み込み
5. 圧縮
6. Binary生成
7. サイズ計測
8. URL-safe encoding
9. URL生成

---

# 15. 人間が編集するマップ形式

人間が直接バイナリを書く必要がないようにする。

例えばForestを、

####################
#S........##########
######....##########
#.........##########
#.##############...#
#..................#
##################E#

のようなテキスト形式で記述できるようにすることを検討する。

例：

# = 木 / 壁

. = 通路 / 床

S = Start

E = Exit

実際の記号・フォーマットは後で決定する。

---

# 16. オブジェクト

マップタイルとオブジェクトは分離する方向で設計する。

候補：

NPC
CHEST
WEAPON_SHOP
INN
HEAL
EXIT
DOOR
ITEM
BOSS

例えば、

NPC 4 2 KING
CHEST 10 8 SWORD
SHOP 3 6 SHOP_A

などの人間が読みやすい形式から、Pythonが小さなバイナリへ変換する。

---

# 17. オブジェクト圧縮案

例えば16×16以下のマップの場合、

TYPE = 4bit
X = 4bit
Y = 4bit
SUBTYPE = 4bit

とすれば、

1 Object = 16bit = 2byte

で表現できる。

ただしこれは確定仕様ではない。

マップサイズやオブジェクト種類数を確認してから決定する。

---

# 18. 圧縮方式

以下を候補とする。

- Bit Packing
- RLE
- PackBits
- Default Tile + Difference
- Rectangle Fill
- Line Segment
- Corridor
- Room
- Metatile
- Sparse Representation
- Variable Length Integer
- Coordinate Delta

最初から高度な圧縮方式を大量に実装しない。

まず簡単な方式を複数試し、実際のゲームマップで比較する。

Python Compilerでは可能であれば、

RAW
RLE
COMMAND

など複数方式についてサイズを表示できるようにする。

例：

Forest 20x20

RAW:
250 bytes

RLE:
83 bytes

COMMAND:
54 bytes

のように比較できるようにする。

---

# 19. URL Encoding

Binary Game DataをそのままURLへ入れることはできないため、URL-safeな文字列へ変換する。

候補：

- Base64url
- その他のURL-safeな高効率エンコード

ただし、方式は現時点では確定しない。

重要なのは、

Binary Size

だけではなく、

Final URL Size

を必ず計測すること。

Python Compilerは最終的に、

Binary: xxx bytes
Encoded: xxx chars
Final URL: xxx bytes

を表示できるようにする。

---

# 20. プロジェクト構成案

project/

compiler/
    PythonによるNFC RPG Compiler

    maps/
        castle.map
        town.map
        world.map
        forest.map
        demon_castle.map

    build.py

web/
    TypeScript + Vite

    src/
        engine/
        codec/
        game/
        renderer/
        data/

README.md
SPEC.md

実際の構成は必要に応じて変更してよい。

ただし、

Python Compiler

と

TypeScript Game Engine

は明確に分離する。

---

# 21. 最初に実装するもの

いきなりRPG全体を完成させない。

Phase 1では最小構成のみ実装する。

## Python

非常に小さなテストマップを読み込む。

例：

#####
#...#
#.S.#
#...#
#####

これをPythonで読み込み、

- width
- height
- tile data

へ変換する。

まずRAW形式でバイナリ化できればよい。

さらに、

Binary Size

を表示する。

---

## TypeScript

Pythonが生成したデータを読み込み、

Canvas上にマップを表示する。

さらに、

- Player表示
- 上下左右移動
- 壁との当たり判定

まで実装する。

---

# 22. Phase 2

Phase 1が正常に動作したら、

URL Fragment

からゲームデータを読み込めるようにする。

localhost上で、

http://localhost:5173/#GAME_DATA

を開くとマップが生成される状態を作る。

---

# 23. Phase 3

その後、複数ステージに対応する。

まず、

Castle
Town
World
Forest
Demon Castle

の切り替えだけ実装する。

この時点では戦闘を実装しなくてもよい。

---

# 24. Phase 4以降

その後、必要に応じて、

- NPC
- Random Encounter
- Battle
- HP
- Gold
- Weapon
- Weapon Shop
- Inn
- Heal
- Chest
- Boss
- Game Clear

を順番に追加する。

---

# 25. 開発方針

このプロジェクトでは、

「450B前後という極端に小さい領域に、どれだけRPGを保存できるか」

という点そのものを重要なテーマとする。

そのため、新しいデータを追加するときは、

- 本当に保存する必要があるか
- Web側のルールとして定義できないか
- ID化できないか
- bit数を減らせないか
- 他のデータと共有できないか
- 圧縮できないか

を検討する。

ただし、

「全部Web側に固定してNFCにはゲームIDだけ入れる」

という設計にはしない。

NFCデータだけを変更することで、異なるマップ・配置・ステージ構成のゲームを作れることを重要な条件とする。

---

# 26. Codexへの重要な指示

現時点では、

- 最終バイナリフォーマット
- 最終圧縮方式
- 戦闘システム詳細
- タイル種類
- オブジェクト種類
- マップサイズ
- URLエンコード方式

などは完全には確定していない。

未確定仕様について勝手に大規模な設計を確定しないこと。

まず最小構成を実装し、実際のデータサイズを計測する。

特に最初は、

「ゲームを完成させること」

より、

「Pythonで作ったゲームデータをTypeScript側で正しく読み込んで、Canvas上にマップとして表示できること」

を最優先とする。

Phase 1が完成した時点で一度作業を止め、実装内容・データ形式・実際のbyte数を報告すること。

その結果を確認してから次の仕様を決定する。