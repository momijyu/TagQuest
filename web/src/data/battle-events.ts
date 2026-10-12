import { isNpc } from './npc-placement';
import { findEnemy } from './encounters/combat-config';
export interface BattleEvent { readonly enemyId: number; readonly once: boolean; readonly clear: boolean }
export function parseBattleEvent(kind: string, value: unknown): BattleEvent | undefined {
  if (value == null) return;
  if (!isNpc(kind) || typeof value !== 'object' || Array.isArray(value)) throw new Error('戦闘イベントはNPCに設定してください。');
  const data = value as Record<string, unknown>;
  if (!Number.isInteger(data.enemyId) || !findEnemy(data.enemyId as number) || typeof data.once !== 'boolean' || typeof data.clear !== 'boolean' || data.clear && !data.once) throw new Error('敵ID・一度限り・クリア設定を確認してください。クリア戦は一度限りにします。');
  return { enemyId: data.enemyId as number, once: data.once, clear: data.clear };
}
export function encodeBattleEvents(entities: readonly { kind: string; battleEvent?: BattleEvent }[]): number[] {
  const records = entities.flatMap((e, i) => { const event = parseBattleEvent(e.kind, e.battleEvent); return event ? [i, event.enemyId, Number(event.once) | Number(event.clear) << 1] : []; });
  return [records.length / 3, ...records];
}
