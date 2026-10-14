import type { SceneData } from '../codec/scenes';
import { mountPlayView } from './play-view';
import type { PlayCharacters } from './play-view';
import { createAdventurePreset } from '../editor/adventure-presets';
import type { AdventureSize } from '../editor/adventure-presets';
import { encodeWorld, stageLabel } from '../editor/model';
import { decodeScenes } from '../codec/scenes';
import { gameUrl, defaultPublicBase } from '../codec/nfc-url';
import { exitArrival } from '../data/stage-exits';

export function startGalleryPlay(
  root: HTMLElement,
  scenes: { readonly castle: SceneData; readonly town: SceneData; readonly world?: SceneData; readonly forest?: SceneData; readonly cave?: SceneData; readonly demonCastle?: SceneData },
  characters: PlayCharacters,
  isActive: () => boolean,
): () => void {
  const view = root.querySelector<HTMLElement>('#gallery-play-view')!;
  const map = root.querySelector<HTMLSelectElement>('#gallery-play-map')!;
  const toggle = root.querySelector<HTMLButtonElement>('#gallery-play-toggle')!;
  const errorBox = root.querySelector<HTMLElement>('#gallery-play-error')!;
  const normal = { castle: scenes.castle, town: scenes.town, ...(scenes.world ? { world: scenes.world } : {}), ...(scenes.forest ? { forest: scenes.forest } : {}), ...(scenes.cave ? { cave: scenes.cave } : {}), ...(scenes.demonCastle ? { 'demon-castle': scenes.demonCastle } : {}) };
  let available: Record<string, SceneData> = normal;
  let names: Record<string, string> = { castle: '城', town: '街', world: '全体マップ', forest: '森', cave: '洞窟', 'demon-castle': '魔王城' };
  const size = root.querySelector<HTMLSelectElement>('#gallery-play-size');
  const urlLink = root.querySelector<HTMLAnchorElement>('#gallery-play-url');
  let running = false;
  const playView = mountPlayView(view, characters, () => running && isActive(), id => names[Object.entries(available).find(([, scene]) => scene.id === id)?.[0] ?? 'castle']);
  function stop(): void {
    running = false; playView.stop(); view.hidden = true; toggle.textContent = '▶ プレイ';
  }
  function togglePlay(): void {
    if (running) { stop(); return; }
    try {
      errorBox.hidden = true;
      const scene = available[map.value] ?? Object.values(available)[0];
      const entry = Object.values(available).flatMap(scene => scene.exits ?? []).find(exit => exit.targetStageId === scene.id);
      // 開始位置がないマップも、設定済みの入口から試遊する。
      const sample = { ...scene, spawn: scene.spawn ?? (entry ? exitArrival(entry) : { x: 96, y: 464 }) };
      view.hidden = false; running = true;
      playView.start(sample, true, Object.values(available));
      toggle.textContent = '停止';
    } catch (error) {
      stop();
      errorBox.textContent = error instanceof Error ? error.message : 'プレイを開始できませんでした。';
      errorBox.hidden = false;
    }
  }
  function changeSize(): void {
    stop(); errorBox.hidden = true;
    try {
      const value = (size?.value || 'normal') as AdventureSize, world = createAdventurePreset(value);
      const encoded = encodeWorld(world, true);
      const normalKeys = ['castle', 'town', 'world', 'forest', 'cave', 'demon-castle'];
      const previous = map.value;
      const decoded = Object.fromEntries(decodeScenes(encoded.bytes).map(scene => [normalKeys[scene.id] ?? `stage-${scene.id}`, scene]));
      available = value === 'normal' ? { ...decoded, ...normal } : decoded;
      names = Object.fromEntries(world.stages.map(stage => [normalKeys[stage.id] ?? `stage-${stage.id}`, stageLabel(stage)]));
      map.innerHTML = Object.entries(available).map(([key]) => `<option value="${key}"></option>`).join('');
      for (const option of map.querySelectorAll('option')) option.textContent = names[(option as HTMLOptionElement).value] ?? '';
      map.value = previous in available ? previous : Object.keys(available)[0];
      if (urlLink) urlLink.href = gameUrl(encoded.bytes, defaultPublicBase(window.location));
    } catch (error) {
      errorBox.textContent = error instanceof Error ? error.message : '世界を読み込めませんでした。'; errorBox.hidden = false;
    }
  }
  toggle.addEventListener('click', togglePlay);
  map.addEventListener('change', stop);
  size?.addEventListener('change', changeSize);
  if (size) changeSize();
  return () => {
    playView.dispose();
    toggle.removeEventListener('click', togglePlay);
    map.removeEventListener('change', stop);
    size?.removeEventListener('change', changeSize);
  };
}
