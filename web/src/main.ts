import './style.css';
import { startPageRouter } from './page-router';

async function createCharacters() {
  const [{ loadPlayerSprites }, { loadKingSprites }] = await Promise.all([import('./data/characters/player'), import('./data/characters/king')]);
  const players = await loadPlayerSprites(), kingSprites = await loadKingSprites(players);
  return { kingSprites, characters: { king: kingSprites.standing, players,
    kings: { front: kingSprites.standingHeroStyle, back: kingSprites.back, left: kingSprites.left, right: kingSprites.right } } };
}
let charactersTask: ReturnType<typeof createCharacters> | undefined;
const loadCharacters = () => charactersTask ??= createCharacters().catch(error => { charactersTask = undefined; throw error; });
const gallery = document.querySelector<HTMLElement>('#gallery-page'), editor = document.querySelector<HTMLElement>('#editor-page');
if (!gallery || !editor) throw new Error('起動に必要な画面要素が見つかりません。');
const game = document.createElement('section'); game.className = 'nfc-game-page'; game.hidden = true; editor.after(game);
const status = document.createElement('p'); status.className = 'route-status alert'; status.setAttribute('role', 'alert'); status.hidden = true; gallery.before(status);
const router = startPageRouter({ gallery, editor, game, status }, {
  async loadGallery() {
    const [{ startGallery }, { characters, kingSprites }] = await Promise.all([import('./gallery'), loadCharacters()]);
    return active => startGallery(characters, kingSprites, active);
  },
  async loadEditor() {
    const [{ startEditor }, { characters }] = await Promise.all([import('./editor/editor'), loadCharacters()]);
    return root => startEditor(root, { ...characters, player: characters.players.front });
  },
  async loadGame() {
    const [{ mountPlayView }, { characters }] = await Promise.all([import('./game/play-view'), loadCharacters()]);
    return (root, first, scenes, active) => {
      const view = mountPlayView(root, characters, active);
      let storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
      try { storage = window.localStorage; } catch { storage = { getItem: () => null, setItem: () => { throw new Error('保存を利用できません。'); }, removeItem: () => {} }; }
      try { view.start(first, true, scenes, { storage }); } catch (error) { view.dispose(); throw error; }
      return () => view.dispose();
    };
  },
});
import.meta.hot?.dispose(() => { router.dispose(); game.remove(); status.remove(); });
