# NTAG215向け：固定の城＋街

エディタの初期見本と同じ城・街をTQ v15で保存したバイナリ、容量レポート、起動URLです。地形、開始位置、NPC/オブジェクト、定型会話、キラキラのアイテム、出口、エンカウント設定を保存します。王様の隠し遭遇率は1歩0.1%です。

| 項目 | サイズ |
|---|---:|
| バイナリ | 199B |
| Base64urlハッシュ | 266文字 |
| 公開URL全体 | 302B |
| URIレコード＋TLV＋終端 | 307B |
| 標準NTAG215領域496Bの残り（予約0B） | 189B |

公開先は [TagQuest](https://tag-quest-kappa.vercel.app/)。Web／Pythonの初期値は `web/src/data/public-config.json` で共有します。公開先を変更した場合は再出力し、残容量を確認してから「NFC用URLを書き出す」を使います。タグには起動URLを単一URIレコードとして書き込みます。追加レコードや既存の制御TLVなどがあれば、エディタの予約領域へ指定してください。実タグへの書き込みは未実施です。

リポジトリ直下で再生成します。

```sh
python3 compiler/build.py --compact \
  --maps compiler/maps/castle.json compiler/maps/town.json \
  --out art/nfc/castle-town.bin \
  --base-url https://tag-quest-kappa.vercel.app/
```

`--base-url` を実際の公開先へ変更してください。`castle-town.url.txt` が起動URL、`castle-town.report.json` が内訳です。

`web/` の `npm run verify:nfc` で、Web/Pythonの完全一致、短い/長いVercel URLでもURL490B以下・予約5B込み496B以内、復元後の城→街→城の往復を確認します。充実した全6マップ見本はNDEF1088Bで、この1枚へはまだ収まりません。マップの規模や自由文によって容量は増えるため、任意の編集データすべての収容を保証するものではありません。
