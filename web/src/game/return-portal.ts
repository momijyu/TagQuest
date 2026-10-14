import type { SceneData } from '../codec/scenes';
import type { Direction } from './walking';
import { canStand } from './walking';
import { inferLocationName } from './location-names';

export const returnPortalKey = 'tagquest.return-portal';
export interface ReturnPortal { stageId: number; x: number; y: number; direction: Direction }
export function validReturnPortal(value: unknown, stages: readonly SceneData[]): value is ReturnPortal {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const point = value as ReturnPortal, scene = stages.find(scene => scene.id === point.stageId);
  return Boolean(scene && Number.isInteger(point.stageId) && Number.isSafeInteger(point.x) && Number.isSafeInteger(point.y)
    && point.x % 16 === 0 && point.y % 16 === 0
    && ['front','back','left','right'].includes(point.direction) && canStand(scene!, point));
}
export function isDungeon(scene: SceneData): boolean {
  if (scene.entities.some(entity => entity.kind.startsWith('world-'))) return false;
  const name = inferLocationName(scene);
  return ['森','洞窟','神殿','遺跡','砦','巣','洞穴','魔王城','霊峰','湿原','古戦場','回廊','水路','地下蔵'].some(word => name.includes(word));
}
export function isTown(scene: SceneData): boolean {
  return ['weapon-shop','armor-shop','item-shop','tavern','casino-building'].some(kind => scene.entities.some(entity => entity.kind === kind));
}
