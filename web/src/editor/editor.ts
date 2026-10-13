import { base64url, defaultPublicBase, nfcBudget, nfcTagPresets } from '../codec/nfc-url';
import { validateWorld } from './validation';
import './editor.css';
import catalog from '../data/scene-catalog.json';
import type { ImageSprite } from '../data/characters/types';
import { drawCompiledScene, entitySize, entityFrame, entityDrawingFrame, entityCollisionFrame } from '../renderer/compiled-scene';
import { placementInsets } from '../data/entity-placement';
import { npcKinds, isNpc } from '../data/npc-placement';
import { dialogueTemplates, canHaveDialogue, canHaveItem, customDialogueLimit, dialogueByteLength } from '../data/interactions';
import { itemCatalog } from '../data/items';
import { playerFrame, playerCollisionFrame, fitPlayerPosition } from '../data/player-placement';
import { drawSprite } from '../renderer/sprite';
import { lootSparkleFrames } from '../data/effects/loot-sparkle';
import { clone, compactFloor, encodeWorld, History, initialWorld, labels, makeEntity, paint,
  parseWorld, resize, stageLabel, toSceneData } from './model';
import type { World } from './model';
import { readTrialOptions } from './trial';
import { editorMarkup } from './view';
import { decodeScenes } from '../codec/scenes';
import { mountPlayView } from '../game/play-view';
import type { PlayCharacters } from '../game/play-view';
import { canonicalTile } from '../data/walls';
import { exitDirections } from '../data/stage-exits';
import { canStand } from '../game/walking';
import worldSource from '../../../compiler/maps/world.json';
import { appendAdventureSample } from './adventure';
import { appendAdventurePreset } from './adventure-presets';
import { enemyCatalog, parseEncounter } from '../data/encounters/settings';

