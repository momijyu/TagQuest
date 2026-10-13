import { forestCaveNpcs } from '../data/characters/forest-cave-npcs';
import { demonLord } from '../data/characters/demon-lord';
import { treasureChest, openTreasureChest } from '../data/objects/treasure-chest';
import { explorationObjects } from '../data/objects/exploration';
import { explorationTiles } from '../data/tiles/exploration';

export const adventureMaterials = {
  'treasure-chest': { name: '宝箱', sprite: treasureChest },
  'treasure-chest-open': { name: '開いた宝箱', sprite: openTreasureChest },
  ...forestCaveNpcs,
  'demon-lord': { name: '魔王', sprite: demonLord },
  ...explorationObjects,
  ...Object.fromEntries(Object.entries(explorationTiles).map(([id, { size, ...tile }]) => [id, {
    name: id === 'meadow-flowers' ? '花の草地' : '遺跡の石畳', sprite: { ...tile, width: size, height: size },
  }])),
} as const;
