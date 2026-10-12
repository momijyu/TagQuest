import { encodeWorld, toSceneData, stageLabel } from './model';
import type { World } from './model';
import { canStand, interactionTarget } from '../game/walking';
import type { Position, Direction } from '../game/walking';
import { isNpc } from '../data/npc-placement';
import { exitArrival } from '../data/stage-exits';
export interface MapIssue { stageId: number; x: number; y: number; text: string }
export function validateWorld(world: World): MapIssue[] {
  const issues: MapIssue[] = [];
  const add = (stageId: number, x: number, y: number, text: string) => issues.push({ stageId, x, y, text });
  try { encodeWorld(world); } catch (e) { add(world.stages[0].id, 0, 0, String(e)); }
  const scenes = new Map(world.stages.map(stage => [stage.id, toSceneData(stage)]));
  const reachable = new Map<number, Map<string, Position>>();
  const interactable = new Map<number, Map<string, Position>>();
  const states = new Set<string>();
  const queue: { stageId: number; position: Position; ignored: boolean }[] = [];
  function enqueue(stageId: number, position: Position, ignored = false): void {
    const scene = scenes.get(stageId);
    if (!scene || !canStand(scene, position)) return;
    const visited = reachable.get(stageId) ?? new Map<string, Position>();
    const key = `${position.x},${position.y}`;
    const stateKey = `${stageId}:${key}:${ignored}`;
    if (states.has(stateKey)) return;
    states.add(stateKey);
    visited.set(key, position); reachable.set(stageId, visited); queue.push({ stageId, position, ignored });
  }
  // NFC起動と同じく、最初に開始位置があるマップだけを出発点にする。
  const first = world.stages.find(stage => stage.spawn);
  if (first?.spawn) enqueue(first.id, first.spawn, true);
  else add(world.stages[0].id, 0, 0, 'ワールドに開始位置がありません');
  for (let i = 0; i < queue.length; i++) {
    const { stageId, position: p, ignored } = queue[i], scene = scenes.get(stageId)!;
    const exit = scene.exits?.find(exit => exit.x === Math.floor((p.x + 8) / 16) && exit.y === Math.floor((p.y + 24) / 16));
    if (exit && !ignored) { enqueue(exit.targetStageId, exitArrival(exit), true); continue; }
    const stands = interactable.get(stageId) ?? new Map<string, Position>();
    stands.set(`${p.x},${p.y}`, p); interactable.set(stageId, stands);
    // 到着直後の出口でも、マップ外へ向かう操作で移動できる。内側へ歩く選択も残す。
    if (exit && (p.x === 0 || p.y === -16 || p.x + 16 === scene.width * 16 || p.y + 32 === scene.height * 16)) enqueue(exit.targetStageId, exitArrival(exit), true);
    for (const [dx, dy] of [[16, 0], [-16, 0], [0, 16], [0, -16]]) {
      if (Array.from({ length: 16 }, (_, n) => ({ x: p.x + dx / 16 * (n + 1), y: p.y + dy / 16 * (n + 1) })).every(step => canStand(scene, step))) enqueue(stageId, { x: p.x + dx, y: p.y + dy });
    }
  }
  for (const stage of world.stages) {
    const scene = toSceneData(stage), label = stageLabel(stage);
    if (!stage.spawn) add(stage.id, 0, 0, `${label}：開始位置なし（敗北時は最初のマップへ帰還）`);
    else if (!canStand(scene, stage.spawn)) add(stage.id, stage.spawn.x, stage.spawn.y, `${label}：開始位置の足元が通れません`);
    const positions = [...reachable.get(stage.id)?.values() ?? []];
    const seen = new Set(positions.map(p => `${Math.floor((p.x + 8) / 16)},${Math.floor((p.y + 24) / 16)}`));
    if (first && !positions.length && stage.id !== first.id) add(stage.id, 0, 0, `${label}：ワールドの開始位置から到達できません`);
    for (const exit of stage.exits) {
      const position = { x: exit.x * 16, y: exit.y * 16 - 16 };
      if (!canStand(scene, position)) add(stage.id, position.x, position.y, `${label}：出口が通れません`);
      else if (first && !seen.has(`${exit.x},${exit.y}`)) add(stage.id, position.x, position.y, `${label}：出口へ到達できません`);
      const target = world.stages.find(s => s.id === exit.targetStageId);
      if (target && !canStand(toSceneData(target), exitArrival(exit))) add(target.id, exit.targetX * 16, exit.targetY * 16, '出口の到着先が通れません');
    }
    const targets = new Set<number>();
    for (const position of interactable.get(stage.id)?.values() ?? []) for (const direction of ['front', 'back', 'left', 'right'] as Direction[]) {
      const target = interactionTarget(scene, position, direction);
      if (target !== undefined) targets.add(target);
    }
    for (const [index, e] of stage.entities.entries()) {
      const missing = isNpc(e.kind) && !e.dialogue && !e.battleEvent && !e.kind.endsWith('-merchant');
      if (missing) add(stage.id, e.x, e.y, `${label}：${e.kind}の会話が未設定です`);
      if (first && positions.length && (isNpc(e.kind) || e.kind === 'treasure-chest') && !missing && !targets.has(index)) add(stage.id, e.x, e.y, `${label}：${e.kind}を調べられる位置に到達できません`);
    }
  }
  return issues;
}
