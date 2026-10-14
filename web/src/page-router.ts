import { isGameHash, readGameHash } from './codec/nfc-url';
import type { SceneData } from './codec/scenes';

type Stop = () => void;
export interface PageServices {
  loadGallery(): Promise<(isActive: () => boolean) => Promise<Stop>>;
  loadEditor(): Promise<(root: HTMLElement) => Stop>;
  loadGame(): Promise<(root: HTMLElement, first: SceneData, scenes: readonly SceneData[], isActive: () => boolean) => Stop | Promise<Stop>>;
}

/** Delay each page's assets and initialization until that page is actually requested. */
export function startPageRouter(pages: { gallery: HTMLElement; editor: HTMLElement; game: HTMLElement; status: HTMLElement }, services: PageServices) {
  let revision = 0, disposed = false;
  let stopGame: Stop | undefined, stopEditor: Stop | undefined, stopGallery: Stop | undefined;
  let galleryTask: Promise<void> | undefined;
  async function route(): Promise<void> {
    if (disposed) return;
    const turn = ++revision, hash = window.location.hash;
    const mode = isGameHash(hash) ? 'game' : hash === '#editor' ? 'editor' : 'gallery';
    const current = () => !disposed && revision === turn;
    stopGame?.(); stopGame = undefined;
    pages.gallery.hidden = mode !== 'gallery'; pages.editor.hidden = mode !== 'editor'; pages.game.hidden = mode !== 'game';
    document.body.dataset.page = mode;
    pages.status.hidden = true;
    try {
      if (mode === 'game') {
        pages.game.replaceChildren();
        const scenes = readGameHash(hash), first = scenes.find(scene => scene.spawn);
        if (!first) throw new Error('開始位置が設定されていません。');
        const screen = document.createElement('div'); screen.className = 'play-session'; pages.game.append(screen);
        pages.status.textContent = '読み込み中…'; pages.status.hidden = false;
        const start = await services.loadGame();
        if (!current()) return;
        const stop = await start(screen, first, scenes, () => current() && !pages.game.hidden);
        if (!current()) { stop(); return; }
        stopGame = stop;
      } else if (mode === 'editor' && !stopEditor) {
        pages.status.textContent = '読み込み中…'; pages.status.hidden = false;
        const start = await services.loadEditor();
        if (!current() || stopEditor) return;
        stopEditor = start(pages.editor);
      } else if (mode === 'gallery' && !stopGallery) {
        pages.status.textContent = '読み込み中…'; pages.status.hidden = false;
        if (!galleryTask) galleryTask = (async () => {
          const start = await services.loadGallery();
          if (!current()) return;
          const stop = await start(() => !disposed && !pages.gallery.hidden);
          if (disposed) stop(); else stopGallery = stop;
        })().finally(() => { galleryTask = undefined; });
        await galleryTask;
        if (current() && !stopGallery) { await route(); return; }
      }
      if (current()) pages.status.hidden = true;
    } catch (value) {
      if (!current()) return;
      pages.status.textContent = `${mode === 'game' ? 'ゲーム' : mode === 'editor' ? 'エディタ' : '紹介画面'}を開けませんでした：${value instanceof Error ? value.message : String(value)}`;
      pages.status.hidden = false;
      if (mode === 'game') {
        const back = document.createElement('a'); back.href = '#'; back.className = 'btn btn-sm'; back.textContent = '紹介へ戻る'; pages.game.append(back);
      }
    }
  }
  const onHashChange = () => { void route(); };
  window.addEventListener('hashchange', onHashChange);
  void route();
  return {
    route,
    dispose(): void {
      disposed = true; revision++; stopGame?.(); stopEditor?.(); stopGallery?.();
      window.removeEventListener('hashchange', onHashChange);
    },
  };
}
