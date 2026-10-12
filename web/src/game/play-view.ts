import './play.css';
import type { SceneData } from '../codec/scenes';
import type { ImageSprite } from '../data/characters/types';
import { lootSparkleFrames } from '../data/effects/loot-sparkle';
import { drawCompiledScene } from '../renderer/compiled-scene';
import { drawSprite } from '../renderer/sprite';
import { createWorldGame } from './world';
import type { Direction } from './walking';
import type { EncounterEvent, WorldGameOptions } from './world';
import { findItem } from '../data/items';
import { mountBattleView } from './battle-view';
import { mountPlayerMenus } from './player-menu';
import { updateResourceBar } from './resource-bars';
import type { EnemyIllustrations } from '../data/encounters/enemy-illustrations';

export interface PlayCharacters {
  readonly king: ImageSprite;
  readonly kings: Readonly<Record<Direction, ImageSprite>>;
  readonly players: Readonly<Record<Direction, ImageSprite>>;
  readonly enemyIllustrations?: EnemyIllustrations;
}
const directions: Record<string, Direction> = {
  ArrowUp: 'back', ArrowDown: 'front', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'back', s: 'front', a: 'left', d: 'right',
};

export function mountPlayView(root: HTMLElement, characters: PlayCharacters, isActive = () => true, stageName = (id: number) => `マップ ${id}`) {
  root.innerHTML = `<div class="play-console" data-play-console>
  <div class="play-screen" data-play-screen>
  <span class="play-stage" data-play-stage></span>
  <div class="play-status"><div class="resource-meter"><span data-field-hp></span><progress class="resource-bar" data-field-hp-bar></progress></div>
    <div class="resource-meter"><span data-field-mp></span><progress class="resource-bar resource-mp" data-field-mp-bar></progress></div><span data-play-status></span></div>
  <div class="play-viewport" data-play-viewport>
    <canvas data-play-canvas tabindex="0" aria-label="矢印キーまたはWASDで移動、E・Enter・Spaceで話す・調べる">歩行プレビュー</canvas>
  </div>
  <div class="play-message game-window" data-play-message role="status" aria-live="polite" hidden>
    <strong data-play-speaker></strong><p data-play-text></p>
    <button class="btn btn-sm" data-play-advance>つづける</button>
    <button class="btn btn-sm" data-play-cancel-battle hidden>やめる</button>
  </div>
  </div>
  <div class="play-controls" data-play-controls>
    <div class="play-pad" role="group" aria-label="移動">
      <button class="btn btn-sm" data-direction="back" aria-label="上へ移動">↑</button>
      <button class="btn btn-sm" data-direction="left" aria-label="左へ移動">←</button>
      <button class="btn btn-sm" data-direction="front" aria-label="下へ移動">↓</button>
      <button class="btn btn-sm" data-direction="right" aria-label="右へ移動">→</button>
    </div>
    <button class="btn btn-primary play-interact" data-play-interact>はなす・しらべる</button>
    <div class="play-menu">
      <details class="play-inventory" data-play-inventory><summary class="btn btn-sm btn-soft">どうぐ</summary>
        <div class="play-inventory-window game-window" data-play-inventory-window><strong>どうぐ</strong><p data-play-items>なし</p>
          <button class="btn btn-sm" data-play-close-items>とじる</button>
        </div>
      </details>
      <button class="btn btn-sm btn-soft" data-play-reset>最初から</button>
    </div>
    <span class="play-key-hint">移動：矢印 / WASD　決定：E / Enter / Space　キャンセル / やめる：Esc</span>
    <p class="play-clear game-window" data-play-clear role="status" hidden>クリアおめでとう！<br>自由に冒険を続けられます。「最初から」でやり直せます。</p>
  </div>
  <section class="play-battle" data-play-battle aria-label="戦闘" hidden></section>
  <div class="play-shop-window game-window" data-play-shop role="dialog" aria-label="お店" hidden></div>
  <div class="play-encounter" data-play-encounter role="status" aria-label="敵と遭遇。戦闘へ移行中" hidden>
    <span class="encounter-flash" data-encounter-flash aria-hidden="true"></span>
    <span class="encounter-shutter encounter-shutter-top" data-encounter-top aria-hidden="true"></span>
    <span class="encounter-shutter encounter-shutter-bottom" data-encounter-bottom aria-hidden="true"></span>
  </div>
  </div>`;
  const canvas = root.querySelector<HTMLCanvasElement>('[data-play-canvas]')!;
  const viewport = root.querySelector<HTMLElement>('[data-play-viewport]')!;
  const inventory = root.querySelector<HTMLDetailsElement>('[data-play-inventory]')!;
  const consoleElement = root.querySelector<HTMLElement>('[data-play-console]')!;
  const encounterEffect = root.querySelector<HTMLElement>('[data-play-encounter]')!;
  const battleElement = root.querySelector<HTMLElement>('[data-play-battle]')!;
  const flash = root.querySelector<HTMLElement>('[data-encounter-flash]')!;
  const shutters = [root.querySelector<HTMLElement>('[data-encounter-top]')!, root.querySelector<HTMLElement>('[data-encounter-bottom]')!];
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2Dを利用できません。');
  let game: ReturnType<typeof createWorldGame> | undefined;
  let request: number | undefined;
  let previousLoot = -1;
  let nextStep = 0;
  let displayScale = 2;
  let seenEncounter: EncounterEvent | null = null;
  let transition: { elapsed: number; previousTime?: number; reduced: boolean } | undefined;
  const held = new Map<string, Direction>();
  const active = () => Boolean(game && !document.hidden && isActive());
  const battle = mountBattleView(battleElement, characters.king, () => active() && !transition, outcome => {
    if (!active()) return;
    game!.finishEncounter(outcome); clearInput(); draw(performance.now()); resize(); canvas.focus({ preventScroll: true });
  }, { inventory: () => game?.inventory ?? [], gold: () => game?.status.gold ?? 0, illustrations: characters.enemyIllustrations });
  const menus = mountPlayerMenus(root.querySelector<HTMLElement>('[data-play-inventory-window]')!, root.querySelector<HTMLElement>('[data-play-shop]')!,
    () => game, active, () => { clearInput(); draw(performance.now()); if (!game?.shop && !inventory.open) canvas.focus({ preventScroll: true }); }, closeItems);
  function clearInput(): void { held.clear(); nextStep = 0; }
  function pauseInput(): void {
    clearInput();
    if (transition) transition.previousTime = undefined;
  }
  function clearTransition(): void {
    transition = undefined;
    encounterEffect.hidden = true;
    consoleElement.setAttribute('aria-busy', 'false');
    battleElement.inert = false;
  }
  function drawTransition(): void {
    if (!transition) return;
    const { elapsed, reduced } = transition;
    const midpoint = reduced ? 160 : 440, duration = reduced ? 320 : 760;
    encounterEffect.dataset.phase = elapsed < (reduced ? 160 : 120) ? (reduced ? 'close' : 'flash') : elapsed < midpoint ? 'close' : 'reveal';
    flash.style.opacity = String(!reduced && elapsed < 120 ? Math.sin(Math.PI * elapsed / 120) * 0.65 : 0);
    const cover = reduced ? 1 : elapsed < 120 ? 0 : elapsed < midpoint
      ? Math.floor(Math.min(1, (elapsed - 120) / 320) * 8) / 8
      : 1 - Math.floor(Math.min(1, (elapsed - midpoint) / 320) * 8) / 8;
    encounterEffect.style.opacity = String(reduced ? Math.max(0, elapsed < midpoint ? elapsed / midpoint : 1 - (elapsed - midpoint) / (duration - midpoint)) : 1);
    shutters.forEach(shutter => { shutter.style.transform = `scaleY(${cover})`; });
  }
  function advanceTransition(time: number): void {
    if (!transition) return;
    if (transition.previousTime !== undefined) transition.elapsed += Math.max(0, time - transition.previousTime);
    transition.previousTime = time;
    if (transition.elapsed >= (transition.reduced ? 320 : 760)) clearTransition();
    else drawTransition();
  }
  function draw(time = 0): void {
    if (!game || !context) return;
    const scene = game.scene;
    context.setTransform(4, 0, 0, 4, 0, 0);
    context.clearRect(0, 0, scene.width * 16, scene.height * 16);
    const entities = game.visibleEntities;
    const playerSprite = game.status.appearance === 'king' ? characters.kings[game.direction] : characters.players[game.direction];
    drawCompiledScene(context, { ...scene, entities, spawn: game.position }, { king: characters.king, player: playerSprite }, { openedChests: game.openedChests });
    previousLoot = Math.floor(time / 160) % 8;
    for (const entity of entities) if (entity.kind === 'loot') {
      drawSprite(context, lootSparkleFrames[(previousLoot + entity.parameters[0]) % 8], entity.x, entity.y);
    }
    const encounter = game.encounter;
    if (encounter !== seenEncounter) {
      clearTransition();
      seenEncounter = encounter;
      if (encounter) {
        transition = { elapsed: 0, previousTime: performance.now(), reduced: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false };
        clearInput();
        encounterEffect.hidden = false;
        consoleElement.setAttribute('aria-busy', 'true');
        drawTransition();
      }
    }
    const message = encounter ? null : game.message;
    if (message || encounter || game.shop) inventory.open = false;
    if (encounter) clearInput();
    const battleReady = Boolean(encounter && (!transition || transition.elapsed >= (transition.reduced ? 160 : 440)));
    const screen = root.querySelector<HTMLElement>('[data-play-screen]')!;
    const controls = root.querySelector<HTMLElement>('[data-play-controls]')!;
    screen.hidden = battleReady; controls.hidden = battleReady;
    screen.inert = Boolean(encounter || game.shop || inventory.open); controls.inert = Boolean(encounter || game.shop);
    battleElement.inert = Boolean(transition);
    battle.sync(battleReady ? encounter : null, game.inventory, game.battle ?? undefined);
    root.querySelector<HTMLElement>('[data-play-message]')!.hidden = !message;
    function setText(selector: string, text: string): void {
      const element = root.querySelector<HTMLElement>(selector)!;
      if (element.textContent !== text) element.textContent = text;
    }
    setText('[data-play-speaker]', message?.speaker ?? '');
    setText('[data-play-stage]', stageName(scene.id));
    root.querySelector<HTMLElement>('[data-play-clear]')!.hidden = !game.cleared;
    const status = game.status;
    setText('[data-play-status]', `Lv ${status.level}　${status.gold}G${status.poisoned ? '　毒' : ''}`);
    setText('[data-field-hp]', `HP ${status.hp} / ${status.maxHp}`);
    setText('[data-field-mp]', `MP ${status.mp} / ${status.maxMp}`);
    updateResourceBar(root.querySelector<HTMLProgressElement>('[data-field-hp-bar]')!, status.hp, status.maxHp, `${status.name}のHP`);
    updateResourceBar(root.querySelector<HTMLProgressElement>('[data-field-mp-bar]')!, status.mp, status.maxMp, `${status.name}のMP`);
    setText('[data-play-text]', message?.text ?? '');
    setText('[data-play-advance]', message?.battleEntityIndex === undefined ? 'つづける' : '戦う');
    root.querySelector<HTMLElement>('[data-play-cancel-battle]')!.hidden = message?.battleEntityIndex === undefined;
    setText('[data-play-items]', game.inventory.map(({ itemId, count }) => `${findItem(itemId)!.name} ×${count}`).join('\n') || 'なし');
    menus.sync();
  }
  function follow(): void {
    if (!game) return;
    viewport.scrollLeft = Math.max(0, (game.position.x + 8) * displayScale - viewport.clientWidth / 2);
    viewport.scrollTop = Math.max(0, (game.position.y + 16) * displayScale - viewport.clientHeight / 2);
  }
  function resize(): void {
    if (!game) return;
    clearInput();
    const scene = game.scene;
    canvas.width = scene.width * 16 * 4; canvas.height = scene.height * 16 * 4;
    // 小さなマップは整数倍率で画面幅に収め、大きな街はカメラで追う。
    displayScale = scene.width <= 8 ? Math.max(1, Math.min(4, Math.floor(viewport.clientWidth / (scene.width * 16)))) : 2;
    canvas.style.width = `${scene.width * 16 * displayScale}px`;
    canvas.style.height = `${scene.height * 16 * displayScale}px`;
    draw(); follow();
  }
  function move(direction: Direction, time: number): void {
    if (!active()) return;
    if (game!.encounter || game!.message || game!.shop || inventory.open) { clearInput(); return; }
    const revision = game!.revision;
    game!.move(direction);
    if (game!.revision !== revision) { clearInput(); resize(); }
    if (game!.message) clearInput();
    nextStep = time + 140;
    draw(time);
    follow();
  }
  function interact(): void {
    if (!active()) return;
    if (game!.encounter || game!.shop) return;
    if (inventory.open) { closeItems(); return; }
    const revision = game!.revision;
    clearInput(); game!.interact();
    if (game!.revision !== revision) resize();
    draw(performance.now()); follow();
    if (!game!.encounter) canvas.focus({ preventScroll: true });
  }
  function closeItems(): void {
    inventory.open = false; clearInput(); draw(performance.now()); canvas.focus({ preventScroll: true });
  }
  function tick(time: number): void {
    if (!active()) pauseInput();
    else if (transition) { advanceTransition(time); draw(time); if (!transition) battle.focus(); }
    else {
      const direction = [...held.values()].at(-1);
      if (direction && time >= nextStep) move(direction, time);
      else if (!game!.battle && !game!.shop && !inventory.open && game!.visibleEntities.some(entity => entity.kind === 'loot') && Math.floor(time / 160) % 8 !== previousLoot) draw(time);
    }
    request = window.requestAnimationFrame(tick);
  }
  function keydown(event: KeyboardEvent): void {
    if (!active() || event.ctrlKey || event.metaKey || event.altKey) return;
    if (transition) { event.preventDefault(); clearInput(); return; }
    // ボタン・どうぐの開閉はブラウザのEnter/Space操作を使う。
    if (['BUTTON', 'SUMMARY'].includes((event.target as HTMLElement).tagName) && ['Enter', ' '].includes(event.key)) {
      if ((game!.encounter || game!.shop || inventory.open) && event.repeat) event.preventDefault();
      return;
    }
    if (game!.encounter) { clearInput(); battle.keydown(event); return; }
    if (event.key === 'Escape' && game!.cancelBattleDialogue()) {
      event.preventDefault(); clearInput(); draw(); canvas.focus({ preventScroll: true }); return;
    }
    if (event.key === 'Escape' && inventory.open) { event.preventDefault(); closeItems(); return; }
    if (game!.shop || inventory.open) { clearInput(); menus.keydown(event); return; }
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (['e', 'Enter', ' '].includes(key)) {
      event.preventDefault();
      if (!event.repeat) interact();
      return;
    }
    const direction = directions[key];
    if (!direction) return;
    event.preventDefault();
    if (event.repeat) return;
    if (!held.has(key)) {
      held.set(key, direction);
      move(direction, performance.now());
    }
  }
  function keyup(event: KeyboardEvent): void {
    held.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key);
  }
  function focusout(event: FocusEvent): void {
    if (!root.contains(event.relatedTarget as Node | null)) clearInput();
  }
  root.addEventListener('keydown', keydown);
  root.addEventListener('focusout', focusout);
  window.addEventListener('keyup', keyup);
  window.addEventListener('blur', pauseInput);
  window.addEventListener('hashchange', pauseInput);
  window.addEventListener('resize', resize);
  canvas.addEventListener('blur', clearInput);
  document.addEventListener('visibilitychange', pauseInput);
  root.querySelectorAll<HTMLButtonElement>('[data-direction]').forEach(button => {
    button.addEventListener('pointerdown', event => {
      if (!active() || event.button !== 0) return;
      event.preventDefault();
      clearInput();
      canvas.focus({ preventScroll: true });
      button.setPointerCapture(event.pointerId);
      const direction = button.dataset.direction as Direction;
      held.set('pointer', direction);
      move(direction, performance.now());
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(name, clearInput);
    // キーボード・支援技術からのボタン操作。
    button.addEventListener('click', event => { if (event.detail === 0) move(button.dataset.direction as Direction, performance.now()); });
  });
  root.querySelector('[data-play-reset]')!.addEventListener('click', () => {
    if (!game || !active() || !window.confirm('レベル・お金・所持品・装備・進行をリセットして、最初から始めます。よろしいですか？')) return;
    clearTransition(); seenEncounter = null; menus.reset();
    inventory.open = false; clearInput(); game.reset(); resize(); draw(); follow(); canvas.focus({ preventScroll: true });
  });
  inventory.addEventListener('toggle', () => {
    clearInput();
    if (inventory.open && (game?.message || game?.encounter || game?.shop)) inventory.open = false;
    draw(performance.now());
  });
  root.querySelector('[data-play-interact]')!.addEventListener('click', interact);
  root.querySelector('[data-play-advance]')!.addEventListener('click', interact);
  root.querySelector('[data-play-cancel-battle]')!.addEventListener('click', () => {
    if (active() && game?.cancelBattleDialogue()) { clearInput(); draw(); canvas.focus({ preventScroll: true }); }
  });
  function stop(): void {
    if (request !== undefined) window.cancelAnimationFrame(request);
    request = undefined; game = undefined; inventory.open = false; clearInput();
    clearTransition(); seenEncounter = null; menus.reset();
    battle.sync(null, []);
    root.querySelector<HTMLElement>('[data-play-clear]')!.hidden = true;
    root.querySelector<HTMLElement>('[data-play-screen]')!.hidden = false;
    root.querySelector<HTMLElement>('[data-play-controls]')!.hidden = false;
    root.querySelector<HTMLElement>('[data-play-screen]')!.inert = false;
    root.querySelector<HTMLElement>('[data-play-controls]')!.inert = false;
  }
  return {
    start(scene: SceneData, focus = true, world: readonly SceneData[] = [scene], options: WorldGameOptions = {}): void {
      const nextGame = createWorldGame(world.map(candidate => candidate.id === scene.id ? scene : candidate), scene.id, undefined, options);
      stop(); game = nextGame;
      resize(); draw();
      if (focus) canvas.focus({ preventScroll: true });
      request = window.requestAnimationFrame(tick);
    },
    stop,
    dispose(): void {
      stop(); battle.dispose();
      root.removeEventListener('keydown', keydown);
      root.removeEventListener('focusout', focusout);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', pauseInput);
      window.removeEventListener('hashchange', pauseInput);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', pauseInput);
    },
  };
}
