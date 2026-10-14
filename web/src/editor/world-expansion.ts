import source from '../../../compiler/maps/danger-regions.json';
import { clone, parseWorld } from './model';
import type { World, Entity } from './model';

/** 固定配置の拡張。小型見本には呼ばず、元の入力を変更しない。 */
export function expandAdventure(world: World, multiplier = 1): World {
  const result = clone(world);
  const town = result.stages.find(stage => stage.id === 1)!;
  const field = result.stages.find(stage => stage.id === 2)!;
  const allocated: number[] = [];
  const ids = source.stages.map(() => {
    const id = Array.from({ length: 256 }, (_, index) => index)
      .find(index => !result.stages.some(stage => stage.id === index) && !allocated.includes(index));
    if (id === undefined) throw new Error('拡張マップのIDが不足しています。');
    allocated.push(id);
    return id;
  });
  function replaceHouse(x: number, y: number, kind: string): void {
    const house = town.entities.find(entity => entity.x === x * 16 && entity.y === y * 16 && entity.kind.startsWith('house-'));
    if (!house) throw new Error('拡張建物の配置先がありません。');
    house.kind = kind;
  }
  replaceHouse(26, 3, 'inn-building');
  replaceHouse(20, 2, 'tavern');
  replaceHouse(26, 14, 'church');
  const innkeeper = town.entities.find(entity => entity.kind === 'innkeeper')!;
  innkeeper.x = 27 * 16;
  innkeeper.y = 7 * 16;
  town.entities.push(
    { kind: 'guild-master', x: 21 * 16, y: 6 * 16, parameters: [], dialogue: { type: 'template', id: source.templateIds.guild } },
    { kind: 'bounty-board', x: 23 * 16, y: 8 * 16, parameters: [] },
    { kind: 'sister', x: 27 * 16, y: 18 * 16, parameters: [], dialogue: { type: 'template', id: source.templateIds.church } },
  );
  field.encounter = {
    enabled: true, rate: 4 * multiplier, enemyId: 1,
    enemies: [{ enemyId: 1, weight: 70 }, { enemyId: 2, weight: 30 }],
  };
  for (const stage of source.stages) {
    result.stages.push({
      ...clone(stage), id: ids[stage.id], entities: clone(stage.entities) as Entity[],
      exits: stage.exits.map(exit => ({
        ...exit, targetStageId: exit.targetStageId === -1 ? field.id : ids[exit.targetStageId],
        direction: exit.direction as 'front' | 'back',
      })),
    } as World['stages'][number]);
  }
  for (const id of ids) {
    const stage = result.stages.find(stage => stage.id === id)!;
    if (stage.encounter) stage.encounter.rate *= multiplier;
  }
  for (const [index, entry] of source.entryCoordinates.entries()) {
    const warning = source.warningCoordinates[index];
    field.entities.push(
      { kind: index === 0 ? 'world-forest-entrance' : 'world-cave', x: entry.x * 16, y: entry.y * 16, parameters: [] },
      { kind: 'signpost', x: warning.x * 16, y: warning.y * 16, parameters: [], dialogue: { type: 'template', id: source.templateIds.warning[index] } },
    );
    field.exits.push({ ...entry, targetStageId: ids[index * 2], targetX: 9, targetY: 15, direction: 'back' });
  }
  return parseWorld(result);
}
