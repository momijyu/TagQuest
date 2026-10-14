import { createAdventurePreset } from '../editor/adventure-presets';
import { encodeWorld } from '../editor/model';
import { decodeScenes } from '../codec/scenes';

// プレイには実際に書き出したバイナリを読み戻して渡す。
const scenes = decodeScenes(encodeWorld(createAdventurePreset('normal')).bytes);
export const adventureScenes = {
  castle: scenes.find(scene => scene.id === 0)!,
  town: scenes.find(scene => scene.id === 1)!,
  world: scenes.find(scene => scene.id === 2)!,
  forest: scenes.find(scene => scene.id === 3)!,
  cave: scenes.find(scene => scene.id === 4)!,
  demonCastle: scenes.find(scene => scene.id === 5)!,
} as const;
