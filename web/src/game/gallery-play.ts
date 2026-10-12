import type { SceneData } from '../codec/scenes';
import { mountPlayView } from './play-view';
import type { PlayCharacters } from './play-view';

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
  const available = { castle: scenes.castle, town: scenes.town, ...(scenes.world ? { world: scenes.world } : {}), ...(scenes.forest ? { forest: scenes.forest } : {}), ...(scenes.cave ? { cave: scenes.cave } : {}), ...(scenes.demonCastle ? { 'demon-castle': scenes.demonCastle } : {}) };
  const names: Record<string, string> = { castle: '城', town: '街', world: '全体マップ', forest: '森', cave: '洞窟', 'demon-castle': '魔王城' };
  let running = false;
  const playView = mountPlayView(view, characters, () => running && isActive(), id => names[Object.entries(available).find(([, scene]) => scene.id === id)?.[0] ?? 'castle']);
  function stop(): void {
    running = false; playView.stop(); view.hidden = true; toggle.textContent = '▶ プレイ';
  }
  function togglePlay(): void {
    if (running) { stop(); return; }
    try {
      errorBox.hidden = true;
      const scene = available[map.value as keyof typeof available] ?? scenes.castle;
      // 紹介用の街だけ仮の開始位置を使う。元のマップ・NFCデータは変更しない。
      const sample = { ...scene, spawn: scene.spawn ?? { x: 96, y: 464 } };
      view.hidden = false; running = true;
      playView.start(sample, true, Object.values(available));
      toggle.textContent = '停止';
    } catch (error) {
      stop();
      errorBox.textContent = error instanceof Error ? error.message : 'プレイを開始できませんでした。';
      errorBox.hidden = false;
    }
  }
  toggle.addEventListener('click', togglePlay);
  map.addEventListener('change', stop);
  return () => {
    playView.dispose();
    toggle.removeEventListener('click', togglePlay);
    map.removeEventListener('change', stop);
  };
}
