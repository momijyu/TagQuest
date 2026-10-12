import worldSource from '../../../compiler/maps/world.json';
import demonCastleSource from '../../../compiler/maps/demon-castle.json';
import caveSource from '../../../compiler/maps/cave.json';
import forestSource from '../../../compiler/maps/forest.json';
import connections from '../../../compiler/maps/adventure-connections.json';
import content from '../../../compiler/maps/adventure-content.json';
import castleSource from '../../../compiler/maps/adventure-castle.json';
import townSource from '../../../compiler/maps/adventure-town.json';
import { parseWorld, clone } from './model';
import type { World, Entity } from './model';

/** NFC小型版と別の、探索用の城・広場型の街を持つ接続済みワールド。 */
export function createAdventureWorld(): World {
  const stages = parseWorld([castleSource, townSource, worldSource, forestSource, caveSource, demonCastleSource]).stages;
  // 森と洞窟は最終行の出口だけを外形から1マス突き出す。
  for (const stage of stages.filter(stage => stage.id === 3 || stage.id === 4)) {
    stage.floor = { default: 'empty', rectangles: [
      { tile: stage.floor.default, x: 0, y: 0, width: stage.width, height: stage.height - 1 },
      ...stage.floor.rectangles,
    ] };
  }
  // 魔王城も最終行の両脇を空白にし、紫の出口を独立させる。
  const demonCastle = stages.find(stage => stage.id === 5)!;
  demonCastle.floor.rectangles = demonCastle.floor.rectangles.filter(rect => rect.y !== demonCastle.height - 1 || rect.tile === 'demon-carpet');
  for (const { stageId, exit } of connections) {
    const stage = stages.find(stage => stage.id === stageId);
    if (!stage) throw new Error('接続元のマップが見つかりません。');
    stage.exits.push(clone(exit) as typeof stage.exits[number]);
  }
  for (const additions of content) {
    const stage = stages.find(stage => stage.id === additions.stageId);
    if (!stage) throw new Error('冒険の配置先マップが見つかりません。');
    for (const update of additions.updates) {
      const entity = stage.entities.find(entity => entity.kind === update.kind);
      if (!entity) throw new Error('冒険の会話設定先が見つかりません。');
      Object.assign(entity, clone(update));
    }
    stage.entities.push(...clone(additions.entities) as Entity[]);
  }
  return parseWorld(stages);
}

/** 編集中のワールドへ6マップを追加。IDと出口の参照をまとめて割り当て直す。 */
export function appendAdventureSample(world: World): number {
  const sample = createAdventureWorld();
  if (world.stages.length + sample.stages.length > 255) throw new Error('マップは255個までです。');
  const available = Array.from({ length: 256 }, (_, id) => id).filter(id => !world.stages.some(stage => stage.id === id));
  const ids = new Map(sample.stages.map((stage, index) => [stage.id, available[index]]));
  const entryId = ids.get(2)!;
  for (const stage of sample.stages) {
    stage.id = ids.get(stage.id)!;
    for (const exit of stage.exits) exit.targetStageId = ids.get(exit.targetStageId)!;
  }
  world.stages.push(...sample.stages);
  return entryId;
}
