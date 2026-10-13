import largeSource from '../../../compiler/maps/adventure-large.json';
import smallSource from '../../../compiler/maps/adventure-small.json';
import { createAdventureWorld, appendWorldSample } from './adventure';
import { parseWorld } from './model';
import type { World } from './model';

export type AdventureSize = 'normal' | 'large' | 'small';
export const adventurePresets = [
  { id: 'normal', name: '通常の世界', entryStageId: 0 },
  { id: 'large', name: '巨大な世界', entryStageId: 0 },
  { id: 'small', name: 'NFC用の小さな世界', entryStageId: 0 },
] as const;
export function createAdventurePreset(size: AdventureSize): World {
  if (size === 'normal') return createAdventureWorld();
  if (size === 'large') return parseWorld(largeSource);
  if (size === 'small') return parseWorld(smallSource);
  throw new Error('冒険のサイズが不明です。');
}
export function appendAdventurePreset(world: World, size: AdventureSize): number {
  const preset = adventurePresets.find(preset => preset.id === size);
  if (!preset) throw new Error('冒険のサイズが不明です。');
  return appendWorldSample(world, createAdventurePreset(size), preset.entryStageId);
}
