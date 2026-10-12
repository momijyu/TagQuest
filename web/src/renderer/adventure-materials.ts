import { forestCaveNpcs } from '../data/characters/forest-cave-npcs';
import { demonLord } from '../data/characters/demon-lord';
import { treasureChest, openTreasureChest } from '../data/objects/treasure-chest';

export const adventureMaterials = {
  'treasure-chest': { name: '宝箱', sprite: treasureChest },
  'treasure-chest-open': { name: '開いた宝箱', sprite: openTreasureChest },
  ...forestCaveNpcs,
  'demon-lord': { name: '魔王', sprite: demonLord },
} as const;
