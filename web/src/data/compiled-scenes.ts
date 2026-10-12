import sceneUrl from './generated/scenes.bin?url';
import { decodeScenes } from '../codec/scenes';

export async function loadCompiledScenes() {
  const response = await fetch(sceneUrl);
  if (!response.ok) throw new Error('Compiled scene data could not be loaded');
  const scenes = decodeScenes(new Uint8Array(await response.arrayBuffer()));
  const castle = scenes.find(scene => scene.id === 0);
  const town = scenes.find(scene => scene.id === 1);
  if (!castle || !town) throw new Error('Castle and town previews are required');
  return { castle, town } as const;
}
