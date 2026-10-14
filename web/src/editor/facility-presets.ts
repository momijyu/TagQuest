import { clone, parseWorld } from './model';
import type { World, EditableScene, Entity } from './model';

/** 通常・巨大版だけが呼ぶ固定施設街。小型版へは配置も接続も追加しない。 */
export function addFacilityDistrict(world: World): World {
  const result = clone(world), town = result.stages.find(stage => stage.id === 1)!;
  const ids: number[] = [];
  for (let n = 0; n < 4; n++) ids.push(Array.from({ length: 256 }, (_, id) => id).find(id => !result.stages.some(stage => stage.id === id) && !ids.includes(id))!);
  const [districtId, marketId, templeId, houseId] = ids;
  const entity = (kind: string, x: number, y: number): Entity => ({ kind, x: x * 16, y: y * 16, parameters: [] });
  const base = (id: number, name: string, width: number, height: number): EditableScene => ({
    id, name, width, height, spawn: null, spawnAnchor: 'frame', npcAnchor: 'frame', residentAnchor: 'frame', buildingAnchor: 'frame',
    floor: { default: 'empty', rectangles: [] }, entities: [], exits: [],
  });
  const district = base(districtId, '旅人の港と商人街', 28, 26);
  district.floor.rectangles = [
    { tile: 'grass', x: 1, y: 1, width: 22, height: 24 },
    { tile: 'sea', x: 23, y: 0, width: 5, height: 25 },
    { tile: 'brick', x: 13, y: 1, width: 1, height: 25 },
    { tile: 'brick', x: 4, y: 7, width: 16, height: 1 },
    { tile: 'brick', x: 4, y: 14, width: 16, height: 1 },
    { tile: 'brick', x: 4, y: 21, width: 19, height: 1 },
    { tile: 'bridge', x: 23, y: 21, width: 5, height: 1 },
  ];
  district.spawn = { x: 13 * 16, y: 23 * 16 };
  for (const [building, npc, x, y] of [
    ['blacksmith-building', 'blacksmith', 3, 2], ['teleport-shrine', 'shrine-keeper', 17, 2],
    ['casino-building', 'casino-dealer', 3, 9], ['observatory', 'fortune-teller', 17, 9],
    ['monster-corral', 'corral-keeper', 3, 16], ['port-building', 'captain', 17, 16],
  ] as const) district.entities.push(entity(building, x, y), entity(npc, x + 1, y + 4));
  district.entities.push(entity('ship', 24, 16), entity('well-entrance', 9, 20), entity('house-slate', 9, 9),
    { ...entity('signpost', 14, 23), dialogue: { type: 'template', id: 100 } });
  district.exits = [{ x: 13, y: 25, targetStageId: town.id, targetX: 27, targetY: 12, direction: 'left' }];
  town.floor.rectangles.push({ tile: 'brick', x: 27, y: 12, width: 2, height: 1 });
  town.exits.push({ x: 28, y: 12, targetStageId: districtId, targetX: 13, targetY: 24, direction: 'back' });
  town.entities.push({ ...entity('signpost', 26, 11), dialogue: { type: 'template', id: 104 } });

  const market = base(marketId, '地下水路と闇市', 17, 17);
  market.floor = { default: 'cave-wall', rectangles: [
    { tile: 'cave-floor', x: 1, y: 1, width: 15, height: 15 },
    { tile: 'sea', x: 1, y: 7, width: 15, height: 1 },
    { tile: 'bridge', x: 8, y: 7, width: 1, height: 1 },
    { tile: 'cave-wall', x: 1, y: 4, width: 15, height: 1 },
    { tile: 'cave-floor', x: 8, y: 4, width: 1, height: 1 },
    { tile: 'empty', x: 0, y: 16, width: 17, height: 1 },
    { tile: 'cave-floor', x: 8, y: 16, width: 1, height: 1 },
  ] };
  market.spawn = { x: 8 * 16, y: 13 * 16 };
  market.entities = [entity('black-market-dealer', 5, 10), entity('iron-gate', 8, 3),
    { ...entity('treasure-chest', 10, 1), itemId: 68 },
    { ...entity('treasure-chest', 8, 1), itemId: 41 }, { ...entity('signpost', 10, 13), dialogue: { type: 'template', id: 101 } }];
  market.exits = [{ x: 8, y: 16, targetStageId: districtId, targetX: 10, targetY: 23, direction: 'front' }];

  const temple = base(templeId, '沈没神殿', 19, 21);
  temple.floor = { default: 'sea', rectangles: [
    { tile: 'sand', x: 1, y: 2, width: 17, height: 17 },
    { tile: 'ruins-floor', x: 3, y: 3, width: 13, height: 13 },
    { tile: 'wall-top', x: 3, y: 8, width: 13, height: 1 },
    { tile: 'ruins-floor', x: 9, y: 8, width: 1, height: 1 },
    { tile: 'bridge', x: 9, y: 18, width: 1, height: 2 },
    { tile: 'empty', x: 0, y: 20, width: 19, height: 1 },
    { tile: 'bridge', x: 9, y: 20, width: 1, height: 1 },
  ] };
  temple.spawn = { x: 9 * 16, y: 17 * 16 };
  temple.entities = [entity('captain', 12, 17), entity('iron-gate', 9, 7),
    { ...entity('treasure-chest', 14, 6), itemId: 67 },
    { ...entity('treasure-chest', 6, 4), itemId: 37 }, { ...entity('treasure-chest', 12, 4), itemId: 41 },
    { ...entity('signpost', 10, 16), dialogue: { type: 'template', id: 102 } }, entity('cave-crystal', 3, 11)];
  temple.encounter = { enabled: true, rate: 6, enemyId: 7, enemies: [{ enemyId: 7, weight: 60 }, { enemyId: 6, weight: 35 }, { enemyId: 10, weight: 5 }] };
  temple.exits = [{ x: 9, y: 20, targetStageId: districtId, targetX: 18, targetY: 22, direction: 'front' }];
  // A well and a ship are transparent trigger overlays; interaction offers confirmation first.
  district.exits.push(
    { x: 10, y: 23, targetStageId: marketId, targetX: 8, targetY: 14, direction: 'back' },
    { x: 24, y: 21, targetStageId: templeId, targetX: 9, targetY: 18, direction: 'back' },
  );
  const house = base(houseId, '古い民家の地下蔵', 11, 11);
  house.floor = { default: 'wall-top', rectangles: [
    { tile: 'brick', x: 1, y: 1, width: 9, height: 9 },
    { tile: 'empty', x: 0, y: 10, width: 11, height: 1 },
    { tile: 'brick', x: 5, y: 10, width: 1, height: 1 },
  ] };
  house.spawn = { x: 5 * 16, y: 7 * 16 };
  house.entities = [{ ...entity('treasure-chest', 3, 3), itemId: 37 }, { ...entity('treasure-chest', 7, 3), itemId: 41 },
    { ...entity('treasure-chest', 5, 2), itemId: 74 },
    { ...entity('signpost', 6, 7), dialogue: { type: 'template', id: 103 } }];
  house.exits = [{ x: 5, y: 10, targetStageId: districtId, targetX: 10, targetY: 14, direction: 'front' }];
  district.exits.push({ x: 10, y: 14, targetStageId: houseId, targetX: 5, targetY: 8, direction: 'back' });
  result.stages.push(district, market, temple, house);
  return parseWorld(result);
}
