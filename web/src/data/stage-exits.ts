export const exitDirections = ['front', 'back', 'left', 'right'] as const;
export type ExitDirection = typeof exitDirections[number];
/** 座標は0始まりのマス。到着位置は主人公の足元のマスを指定する。 */
export interface StageExit {
  x: number; y: number; targetStageId: number; targetX: number; targetY: number; direction: ExitDirection;
}
type Stage = { readonly id: number; readonly width: number; readonly height: number; readonly exits?: readonly StageExit[] };
function integer(value: unknown, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > max) throw new Error('出口のマス・移動先IDが範囲外です。');
  return value;
}
export function parseExits(value: unknown, width: number, height: number): StageExit[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 255) throw new Error('出口は1マップ255個までです。');
  const seen = new Set<string>();
  return value.map(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('出口の形式が違います。');
    const x = integer(raw.x, width - 1), y = integer(raw.y, height - 1);
    if (seen.has(`${x},${y}`)) throw new Error('同じマスに出口を重ねられません。');
    seen.add(`${x},${y}`);
    if (!exitDirections.includes(raw.direction)) throw new Error('到着時の向きが不明です。');
    return { x, y, targetStageId: integer(raw.targetStageId, 255), targetX: integer(raw.targetX, 31),
      targetY: integer(raw.targetY, 31), direction: raw.direction };
  });
}
export function validateExitTargets(stages: readonly Stage[]): void {
  for (const stage of stages) for (const exit of stage.exits ?? []) {
    const target = stages.find(candidate => candidate.id === exit.targetStageId);
    if (!target) throw new Error('出口の移動先マップがありません。ワールドJSONで読み込んでください。');
    if (exit.targetX >= target.width || exit.targetY >= target.height) throw new Error('出口の到着位置を移動先マップ内に収めてください。');
  }
}
export function exitArrival(exit: StageExit) { return { x: exit.targetX * 16, y: exit.targetY * 16 - 16 }; }
export function encodeExits(exits: readonly StageExit[]): number[] {
  return [exits.length, ...exits.flatMap(exit => [exit.x, exit.y, exit.targetStageId, exit.targetX, exit.targetY, exitDirections.indexOf(exit.direction)])];
}

/** v13: destination is an index in the world, never a replacement for the public map ID. */
export const exitTargetBits = (stageCount: number): number => Math.ceil(Math.log2(stageCount));
export function encodePackedExits(exits: readonly StageExit[], stageIds: readonly number[]): number[] {
  const result = [exits.length], targetBits = exitTargetBits(stageIds.length);
  let current = 0, used = 0;
  const write = (value: number, bits: number) => {
    for (let bit = bits - 1; bit >= 0; bit--) {
      current = current << 1 | (value >> bit & 1);
      if (++used === 8) { result.push(current); current = 0; used = 0; }
    }
  };
  for (const exit of exits) {
    const target = stageIds.indexOf(exit.targetStageId);
    if (target < 0) throw new Error('出口の移動先マップがありません。');
    write(exit.x, 5); write(exit.y, 5); write(target, targetBits);
    write(exit.targetX, 5); write(exit.targetY, 5); write(exitDirections.indexOf(exit.direction), 2);
  }
  if (used) result.push(current << (8 - used));
  return result;
}
/** The decoder resolves target indexes to map IDs after reading every map header. */
export function decodePackedExits(payload: Uint8Array, count: number, stageCount: number): StageExit[] {
  let offset = 0;
  const read = (bits: number) => {
    let value = 0;
    for (let i = 0; i < bits; i++, offset++) value = value << 1 | (payload[offset >> 3] >> (7 - (offset & 7)) & 1);
    return value;
  };
  const targetBits = exitTargetBits(stageCount), exits: StageExit[] = [];
  if (payload.length !== Math.ceil(count * (22 + targetBits) / 8)) throw new Error('Invalid packed exit length');
  for (let i = 0; i < count; i++) {
    const x = read(5), y = read(5), targetStageId = read(targetBits), targetX = read(5), targetY = read(5);
    if (targetStageId >= stageCount) throw new Error('Invalid packed exit target');
    exits.push({ x, y, targetStageId, targetX, targetY, direction: exitDirections[read(2)] });
  }
  while (offset < payload.length * 8) if (read(1)) throw new Error('Invalid packed exit padding');
  return exits;
}
