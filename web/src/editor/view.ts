import { trialMarkup } from './trial';
import { defaultPublicBase } from '../codec/nfc-url';
export const editorMarkup = `
  <header class="editor-header">
    <h1>ワールドエディタ</h1>
    <div class="editor-actions">
      <a class="btn btn-sm btn-soft" href="#castle-exterior-title">素材一覧</a>
      <button class="btn btn-sm btn-primary" id="editor-play">▶ プレイ</button>
      <button class="btn btn-sm" id="editor-import">JSONを開く</button>
      <button class="btn btn-sm" id="editor-export-stage">マップJSON</button>
      <button class="btn btn-sm" id="editor-recovery">退避データ</button><button class="btn btn-sm btn-primary" id="editor-export-world">ワールドJSON</button>
      <button class="btn btn-sm" id="editor-export-binary">バイナリ</button>
      <input id="editor-file" type="file" accept=".json,application/json" hidden />
    </div>
  </header>
  <div class="editor-summary card bg-base-200 border border-base-300">
    <div><strong id="editor-byte-count"></strong><span id="editor-url-count"></span></div>
    <progress id="editor-budget" max="496" value="0" aria-label="NDEFと予約領域のタグ使用量"></progress>
    <span id="editor-tag-count" role="status"></span>
    <span id="editor-save-state" role="status">ブラウザに保存</span>
  </div>
  <details class="editor-panel"><summary>NFC用URL・マップ検証</summary>
      <label>公開先URL <input id="editor-base-url" class="input" type="url" value="${defaultPublicBase()}"></label>
      <label>タグの種類 <select id="editor-tag-type" class="select"><option value="ntag213">NTAG213（NDEF 144B / メモリ144B）</option><option value="ntag215" selected>NTAG215（NDEF 496B / メモリ504B）</option><option value="ntag216">NTAG216（NDEF 872B / メモリ888B）</option><option value="custom">手動指定</option></select></label>
      <label>タグのNDEF領域（B） <input id="editor-tag-budget" class="input" type="number" min="1" value="496"></label>
      <label>追加レコード・予約領域（B） <input id="editor-tag-reserved" class="input" type="number" min="0" value="0"></label>
      <p id="editor-ndef-detail"></p><textarea id="editor-game-url" class="textarea" readonly aria-label="ゲーム起動URL"></textarea>
      <button id="editor-export-url" class="btn btn-sm" aria-describedby="editor-url-export-status">NFC用URLを書き出す</button><a id="editor-local-preview" class="btn btn-sm" target="_blank" rel="noopener">このブラウザで試す</a><a id="editor-open-url" class="btn btn-sm" target="_blank" rel="noopener">公開URLを開く</a>
      <p id="editor-url-export-status" role="status"></p>
      <p>URLのゲームは、最初に開始位置があるマップから始まります。公開先を確認してからタグへ書き込みます。容量は単一URIレコード・TLV・終端を含む計算値です。タグ上限は標準のNDEF領域です。書き込みアプリの追加レコードや既存のLock Control TLV等は予約領域に加えてください。ローカル環境でも登録した公開先URLを初期表示します。</p>
      <button id="editor-optimize-terrain" class="btn btn-sm">山・森の配置を床にまとめる</button><button id="editor-validate" class="btn btn-sm">マップを検証</button><div id="editor-issues" role="status"></div>
    </details>
    <p id="editor-error" class="alert alert-error" role="alert" hidden></p>
  <section id="editor-play-session" class="play-session editor-play-session card bg-base-200 border border-base-300" hidden>
    <div class="play-heading"><h2 id="editor-play-title">プレイ</h2><button id="editor-stop-play" class="btn btn-sm">編集に戻る</button></div>
    <div id="editor-play-view"></div>
  </section>
  ${trialMarkup}
  <div id="editor-workspace">
  <nav id="editor-stages" class="editor-stages" aria-label="マップ"></nav>
  <div class="editor-new-map">
    <label>新しいマップ <input id="editor-new-name" value="フィールド" maxlength="80" /></label>
    <button id="editor-add-stage" class="btn btn-sm">＋ マップ追加</button>
    <button id="editor-add-world-sample" class="btn btn-sm btn-soft">＋ 全体マップの見本</button>
    <button id="editor-add-adventure-sample" class="btn btn-sm btn-soft">＋ 接続した冒険の見本</button>
    <button id="editor-clear-world" class="btn btn-sm btn-soft btn-error">全マップを削除</button>
  </div>
  <div class="editor-layout">
    <aside class="editor-panel card bg-base-200 border border-base-300">
      <h2>素材</h2>
      <div class="editor-categories" role="group" aria-label="素材の種類">
        <button class="btn btn-sm" data-category="floor">床・壁</button>
        <button class="btn btn-sm" data-category="object">建物・家具</button>
        <button class="btn btn-sm" data-category="npc">NPC</button>
        <button class="btn btn-sm" data-category="effect">装飾</button>
      </div>
      <div id="editor-palette" class="editor-palette"></div>
    </aside>
    <section class="editor-center">
      <div class="editor-toolbar card bg-base-200 border border-base-300">
        <div class="editor-tools" role="group" aria-label="編集ツール">
          <button class="btn btn-sm" data-tool="pan" aria-pressed="false">移動</button><button class="btn btn-sm" data-tool="select">選択・移動</button>
          <button class="btn btn-sm" data-tool="brush">ペン</button>
          <button class="btn btn-sm" data-tool="rectangle">四角塗り</button>
          <button class="btn btn-sm" data-tool="place">配置</button>
          <button class="btn btn-sm" data-tool="erase">配置を消す</button>
          <button class="btn btn-sm" data-tool="spawn">開始位置</button>
          <button class="btn btn-sm" data-tool="exit">出口</button>
        </div>
        <div class="editor-options">
          <button class="btn btn-sm" id="editor-undo" title="Ctrl / ⌘ + Z">戻す</button>
          <button class="btn btn-sm" id="editor-redo" title="Ctrl / ⌘ + Shift + Z">やり直す</button>
          <button class="btn btn-sm" id="editor-align">配置をマスにそろえる</button>
          <label>配置刻み <select id="editor-snap"><option value="16">1マス</option><option value="2">2px</option></select></label>
          <label>倍率 <select id="editor-zoom"><option value="0.5">1/2倍</option><option value="1">1倍</option><option value="2" selected>2倍</option><option value="3">3倍</option><option value="4">4倍</option></select></label>
          <button class="btn btn-sm" id="editor-fit">全体表示</button>
          <label><input id="editor-collisions" type="checkbox" class="checkbox checkbox-sm"> 当たり判定（青：配置枠／赤：通行不可）</label><label><input id="editor-grid" type="checkbox" checked /> マス目</label>
        </div>
      </div>
      <div id="editor-viewport" class="editor-viewport">
        <canvas id="editor-canvas" width="448" height="384" tabindex="0" aria-label="マップ編集。床はドラッグで塗り、配置物は選択して移動できます。">マップ編集</canvas>
      </div>
      <div class="editor-map-status"><span id="editor-map-count"></span><span id="editor-position">1マス = 16px</span></div>
    </section>
    <aside class="editor-panel editor-inspector card bg-base-200 border border-base-300">
      <h2>マップ</h2>
      <form id="editor-map-form" class="editor-form">
        <label>名前 <input id="editor-map-name" maxlength="80" required /></label>
        <div class="editor-field-row">
          <label>横（マス）<input id="editor-width" type="number" min="1" max="32" required /></label>
          <label>縦（マス）<input id="editor-height" type="number" min="1" max="32" required /></label>
        </div>
        <button class="btn btn-sm" type="submit" title="縮小すると範囲外を取り除きます。「戻す」で復元できます。">サイズ・名前を反映</button>
      </form>
      <div id="editor-stage-bytes"></div>
      <div class="editor-spawn-row"><span id="editor-spawn-position"></span><button class="btn btn-sm" id="editor-select-player">選択</button><button class="btn btn-sm" id="editor-clear-spawn">解除</button></div>
      <button class="btn btn-sm btn-soft" id="editor-remove-stage">このマップを削除</button>
      <h2>エンカウント</h2>
      <div id="editor-encounter-settings"></div>
      <h2>出口・ステージ移動</h2>
      <div id="editor-exit-selection"></div>
      <div id="editor-exits" class="editor-entity-list" aria-label="出口一覧"></div>
      <h2>配置物</h2>
      <div id="editor-selection"></div>
      <div id="editor-entities" class="editor-entity-list" aria-label="配置物一覧"></div>
    </aside>
  </div>
  </div>
`;