const STORAGE_KEY = 'tagquest.world-editor.v1';
const RECOVERY_KEY = `${STORAGE_KEY}.recovery`;
const GOOD_KEY = `${STORAGE_KEY}.last-good`;
function validWorld(value: unknown): World { const world = parseWorld(value); encodeWorld(world, true); return world; }
type Tool = 'pan' | 'select' | 'brush' | 'rectangle' | 'place' | 'erase' | 'spawn' | 'exit';
type Category = 'floor' | 'object' | 'npc' | 'effect';
const categories: Record<Category, readonly string[]> = {
  floor: catalog.tiles.filter(name => canonicalTile(name) === name),
  object: ['castle', 'weapon-shop', 'armor-shop', 'item-shop', 'house-red', 'house-slate', 'well', 'throne', 'pillar', 'demon-throne', 'demon-pillar', 'treasure-chest', 'tree', 'world-mountain',
    'world-town', 'world-forest-entrance', 'world-cave', 'world-demon-castle', 'world-ruins', 'signpost', 'cave-crystal', 'stone-tablet'],
  npc: npcKinds,
  effect: ['loot', 'moat-outer-bank', 'moat-inner-bank', 'world-forest'],
};
const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function startEditor(root: HTMLElement, characters: PlayCharacters & { player: ImageSprite }): () => void {
  root.innerHTML = editorMarkup;
  function get<T extends HTMLElement>(id: string): T {
    const element = root.querySelector<T>(`#editor-${id}`);
    if (!element) throw new Error(`Editor control missing: ${id}`);
    return element;
  }
  get<HTMLInputElement>('base-url').value = defaultPublicBase(window.location);
  const canvas = get<HTMLCanvasElement>('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2Dを利用できません。');
  const errorBox = get('error');
  function error(value: unknown): void {
    errorBox.textContent = value instanceof Error ? value.message : typeof value === 'string' ? value : '処理できませんでした。';
    errorBox.hidden = false;
  }
  let saved: World = initialWorld();
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) saved = validWorld(JSON.parse(stored));
  } catch {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) localStorage.setItem(RECOVERY_KEY, raw);
      const good = localStorage.getItem(GOOD_KEY);
      if (good) saved = validWorld(JSON.parse(good));
    } catch { /* 保存領域が使えなくても編集を開始できる。 */ }
    error('保存データを退避しました。最後に開けた状態、または元の城と街を表示しています。「退避データ」で書き出せます。');
  }
  const history = new History(saved);
  let active = saved.stages[0].id;
  let selection = -1;
  let exitSelection = -1;
  let playerSelected = false;
  let category: Category = 'floor';
  let material = 'grass';
  let floorMaterial = 'grass';
  let entityMaterial = 'house-red';
  let tool: Tool = 'select';
  let zoom = 2;
  let grid = true;
  let collisions = false;
  let panning: { pointerId: number; x: number; y: number; left: number; top: number } | null = null;
  let snap = 16;
  let gesture: { before: World; start: { x: number; y: number }; last: { x: number; y: number };
    offset: { x: number; y: number }; pointerId: number } | null = null;
  const scene = () => history.world.stages.find(s => s.id === active) ?? history.world.stages[0];
  let playing = false;
  const playView = mountPlayView(get('play-view'), characters, () => playing && !root.hidden,
    id => stageLabel(history.world.stages.find(stage => stage.id === id)!));
  function stopPlay(): void {
    playing = false;
    playView.stop();
    get('play-session').hidden = true;
    get('workspace').hidden = false;
    get<HTMLButtonElement>('play').disabled = false;
    get<HTMLButtonElement>('import').disabled = false;
    canvas.focus({ preventScroll: true });
  }
  get('play').addEventListener('click', () => {
    cancelGesture();
    try {
      errorBox.hidden = true;
      // 書き出すバイナリを実際に復号し、編集中の配置から独立して試す。
      const world = decodeScenes(encodeWorld(history.world, true).bytes);
      const data = world.find(s => s.id === scene().id)!;
      get('play-title').textContent = 'プレイ';
      get('play-session').hidden = false;
      get('workspace').hidden = true;
      playing = true;
      playView.start(data, true, world, readTrialOptions(root));
      get<HTMLButtonElement>('play').disabled = true;
      get<HTMLButtonElement>('import').disabled = true;
    } catch (value) { stopPlay(); error(value); }
  });
  get('stop-play').addEventListener('click', stopPlay);

  function persist(): void {
    try {
      const raw = JSON.stringify(history.world);
      localStorage.setItem(GOOD_KEY, raw);
      localStorage.setItem(STORAGE_KEY, raw);
      get('save-state').textContent = 'ブラウザに保存済み';
    } catch {
      get('save-state').textContent = '保存できませんでした';
      error('ブラウザに保存できません。ワールドJSONを書き出してください。');
    }
  }
  function commit(before: World): void {
    try {
      history.world = validWorld(history.world);
      if (history.commit(before)) persist();
      refresh();
    } catch (value) { history.world = before; refresh(); error(value); }
  }
  function mutate(action: () => void): void {
    if (playing) return;
    const before = clone(history.world);
    try {
      errorBox.hidden = true;
      action();
      history.world = validWorld(history.world);
      commit(before);
    } catch (value) {
      history.world = before;
      refresh();
      error(value);
    }
  }
  function setTool(value: Tool): void {
    tool = value;
    root.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(button => {
      const pressed = button.dataset.tool === tool;
      button.classList.toggle('btn-primary', pressed);
      button.setAttribute('aria-pressed', String(pressed));
    });
    canvas.style.cursor = tool === 'select' ? 'grab' : 'crosshair';
  }
  function renderCanvas(): void {
    if (!context) return;
    const s = scene();
    const w = s.width * 16;
    const h = s.height * 16;
    // 人物の64px原画を整数倍で描く。表示倍率だけCSSで変える。
    if (canvas.width !== w * 4 || canvas.height !== h * 4) { canvas.width = w * 4; canvas.height = h * 4; }
    canvas.style.width = `${w * zoom}px`;
    canvas.style.height = `${h * zoom}px`;
    context.setTransform(4, 0, 0, 4, 0, 0);
    context.clearRect(0, 0, w, h);
    drawCompiledScene(context, toSceneData(s), characters);
    for (const e of s.entities) if (e.kind === 'loot') drawSprite(context, lootSparkleFrames[(2 + e.parameters[0]) % 8], e.x, e.y);
    if (collisions) {
      context.lineWidth = 0.7;
      for (const entity of s.entities) {
        const frame = entityFrame(entity), feet = entityCollisionFrame(entity);
        context.strokeStyle = '#50caff'; context.strokeRect(frame.x, frame.y, frame.width, frame.height);
        if (entity.kind !== 'loot' && !entity.kind.startsWith('moat-') && !['world-forest', 'world-town', 'world-forest-entrance', 'world-cave', 'world-demon-castle', 'world-ruins'].includes(entity.kind)) { context.strokeStyle = '#ff6875'; context.strokeRect(feet.x, feet.y, feet.width, feet.height); }
      }
      if (s.spawn) { const f = playerCollisionFrame(s.spawn); context.strokeStyle = '#ff6875'; context.strokeRect(f.x, f.y, f.width, f.height); }
    }
    if (grid) {
      context.strokeStyle = '#15243166';
      context.lineWidth = 0.25;
      context.beginPath();
      for (let x = 0; x <= w; x += 16) { context.moveTo(x, 0); context.lineTo(x, h); }
      for (let y = 0; y <= h; y += 16) { context.moveTo(0, y); context.lineTo(w, y); }
      context.stroke();
    }
    if (s.spawn) {
      const frame = playerFrame(s.spawn);
      context.strokeStyle = playerSelected ? '#ffe3a0' : '#7bffbf';
      context.lineWidth = 1;
      context.strokeRect(frame.x, frame.y, frame.width, frame.height);
      if (playerSelected) {
        const feet = playerCollisionFrame(s.spawn);
        context.strokeStyle = '#7bffbf';
        context.setLineDash([2, 2]);
        context.strokeRect(feet.x, feet.y, feet.width, feet.height);
        context.setLineDash([]);
      }
      context.fillStyle = '#08281b';
      context.fillRect(s.spawn.x, s.spawn.y, 7, 7);
      context.fillStyle = '#7bffbf';
      context.font = '6px sans-serif';
      context.fillText('S', s.spawn.x + 1, s.spawn.y + 6);
    }
    const entity = s.entities[selection];
    if (entity) {
      const { x, y, width, height } = entityFrame(entity);
      context.strokeStyle = '#ffe3a0';
      context.lineWidth = 1;
      context.strokeRect(x, y, width, height);
      if (isNpc(entity.kind) || entity.kind === 'tree') {
        const feet = entityCollisionFrame(entity);
        context.strokeStyle = '#7bffbf';
        context.setLineDash([2, 2]);
        context.strokeRect(feet.x, feet.y, feet.width, feet.height);
        context.setLineDash([]);
      }
    }
    s.exits.forEach((exit, index) => {
      context.strokeStyle = index === exitSelection ? '#ffe3a0' : '#61d9ff';
      context.lineWidth = 1;
      context.strokeRect(exit.x * 16 + 1, exit.y * 16 + 1, 14, 14);
      context.fillStyle = '#082431'; context.fillRect(exit.x * 16 + 1, exit.y * 16 + 1, 10, 6);
      context.fillStyle = '#61d9ff'; context.font = '5px sans-serif';
      context.fillText('→', exit.x * 16 + 2, exit.y * 16 + 6);
    });
    if (gesture && tool === 'rectangle') {
      const a = gesture.start, b = gesture.last;
      const x = Math.min(a.x >> 4, b.x >> 4), y = Math.min(a.y >> 4, b.y >> 4);
      const width = Math.abs((a.x >> 4) - (b.x >> 4)) + 1, height = Math.abs((a.y >> 4) - (b.y >> 4)) + 1;
      context.fillStyle = '#ffe3a040';
      context.fillRect(x * 16, y * 16, width * 16, height * 16);
      context.strokeStyle = '#ffe3a0';
      context.strokeRect(x * 16, y * 16, width * 16, height * 16);
    }
  }
  function renderPalette(): void {
    root.querySelectorAll<HTMLButtonElement>('[data-category]').forEach(button => {
      const pressed = button.dataset.category === category;
      button.classList.toggle('btn-primary', pressed);
      button.setAttribute('aria-pressed', String(pressed));
    });
    get('palette').innerHTML = categories[category].map(kind => `<button type="button" class="btn btn-soft ${material === kind ? 'btn-primary' : ''}" data-material="${kind}" aria-pressed="${material === kind}"><canvas width="96" height="96" aria-hidden="true"></canvas><span>${labels[kind]}</span><small data-footprint></small></button>`).join('');
    get('palette').querySelectorAll<HTMLButtonElement>('[data-material]').forEach(button => {
      const kind = button.dataset.material!;
      const preview = button.querySelector('canvas')!.getContext('2d');
      if (preview) {
        const sample = clone(scene());
        sample.spawn = null;
        sample.entities = [];
        sample.floor = { default: category === 'floor' ? kind : 'grass', rectangles: [] };
        let width = 16, height = 16;
        let footprintWidth = 16, footprintHeight = 16;
        if (category !== 'floor') {
          const entity = makeEntity(kind, 0, 0, { ...sample, width: 32, height: 32 });
          sample.entities = [entity];
          const frame = entityFrame(entity), drawing = entityDrawingFrame(entity);
          footprintWidth = frame.width; footprintHeight = frame.height;
          const minX = Math.min(frame.x, drawing.x), minY = Math.min(frame.y, drawing.y);
          width = Math.max(frame.x + frame.width, drawing.x + drawing.width) - minX;
          height = Math.max(frame.y + frame.height, drawing.y + drawing.height) - minY;
          entity.x -= minX; entity.y -= minY;
        }
        sample.width = Math.ceil(width / 16);
        sample.height = Math.ceil(height / 16);
        button.querySelector<HTMLElement>('[data-footprint]')!.textContent = `${footprintWidth / 16}×${footprintHeight / 16}マス`;
        const scale = 96 / Math.max(sample.width * 16, sample.height * 16);
        preview.scale(scale, scale);
        drawCompiledScene(preview, toSceneData(sample), characters);
        if (kind === 'loot') drawSprite(preview, lootSparkleFrames[2], 0, 0);
      }
      button.addEventListener('click', () => {
        material = kind;
        if (category === 'floor') { floorMaterial = kind; setTool(tool === 'rectangle' ? 'rectangle' : 'brush'); }
        else { entityMaterial = kind; setTool('place'); }
        renderPalette();
      });
    });
  }
  function renderSelection(): void {
    const s = scene();
    if (playerSelected && s.spawn) {
      get('selection').innerHTML = `<form id="editor-player-form" class="editor-form">
        <span class="editor-selected-label">主人公 · 配置1×2マス／当たり判定1×1マス</span>
        <div class="editor-field-row">
          <label>配置枠X（px）<input id="editor-player-x" type="number" min="0" max="${s.width * 16 - 16}" step="2" value="${s.spawn.x}" required /></label>
          <label>配置枠Y（px）<input id="editor-player-y" type="number" min="0" max="${s.height * 16 - 32}" step="2" value="${s.spawn.y}" required /></label>
        </div>
        <button class="btn btn-sm" type="submit">開始位置を反映</button>
        <button class="btn btn-sm btn-soft" type="button" id="editor-delete-player">開始位置を解除</button>
      </form>`;
      get<HTMLFormElement>('player-form').addEventListener('submit', event => {
        event.preventDefault();
        mutate(() => {
          const x = Number(get<HTMLInputElement>('player-x').value), y = Number(get<HTMLInputElement>('player-y').value);
          if (x < 0 || y < 0 || x + 16 > s.width * 16 || y + 32 > s.height * 16) throw new Error('主人公の1×2マスの枠をマップ内に収めてください。');
          s.spawn = { x, y };
        });
      });
      get('delete-player').addEventListener('click', removeSelection);
      return;
    }
    const e = s.entities[selection];
    const frame = e ? entityFrame(e) : null;
    get('selection').innerHTML = !e ? '<p class="editor-empty">配置物を選択</p>' : `
      <form id="editor-entity-form" class="editor-form">
        <span class="editor-selected-label">${labels[e.kind]} · ${entitySize(e).width / 16} × ${entitySize(e).height / 16}マス</span>
        <div class="editor-field-row">
          <label>配置枠X（px）<input id="editor-entity-x" type="number" min="0" max="${s.width * 16 - frame!.width}" step="2" value="${frame!.x}" required /></label>
          <label>配置枠Y（px）<input id="editor-entity-y" type="number" min="0" max="${s.height * 16 - frame!.height}" step="2" value="${frame!.y}" required /></label>
        </div>
        ${isNpc(e.kind) ? `<label>話しかけて戦闘<select id="editor-battle-enemy"><option value="">なし</option><option value="mixed">複数の敵（出現割合）</option>${enemyCatalog.map(enemy => `<option value="${enemy.id}" ${e.battleEvent?.enemyId === enemy.id ? 'selected' : ''}>${escapeHtml(enemy.name)}</option>`).join('')}</select></label><label><input id="editor-battle-once" type="checkbox" ${e.battleEvent?.once ? 'checked' : ''}> 勝つとこのNPCが消える</label><label><input id="editor-battle-clear" type="checkbox" ${e.battleEvent?.clear ? 'checked' : ''}> 勝つとGAME CLEAR</label>` : ''}
        ${e.kind === 'loot'  ? `<label>光の開始コマ<input id="editor-loot-phase" type="number" min="0" max="7" value="${e.parameters[0]}" required /></label>` : ''}
        ${canHaveDialogue(e.kind) ? `<label>${isNpc(e.kind) ? '会話' : '調べたときのメッセージ'}<select id="editor-dialogue-mode">
          <option value="template" ${e.dialogue?.type === 'template' ? 'selected' : ''}>定型文から選ぶ（推奨・ID 1B）</option>
          <option value="custom" ${e.dialogue?.type === 'custom' ? 'selected' : ''}>オリジナルテキスト（日本語は通常1文字3B）</option>
          <option value="none" ${!e.dialogue ? 'selected' : ''}>なし</option>
        </select></label>
        <label id="editor-template-field">定型文（会話のみのレコードは3B）<select id="editor-dialogue-template">${dialogueTemplates.map((entry, id) => `<option value="${id}" ${e.dialogue?.type === 'template' && e.dialogue.id === id ? 'selected' : ''}>${escapeHtml(entry.name)}</option>`).join('')}</select></label>
        <label id="editor-custom-field">メッセージ内容<textarea id="editor-dialogue-text" rows="5">${escapeHtml(e.dialogue?.type === 'custom' ? e.dialogue.text : '')}</textarea><span id="editor-dialogue-cost" role="status" aria-live="polite"></span><small>英数字は通常1B、日本語は通常3B、絵文字は通常4B。アイテムID・共通ヘッダーは別途加算。全体の容量は「配置を反映」後に更新します。</small></label>` : ''}
        ${canHaveItem(e.kind) ? `<label>アイテム<select id="editor-item-id"><option value="" ${e.itemId === undefined ? 'selected' : ''}>なし</option>${itemCatalog.map(item => `<option value="${item.id}" ${e.itemId === item.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></label>` : ''}
        ${e.kind.startsWith('moat-') ? `<div class="editor-field-row"><label>幅（px）<input id="editor-bank-width" type="number" min="2" max="510" step="2" value="${e.parameters[0] * 2}" required /></label><label>高さ（px）<input id="editor-bank-height" type="number" min="2" max="510" step="2" value="${e.parameters[1] * 2}" required /></label></div>` : ''}
        <button class="btn btn-sm" type="submit">配置を反映</button>
        <button class="btn btn-sm btn-soft" type="button" id="editor-delete-entity">この配置を削除</button>
      </form>`;
    if (!e) return;
    if (isNpc(e.kind)) { get<HTMLSelectElement>('battle-enemy').value = e.battleEvent ? String(e.battleEvent.enemyId) : ''; get<HTMLInputElement>('battle-once').checked = e.battleEvent?.once ?? false; get<HTMLInputElement>('battle-clear').checked = e.battleEvent?.clear ?? false; }
    if (canHaveDialogue(e.kind)) {
      const mode = get<HTMLSelectElement>('dialogue-mode');
      mode.value = e.dialogue?.type ?? 'none';
      get<HTMLSelectElement>('dialogue-template').value = String(e.dialogue?.type === 'template' ? e.dialogue.id : 0);
      get<HTMLTextAreaElement>('dialogue-text').value = e.dialogue?.type === 'custom' ? e.dialogue.text : '';
      const toggleFields = () => {
        get('template-field').hidden = mode.value !== 'template';
        get('custom-field').hidden = mode.value !== 'custom';
      };
      const updateCost = () => {
        const bytes = dialogueByteLength(get<HTMLTextAreaElement>('dialogue-text').value);
        get('dialogue-cost').textContent = `本文 ${bytes} / ${customDialogueLimit} B · 会話部分 ${bytes + 4} B（本文＋配置番号・種別・長さ）${bytes > customDialogueLimit ? ' · 上限超過' : ''}`;
      };
      get('dialogue-text').addEventListener('input', updateCost); updateCost();
      mode.addEventListener('change', toggleFields); toggleFields();
    }
    if (canHaveItem(e.kind)) get<HTMLSelectElement>('item-id').value = e.itemId === undefined ? '' : String(e.itemId);
    get<HTMLFormElement>('entity-form').addEventListener('submit', event => {
      event.preventDefault();
      mutate(() => {
        const inset = placementInsets(e.kind);
        e.x = Number(get<HTMLInputElement>('entity-x').value) + inset.left;
        e.y = Number(get<HTMLInputElement>('entity-y').value) + inset.top;
        if (isNpc(e.kind)) { const value = get<HTMLSelectElement>('battle-enemy').value; if (value === '') delete e.battleEvent; else e.battleEvent = { enemyId: Number(value), once: get<HTMLInputElement>('battle-once').checked || get<HTMLInputElement>('battle-clear').checked, clear: get<HTMLInputElement>('battle-clear').checked }; }
        if (e.kind === 'loot') e.parameters[0] = Number(get<HTMLInputElement>('loot-phase').value);
        if (canHaveDialogue(e.kind)) {
          const mode = get<HTMLSelectElement>('dialogue-mode').value;
          if (mode === 'template') e.dialogue = { type: 'template', id: Number(get<HTMLSelectElement>('dialogue-template').value) };
          else if (mode === 'custom') e.dialogue = { type: 'custom', text: get<HTMLTextAreaElement>('dialogue-text').value };
          else delete e.dialogue;
        }
        if (canHaveItem(e.kind)) {
          const value = get<HTMLSelectElement>('item-id').value;
          if (value === '') delete e.itemId;
          else e.itemId = Number(value);
        }
        if (e.kind.startsWith('moat-')) e.parameters = [Number(get<HTMLInputElement>('bank-width').value) / 2, Number(get<HTMLInputElement>('bank-height').value) / 2];
        const frame = entityFrame(e);
        if (frame.x < 0 || frame.y < 0 || frame.x + frame.width > s.width * 16 || frame.y + frame.height > s.height * 16) {
          throw new Error('配置枠がマップ内に収まる座標にしてください。');
        }
      });
    });
    get('delete-entity').addEventListener('click', removeSelection);
  }
  function renderEncounter(): void {
    const s = scene(), settings = s.encounter;
    get('encounter-settings').innerHTML = `<form id="editor-encounter-form" class="editor-form">
      <label>出現する敵<select id="editor-encounter-enemy"><option value="">なし</option><option value="mixed">複数の敵（出現割合）</option>${enemyCatalog.map(enemy => `<option value="${enemy.id}">${escapeHtml(enemy.name)}</option>`).join('')}</select></label>
      <label class="editor-check"><input id="editor-encounter-enabled" type="checkbox" ${settings?.enabled ? 'checked' : ''} /> このステージで出現させる</label>
      <label>1歩ごとの確率（%）<input id="editor-encounter-rate" type="number" min="0" max="100" step="0.01" value="${settings?.rate ?? 10}" required /></label>
      <div id="editor-encounter-table" hidden><p>0は出現なし。60・30・10なら60%・30%・10%です。</p>${enemyCatalog.map(enemy => `<label>${escapeHtml(enemy.name)}<input data-encounter-weight="${enemy.id}" type="number" min="0" max="255" step="1" value="${settings?.enemies?.find(e => e.enemyId === enemy.id)?.weight ?? 0}"></label>`).join('')}</div>
      <button class="btn btn-sm" type="submit">エンカウントを反映</button>
    </form>`;
    const enemy = get<HTMLSelectElement>('encounter-enemy');
    enemy.value = settings?.enemies ? 'mixed' : settings ? String(settings.enemyId) : '';
    const toggle = () => {
      get('encounter-table').hidden = enemy.value !== 'mixed';
      root.querySelectorAll<HTMLInputElement>('[data-encounter-weight]').forEach(input => { input.disabled = enemy.value !== 'mixed'; });
      get<HTMLInputElement>('encounter-enabled').disabled = enemy.value === '';
      get<HTMLInputElement>('encounter-rate').disabled = enemy.value === '';
    };
    enemy.addEventListener('change', toggle); toggle();
    get('encounter-form').addEventListener('submit', event => {
      event.preventDefault();
      mutate(() => {
        if (enemy.value === '') delete s.encounter;
        else if (enemy.value === 'mixed') {
          const enemies = [...root.querySelectorAll<HTMLInputElement>('[data-encounter-weight]')].map(input => ({ enemyId: Number(input.dataset.encounterWeight), weight: Number(input.value) })).filter(e => e.weight !== 0);
          s.encounter = parseEncounter({ enabled: get<HTMLInputElement>('encounter-enabled').checked, rate: Number(get<HTMLInputElement>('encounter-rate').value), enemies });
        } else s.encounter = { enabled: get<HTMLInputElement>('encounter-enabled').checked, enemyId: Number(enemy.value), rate: Number(get<HTMLInputElement>('encounter-rate').value) };
      });
    });
  }
  function renderExits(): void {
    const s = scene();
    if (exitSelection >= s.exits.length) exitSelection = -1;
    get('exits').innerHTML = s.exits.map((exit, i) => {
      const target = history.world.stages.find(stage => stage.id === exit.targetStageId)!;
      return `<button class="btn btn-soft" data-exit="${i}">列${exit.x + 1}・行${exit.y + 1} → ${escapeHtml(stageLabel(target))}</button>`;
    }).join('') || '<p class="editor-empty">「出口」でマップをタップして追加</p>';
    get('exits').querySelectorAll<HTMLButtonElement>('[data-exit]').forEach(button => button.addEventListener('click', () => {
      exitSelection = Number(button.dataset.exit); setTool('exit'); renderExits(); renderCanvas();
    }));
    const exit = s.exits[exitSelection];
    get('exit-selection').innerHTML = !exit ? '' : `<form id="editor-exit-form" class="editor-form">
      <div class="editor-field-row">
        <label>出口の列<input id="editor-exit-x" type="number" min="1" max="${s.width}" value="${exit.x + 1}" required /></label>
        <label>出口の行<input id="editor-exit-y" type="number" min="1" max="${s.height}" value="${exit.y + 1}" required /></label>
      </div>
      <label>移動先<select id="editor-exit-target">${history.world.stages.map(stage => `<option value="${stage.id}" ${exit.targetStageId === stage.id ? 'selected' : ''}>${escapeHtml(stageLabel(stage))}</option>`).join('')}</select></label>
      <div class="editor-field-row">
        <label>到着する足元の列<input id="editor-exit-target-x" type="number" min="1" max="32" value="${exit.targetX + 1}" required /></label>
        <label>到着する足元の行<input id="editor-exit-target-y" type="number" min="1" max="32" value="${exit.targetY + 1}" required /></label>
      </div>
      <label>到着時の向き<select id="editor-exit-direction">${exitDirections.map(direction => `<option value="${direction}" ${exit.direction === direction ? 'selected' : ''}>${({ front: '下', back: '上', left: '左', right: '右' })[direction]}</option>`).join('')}</select></label>
      <button class="btn btn-sm" type="submit">出口を反映</button>
      <button class="btn btn-sm btn-soft" type="button" id="editor-delete-exit">この出口を削除</button>
    </form>`;
    if (!exit) return;
    get<HTMLSelectElement>('exit-target').value = String(exit.targetStageId);
    get<HTMLSelectElement>('exit-direction').value = exit.direction;
    get<HTMLSelectElement>('exit-target').addEventListener('change', () => {
      const target = history.world.stages.find(stage => stage.id === Number(get<HTMLSelectElement>('exit-target').value))!;
      const arrival = defaultArrival(target);
      get<HTMLInputElement>('exit-target-x').value = String(arrival.x + 1);
      get<HTMLInputElement>('exit-target-y').value = String(arrival.y + 1);
    });
    get('exit-form').addEventListener('submit', event => {
      event.preventDefault();
      mutate(() => {
        Object.assign(exit, { x: Number(get<HTMLInputElement>('exit-x').value) - 1, y: Number(get<HTMLInputElement>('exit-y').value) - 1,
          targetStageId: Number(get<HTMLSelectElement>('exit-target').value), targetX: Number(get<HTMLInputElement>('exit-target-x').value) - 1,
          targetY: Number(get<HTMLInputElement>('exit-target-y').value) - 1, direction: get<HTMLSelectElement>('exit-direction').value });
      });
    });
    get('delete-exit').addEventListener('click', () => mutate(() => { s.exits.splice(exitSelection, 1); exitSelection = -1; }));
  }
  function defaultArrival(target: World['stages'][number]): { x: number; y: number } {
    const data = toSceneData(target);
    if (target.spawn) {
      const x = Math.floor(target.spawn.x / 16), y = Math.floor(target.spawn.y / 16) + 1;
      if (canStand(data, { x: x * 16, y: y * 16 - 16 })) return { x, y };
    }
    for (let y = 0; y < target.height; y++) for (let x = 0; x < target.width; x++) {
      if (canStand(data, { x: x * 16, y: y * 16 - 16 })) return { x, y };
    }
    return { x: 0, y: 0 };
  }
  function refresh(): void {
    const s = scene();
    active = s.id;
    if (selection >= s.entities.length) selection = -1;
    if (!s.spawn) playerSelected = false;
    const encoded = encodeWorld(history.world, true);
    get('byte-count').textContent = `バイナリ ${encoded.bytes.length} B`;
    try {
      const capacity = Number(get<HTMLInputElement>('tag-budget').value), reserved = Number(get<HTMLInputElement>('tag-reserved').value);
      const { url, urlBytes, ndefBytes, usedBytes, remainingBytes } = nfcBudget(encoded.bytes, get<HTMLInputElement>('base-url').value, capacity, reserved);
      get('url-count').textContent = `URL全体 ${urlBytes} B`;
      get('tag-count').textContent = `タグ使用量 ${usedBytes} / ${capacity} B · ${remainingBytes >= 0 ? `残り ${remainingBytes} B` : `${-remainingBytes} B超過`}`;
      get('ndef-detail').textContent = `NDEF・TLV・終端 ${ndefBytes} B ＋ 予約 ${reserved} B`;
      get<HTMLButtonElement>('export-url').disabled = remainingBytes < 0;
      get('url-export-status').textContent = remainingBytes < 0 ? `容量を${-remainingBytes} B減らすと、NFC用URLを書き出せます。` : '指定したタグ容量内で書き出せます。';
      get<HTMLProgressElement>('budget').max = capacity;
      get<HTMLProgressElement>('budget').value = usedBytes;
      get<HTMLAnchorElement>('local-preview').href = '#' + base64url(encoded.bytes);
      get<HTMLTextAreaElement>('game-url').value = url; get<HTMLAnchorElement>('open-url').href = url;
    } catch (value) { get('tag-count').textContent = String(value); get('ndef-detail').textContent = ''; get<HTMLProgressElement>('budget').value = 0; get<HTMLTextAreaElement>('game-url').value = ''; get('open-url').removeAttribute('href'); get('local-preview').removeAttribute('href'); get<HTMLButtonElement>('export-url').disabled = true; get('url-export-status').textContent = '公開先URL・タグ容量・予約領域を確認してください。'; }
    const report = encoded.reports.find(r => r.id === s.id)!;
    get('stage-bytes').textContent = `${report.bytes} B · 床 ${report.floorBytes} B (${report.codec}) · 配置 ${report.entityBytes} B · 会話・アイテム ${report.interactionBytes} B · 出口 ${report.exitBytes} B · エンカウント ${report.encounterBytes} B`;
    get('stages').innerHTML = history.world.stages.map(stage => `<button class="btn btn-soft ${stage.id === active ? 'btn-primary' : ''}" data-stage="${stage.id}" aria-pressed="${stage.id === active}">${escapeHtml(stageLabel(stage))} <small>${stage.width}×${stage.height} · ${encoded.reports.find(r => r.id === stage.id)!.bytes} B</small></button>`).join('');
    get('stages').querySelectorAll<HTMLButtonElement>('[data-stage]').forEach(button => button.addEventListener('click', () => {
      active = Number(button.dataset.stage); selection = -1; exitSelection = -1; playerSelected = false; refresh();
    }));
    get<HTMLInputElement>('map-name').value = stageLabel(s);
    get<HTMLInputElement>('width').value = String(s.width);
    get<HTMLInputElement>('height').value = String(s.height);
    get('map-count').textContent = `${s.width} × ${s.height} = ${s.width * s.height}マス · 配置 ${s.entities.length}個`;
    get('spawn-position').textContent = s.spawn ? `主人公 1×2マス · (${s.spawn.x}, ${s.spawn.y}) px` : '開始位置 未設定';
    get<HTMLButtonElement>('clear-spawn').disabled = !s.spawn;
    get<HTMLButtonElement>('select-player').disabled = !s.spawn;
    get<HTMLButtonElement>('remove-stage').disabled = history.world.stages.length === 1;
    get<HTMLButtonElement>('undo').disabled = !history.canUndo;
    get<HTMLButtonElement>('redo').disabled = !history.canRedo;
    get('entities').innerHTML = s.entities.map((e, i) => `<button class="btn btn-soft ${i === selection ? 'btn-primary' : ''}" data-entity="${i}" aria-pressed="${i === selection}">${labels[e.kind]}${isNpc(e.kind) && !e.dialogue && !e.battleEvent && !e.kind.endsWith('-merchant') ? '（会話未設定）' : ''}<small>${entityFrame(e).x}, ${entityFrame(e).y}</small></button>`).join('') || '<p class="editor-empty">配置なし</p>';
    get('entities').querySelectorAll<HTMLButtonElement>('[data-entity]').forEach(button => button.addEventListener('click', () => {
      selection = Number(button.dataset.entity); playerSelected = false; setTool('select'); refresh();
    }));
    renderSelection();
    renderEncounter();
    renderExits();
    renderCanvas();
  }
  function removeSelection(): void {
    if (playerSelected) mutate(() => { scene().spawn = null; playerSelected = false; });
    else if (selection >= 0) mutate(() => { scene().entities.splice(selection, 1); selection = -1; });
  }
  function point(event: PointerEvent): { x: number; y: number } {
    const bounds = canvas.getBoundingClientRect();
    return { x: Math.max(0, Math.min(scene().width * 16 - 1, (event.clientX - bounds.left) / bounds.width * scene().width * 16)),
      y: Math.max(0, Math.min(scene().height * 16 - 1, (event.clientY - bounds.top) / bounds.height * scene().height * 16)) };
  }
  function hit(p: { x: number; y: number }): number {
    for (let i = scene().entities.length - 1; i >= 0; i -= 1) {
      const frame = entityFrame(scene().entities[i]);
      if (p.x >= frame.x && p.y >= frame.y && p.x < frame.x + frame.width && p.y < frame.y + frame.height) return i;
    }
    return -1;
  }
  function snapped(value: number, extent: number, limit = 510): number {
    return Math.min(Math.floor((extent * 16 - 2) / snap) * snap, limit, Math.max(0, Math.floor(value / snap) * snap));
  }
  function moveEntity(entity: ReturnType<typeof makeEntity>, x: number, y: number, step = snap): void {
    const size = entitySize(entity), inset = placementInsets(entity.kind);
    const maxX = scene().width * 16 - size.width, maxY = scene().height * 16 - size.height;
    if (maxX < 0 || maxY < 0) throw new Error(`${labels[entity.kind]}の配置枠が入る大きさにマップを広げてください。`);
    const align = (value: number, max: number): number => Math.min(Math.floor(max / step) * step, Math.max(0, Math.floor(value / step) * step));
    entity.x = align(x, maxX) + inset.left;
    entity.y = align(y, maxY) + inset.top;
  }
  function brushLine(a: { x: number; y: number }, b: { x: number; y: number }): void {
    let x = a.x >> 4, y = a.y >> 4;
    const endX = b.x >> 4, endY = b.y >> 4;
    const dx = Math.abs(endX - x), dy = -Math.abs(endY - y), sx = x < endX ? 1 : -1, sy = y < endY ? 1 : -1;
    let distance = dx + dy;
    for (;;) {
      paint(scene(), floorMaterial, x, y);
      if (x === endX && y === endY) break;
      const twice = distance * 2;
      if (twice >= dy) { distance += dy; x += sx; }
      if (twice <= dx) { distance += dx; y += sy; }
    }
  }
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 || gesture) return;
    if (tool === 'pan') { const viewport = get('viewport'); panning = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop }; canvas.setPointerCapture(event.pointerId); return; }
    errorBox.hidden = true;
    const p = point(event), s = scene();
    canvas.focus({ preventScroll: true });
    if (tool === 'exit') {
      const x = p.x >> 4, y = p.y >> 4;
      exitSelection = s.exits.findIndex(exit => exit.x === x && exit.y === y);
      if (exitSelection < 0) mutate(() => {
        if (s.exits.length >= 255) throw new Error('出口は1マップ255個までです。');
        const target = history.world.stages.find(stage => stage.id !== s.id) ?? s;
        const arrival = defaultArrival(target);
        s.exits.push({ x, y, targetStageId: target.id, targetX: arrival.x, targetY: arrival.y, direction: 'front' });
        exitSelection = s.exits.length - 1;
      });
      else { renderExits(); renderCanvas(); }
      return;
    }
    if (tool === 'place' && s.entities.length >= 255) { error('配置は1マップ255個までです。'); return; }
    let newEntity;
    if (tool === 'place') {
      newEntity = makeEntity(entityMaterial, snapped(p.x, s.width), snapped(p.y, s.height), s);
      const frame = entityFrame(newEntity);
      try { moveEntity(newEntity, frame.x, frame.y); } catch (value) { error(value); return; }
    }
    let newSpawn;
    if (tool === 'spawn') {
      try { newSpawn = fitPlayerPosition(p, s.width, s.height, snap); }
      catch (value) { error(value); return; }
    }
    gesture = { before: clone(history.world), start: p, last: p, offset: { x: 0, y: 0 }, pointerId: event.pointerId };
    canvas.setPointerCapture(event.pointerId);
    if (tool === 'brush') brushLine(p, p);
    if (tool === 'select' || tool === 'erase') {
      const frame = s.spawn ? playerFrame(s.spawn) : null;
      playerSelected = Boolean(frame && p.x >= frame.x && p.x < frame.x + frame.width && p.y >= frame.y && p.y < frame.y + frame.height);
      selection = playerSelected ? -1 : hit(p);
      if (tool === 'erase') {
        if (playerSelected) { s.spawn = null; playerSelected = false; }
        else if (selection >= 0) { s.entities.splice(selection, 1); selection = -1; }
      }
      if (tool === 'select' && playerSelected && s.spawn) gesture.offset = { x: p.x - s.spawn.x, y: p.y - s.spawn.y };
      if (tool === 'select' && selection >= 0) {
        const frame = entityFrame(s.entities[selection]);
        gesture.offset = { x: p.x - frame.x, y: p.y - frame.y };
      }
    }
    if (newEntity) {
      s.entities.push(newEntity);
      selection = s.entities.length - 1;
      playerSelected = false;
    }
    if (newSpawn) { s.spawn = newSpawn; playerSelected = true; selection = -1; }
    renderCanvas();
  });
  canvas.addEventListener('pointermove', event => {
    if (panning && event.pointerId === panning.pointerId) { const viewport = get('viewport'); viewport.scrollLeft = panning.left - event.clientX + panning.x; viewport.scrollTop = panning.top - event.clientY + panning.y; return; }
    const p = point(event);
    get('position').textContent = `列${(p.x >> 4) + 1}・行${(p.y >> 4) + 1} · X${Math.floor(p.x)} / Y${Math.floor(p.y)} px`;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    if (tool === 'brush' && (gesture.last.x >> 4 !== p.x >> 4 || gesture.last.y >> 4 !== p.y >> 4)) brushLine(gesture.last, p);
    const e = scene().entities[selection];
    if (tool === 'spawn' || tool === 'select' && playerSelected && scene().spawn) {
      scene().spawn = fitPlayerPosition({ x: p.x - gesture.offset.x, y: p.y - gesture.offset.y }, scene().width, scene().height, snap);
    }
    if (tool === 'select' && e) {
      try { moveEntity(e, p.x - gesture.offset.x, p.y - gesture.offset.y); }
      catch (value) { error(value); }
    }
    gesture.last = p;
    renderCanvas();
  });
  canvas.addEventListener('pointerup', event => {
    if (panning && event.pointerId === panning.pointerId) { panning = null; return; }
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const before = gesture.before;
    if (tool === 'rectangle') {
      const a = gesture.start, b = point(event);
      paint(scene(), floorMaterial, Math.min(a.x >> 4, b.x >> 4), Math.min(a.y >> 4, b.y >> 4),
        Math.abs((a.x >> 4) - (b.x >> 4)) + 1, Math.abs((a.y >> 4) - (b.y >> 4)) + 1);
    }
    if (tool === 'brush' || tool === 'rectangle') compactFloor(scene());
    gesture = null;
    commit(before);
  });
  function cancelGesture(): void { panning = null; if (gesture) { history.world = gesture.before; gesture = null; refresh(); } }
  canvas.addEventListener('pointercancel', cancelGesture);
  canvas.addEventListener('lostpointercapture', cancelGesture);

  root.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(button => button.addEventListener('click', () => {
    const nextTool = button.dataset.tool as Tool;
    if (nextTool === 'brush' || nextTool === 'rectangle') { category = 'floor'; material = floorMaterial; renderPalette(); }
    else if (nextTool === 'place' && category === 'floor') {
      category = 'object'; material = categories.object.includes(entityMaterial) ? entityMaterial : categories.object[0];
      entityMaterial = material; renderPalette();
    }
    setTool(nextTool);
  }));
  root.querySelectorAll<HTMLButtonElement>('[data-category]').forEach(button => button.addEventListener('click', () => {
    category = button.dataset.category as Category;
    material = category === 'floor' ? floorMaterial : categories[category].includes(entityMaterial) ? entityMaterial : categories[category][0];
    if (category === 'floor') setTool('brush');
    else { entityMaterial = material; setTool('place'); }
    renderPalette();
  }));
  get<HTMLSelectElement>('zoom').addEventListener('change', event => { zoom = Number((event.target as HTMLSelectElement).value); renderCanvas(); });
  get<HTMLSelectElement>('snap').addEventListener('change', event => { snap = Number((event.target as HTMLSelectElement).value); });
  get<HTMLInputElement>('grid').addEventListener('change', event => { grid = (event.target as HTMLInputElement).checked; renderCanvas(); });
  get('collisions').addEventListener('change', () => { collisions = get<HTMLInputElement>('collisions').checked; renderCanvas(); });
  get('tag-type').addEventListener('change', () => {
    const preset = nfcTagPresets.find(preset => preset.id === get<HTMLSelectElement>('tag-type').value);
    if (preset) get<HTMLInputElement>('tag-budget').value = String(preset.ndefBytes);
    refresh();
  });
  get('tag-budget').addEventListener('input', () => { get<HTMLSelectElement>('tag-type').value = 'custom'; refresh(); });
  for (const id of ['base-url', 'tag-budget', 'tag-reserved']) get(id).addEventListener('change', refresh);
  get('export-url').addEventListener('click', () => {
    try {
      // Recheck current fields as well: a focused input may not have emitted change yet.
      const budget = nfcBudget(encodeWorld(history.world, true).bytes, get<HTMLInputElement>('base-url').value,
        Number(get<HTMLInputElement>('tag-budget').value), Number(get<HTMLInputElement>('tag-reserved').value));
      refresh();
      if (budget.remainingBytes < 0) return;
      download(budget.url + '\n', 'text/plain', 'tagquest.url.txt');
    } catch (value) { refresh(); error(value); }
  });
  get('optimize-terrain').addEventListener('click', () => mutate(() => {
    for (const stage of history.world.stages) {
      const data = toSceneData(stage);
      stage.entities = stage.entities.filter(entity => {
        const base = entity.kind === 'world-mountain' ? 'grass' : entity.kind === 'world-forest' ? 'forest-ground' : undefined;
        if (!base || entity.dialogue || entity.itemId !== undefined || entity.battleEvent || entity.x % 16 || entity.y % 16 || catalog.tiles[data.tiles[entity.y / 16 * stage.width + entity.x / 16]] !== base) return true;
        paint(stage, entity.kind, entity.x / 16, entity.y / 16); return false;
      });
      compactFloor(stage);
    }
    selection = -1;
  }));
  get('validate').addEventListener('click', () => {
    const issues = validateWorld(history.world), box = get('issues');
    if (!issues.length) { box.textContent = '問題は見つかりませんでした。'; return; }
    box.innerHTML = issues.map((issue, i) => `<button class="btn btn-sm" data-issue="${i}">${escapeHtml(issue.text)}</button>`).join('');
    box.querySelectorAll<HTMLButtonElement>('[data-issue]').forEach(button => button.addEventListener('click', () => { const issue = issues[Number(button.dataset.issue)]; active = issue.stageId; selection = -1; refresh(); const viewport = get('viewport'); viewport.scrollLeft = Math.max(0, issue.x * zoom - 48); viewport.scrollTop = Math.max(0, issue.y * zoom - 48); }));
  });
  get('fit').addEventListener('click', () => {
    const viewport = get('viewport');
    const available = Math.min((viewport.clientWidth - 48) / (scene().width * 16), (viewport.clientHeight - 48) / (scene().height * 16));
    zoom = [4, 3, 2, 1, 0.5].find(value => value <= available) ?? 0.5;
    get<HTMLSelectElement>('zoom').value = String(zoom); renderCanvas();
  });
  get<HTMLFormElement>('map-form').addEventListener('submit', event => {
    event.preventDefault();
    mutate(() => {
      const name = get<HTMLInputElement>('map-name').value.trim();
      const width = Number(get<HTMLInputElement>('width').value), height = Number(get<HTMLInputElement>('height').value);
      if (!name || name.length > 80) throw new Error('マップ名を1〜80文字で入力してください。');
      if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || width > 32 || height < 1 || height > 32) throw new Error('サイズは1〜32マスにしてください。');
      if (width < scene().width || height < scene().height) {
        const lost = scene().entities.filter(e => { const f = entityFrame(e); return f.x + f.width > width * 16 || f.y + f.height > height * 16; }).length;
        const exits = history.world.stages.reduce((n, s) => n + s.exits.filter(e => s.id === scene().id && (e.x >= width || e.y >= height) || e.targetStageId === scene().id && (e.targetX >= width || e.targetY >= height)).length, 0);
        if (!window.confirm(`マップを${width}×${height}へ縮小します。範囲外の配置${lost}個・出口${exits}個が削除されます。よろしいですか？「戻す」で復元できます。`)) return;
      }
      scene().name = name;
      if (width !== scene().width || height !== scene().height) {
        resize(scene(), width, height);
        for (const stage of history.world.stages) stage.exits = stage.exits.filter(exit => exit.targetStageId !== scene().id || exit.targetX < width && exit.targetY < height);
        scene().entities = scene().entities.filter(e => entitySize(e).width <= width * 16 && entitySize(e).height <= height * 16);
        for (const entity of scene().entities) {
          const frame = entityFrame(entity);
          moveEntity(entity, frame.x, frame.y, 2);
        }
        selection = -1; playerSelected = false;
      }
    });
  });
  get('add-stage').addEventListener('click', () => mutate(() => {
    const name = get<HTMLInputElement>('new-name').value.trim();
    const id = Array.from({ length: 256 }, (_, i) => i).find(id => !history.world.stages.some(s => s.id === id));
    if (id === undefined || history.world.stages.length >= 255) throw new Error('マップは255個までです。');
    if (!name) throw new Error('新しいマップの名前を入力してください。');
    history.world.stages.push({ id, name, width: 16, height: 16, spawn: null, spawnAnchor: 'frame', residentAnchor: 'frame', npcAnchor: 'frame', buildingAnchor: 'frame', floor: { default: 'grass', rectangles: [] }, entities: [], exits: [] });
    active = id; selection = -1; exitSelection = -1; playerSelected = false;
  }));
  get('add-world-sample').addEventListener('click', () => mutate(() => {
    const id = Array.from({ length: 256 }, (_, i) => i).find(id => !history.world.stages.some(s => s.id === id));
    if (id === undefined || history.world.stages.length >= 255) throw new Error('マップは255個までです。');
    const sample = parseWorld(worldSource).stages[0];
    sample.id = id;
    history.world.stages.push(sample);
    active = id; selection = -1; exitSelection = -1; playerSelected = false;
  }));
  function discardEmptyPlaceholder(): void {
    const [stage] = history.world.stages;
    if (history.world.stages.length === 1 && stage.name === '空のマップ' && stage.width === 16 && stage.height === 16
      && !stage.spawn && stage.floor.default === 'empty' && !stage.floor.rectangles.length
      && !stage.entities.length && !stage.exits.length && !stage.encounter) history.world.stages = [];
  }
  get('add-adventure-sample').addEventListener('click', () => mutate(() => {
    discardEmptyPlaceholder();
    active = appendAdventureSample(history.world);
    selection = -1; exitSelection = -1; playerSelected = false;
  }));
  for (const size of ['large', 'small'] as const) get(`add-${size}-sample`).addEventListener('click', () => mutate(() => {
    discardEmptyPlaceholder();
    active = appendAdventurePreset(history.world, size);
    selection = -1; exitSelection = -1; playerSelected = false;
  }));
  get('clear-world').addEventListener('click', () => {
    if (playing) return;
    const approved = window.confirm(
      `現在の${history.world.stages.length}枚のマップをすべて削除します。\n` +
      '床・配置物・会話・出口・エンカウント設定を消し、空のマップ1枚から始めます。\n' +
      '本当に削除しますか？\n「戻す」で復元できます。',
    );
    if (!approved) return;
    cancelGesture();
    mutate(() => {
      history.world = parseWorld([{
        id: 0, name: '空のマップ', width: 16, height: 16, spawn: null,
        spawnAnchor: 'frame', residentAnchor: 'frame', npcAnchor: 'frame', buildingAnchor: 'frame',
        floor: { default: 'empty', rectangles: [] }, entities: [], exits: [],
      }]);
      active = 0; selection = -1; exitSelection = -1; playerSelected = false;
      setTool('select');
    });
  });
  get('remove-stage').addEventListener('click', () => mutate(() => {
    if (history.world.stages.length <= 1) return;
    if (!window.confirm(`${stageLabel(scene())}の床・配置${scene().entities.length}個と、このマップにつながる出口を削除します。よろしいですか？「戻す」で復元できます。`)) return;
    history.world.stages = history.world.stages.filter(s => s.id !== active);
    for (const stage of history.world.stages) stage.exits = stage.exits.filter(exit => exit.targetStageId !== active);
    active = history.world.stages[0].id; selection = -1; exitSelection = -1; playerSelected = false;
  }));
  get('clear-spawn').addEventListener('click', () => mutate(() => { scene().spawn = null; }));
  get('select-player').addEventListener('click', () => { playerSelected = Boolean(scene().spawn); selection = -1; setTool('select'); refresh(); });
  get('align').addEventListener('click', () => mutate(() => {
    for (const entity of scene().entities) {
      if (entity.kind.startsWith('moat-')) continue;
      const frame = entityFrame(entity);
      moveEntity(entity, frame.x, frame.y, 16);
    }
    if (scene().spawn) scene().spawn = fitPlayerPosition(scene().spawn!, scene().width, scene().height);
  }));
  function undo(redo = false): void { cancelGesture(); if (redo) history.redo(); else history.undo(); selection = -1; exitSelection = -1; playerSelected = false; persist(); refresh(); }
  get('undo').addEventListener('click', () => undo());
  get('redo').addEventListener('click', () => undo(true));
  function keydown(event: KeyboardEvent): void {
    if (root.hidden || playing || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(event.shiftKey); }
    else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); removeSelection(); }
    else if (event.key === 'Escape') { cancelGesture(); selection = -1; exitSelection = -1; playerSelected = false; refresh(); }
  }
  window.addEventListener('keydown', keydown);
  function download(data: BlobPart, type: string, filename: string): void {
    const link = document.createElement('a');
    const url = URL.createObjectURL(new Blob([data], { type }));
    link.href = url; link.download = filename; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  get('recovery').addEventListener('click', () => { const raw = localStorage.getItem(RECOVERY_KEY); if (raw) download(raw, 'application/json', 'tagquest-recovery.json'); else error('退避データはありません。'); });
  get('export-world').addEventListener('click', () => download(JSON.stringify(history.world, null, 2) + '\n', 'application/json', 'tagquest-world.json'));
  get('export-stage').addEventListener('click', () => download(JSON.stringify(scene(), null, 2) + '\n', 'application/json', `map-${scene().id}.json`));
  get('export-binary').addEventListener('click', () => download(encodeWorld(history.world, true).bytes, 'application/octet-stream', 'scenes.bin'));
  get('import').addEventListener('click', () => get<HTMLInputElement>('file').click());
  get<HTMLInputElement>('file').addEventListener('change', async event => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('JSONは2MBまでです。');
      const imported = parseWorld(JSON.parse(await file.text()));
      mutate(() => { history.world = imported; active = imported.stages[0].id; selection = -1; exitSelection = -1; playerSelected = false; });
    } catch (value) { error(value); }
    finally { input.value = ''; }
  });
  renderPalette(); setTool('select'); refresh();
  return () => { playView.dispose(); cancelGesture(); window.removeEventListener('keydown', keydown); };
}
