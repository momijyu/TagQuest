import overhangs from './building-overhangs.json';

export function isBuilding(kind: string): boolean { return kind in overhangs; }
export function buildingOverhang(kind: string): number { return overhangs[kind as keyof typeof overhangs] ?? 0; }

/** Save the narrow placement frame; keep the original artwork centered over it. */
export function buildingDrawingPosition(entity: { readonly kind: string; readonly x: number; readonly y: number }) {
  return { x: entity.x - buildingOverhang(entity.kind), y: entity.y };
}
export function legacyBuildingPosition(entity: { readonly kind: string; readonly x: number; readonly y: number }) {
  return { x: entity.x + buildingOverhang(entity.kind), y: entity.y };
}
