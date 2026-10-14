import { facilityBuildings, ship, ironGate } from '../data/objects/ultimate-facilities';
import { serviceBuildings, bountyBoard } from '../data/objects/service-buildings';
import { labels } from '../editor/model';
import { forestCaveNpcs } from '../data/characters/forest-cave-npcs';
import { demonLord } from '../data/characters/demon-lord';
import { treasureChest, openTreasureChest } from '../data/objects/treasure-chest';
import { explorationObjects } from '../data/objects/exploration';
import { explorationTiles } from '../data/tiles/exploration';

export const adventureMaterials = {
  ...Object.fromEntries(Object.entries(facilityBuildings).map(([id,sprite])=>[id,{name:labels[id],sprite}])),
  ship:{name:'帆船',sprite:ship}, 'iron-gate':{name:'鉄格子',sprite:ironGate},
  ...Object.fromEntries(Object.entries(serviceBuildings).map(([id,sprite])=>[id,{name:labels[id],sprite}])),
  'bounty-board':{name:'賞金首掲示板',sprite:bountyBoard},
  'treasure-chest': { name: '宝箱', sprite: treasureChest },
  'treasure-chest-open': { name: '開いた宝箱', sprite: openTreasureChest },
  ...forestCaveNpcs,
  'demon-lord': { name: '魔王', sprite: demonLord },
  ...explorationObjects,
  ...Object.fromEntries(Object.entries(explorationTiles).map(([id, { size, ...tile }]) => [id, {
    name: id === 'meadow-flowers' ? '花の草地' : '遺跡の石畳', sprite: { ...tile, width: size, height: size },
  }])),
} as const;
