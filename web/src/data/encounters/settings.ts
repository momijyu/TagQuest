import { findEnemy } from './combat-config';
export { enemyCatalog, findEnemy } from './combat-config';
export interface EncounterEntry { enemyId: number; weight: number }
export interface EncounterSettings { enabled: boolean; enemyId: number; rate: number; enemies?: EncounterEntry[] }
const integer = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
export function parseEncounter(value: unknown): EncounterSettings | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('エンカウントの形式が違います。');
  const data = value as Record<string, unknown>;
  if (typeof data.enabled !== 'boolean' || !integer(data.rate, 0, 100)) throw new Error('出現のON/OFFと、1歩ごとの確率（0〜100の整数）を設定してください。');
  let enemies: EncounterEntry[] | undefined;
  if (data.enemies !== undefined) {
    if (!Array.isArray(data.enemies) || data.enemies.length < 1 || data.enemies.length > 255) throw new Error('出現表は1〜255種類で設定してください。');
    const seen = new Set<number>();
    enemies = data.enemies.map(entry => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry) || !integer(entry.enemyId, 0, 255) || !findEnemy(entry.enemyId) || seen.has(entry.enemyId) || !integer(entry.weight, 1, 255)) throw new Error('出現表の敵IDは重複なし、割合は1〜255の整数にしてください。');
      seen.add(entry.enemyId); return { enemyId: entry.enemyId, weight: entry.weight };
    });
  }
  const enemyId = enemies?.[0].enemyId ?? data.enemyId;
  if (!integer(enemyId, 0, 255) || !findEnemy(enemyId)) throw new Error('出現する敵を一覧から選んでください。');
  return { enabled: data.enabled, enemyId, rate: data.rate, ...(enemies && enemies.length > 1 ? { enemies } : {}) };
}
export function encounterEntries(settings: EncounterSettings): readonly EncounterEntry[] {
  return settings.enemies ?? [{ enemyId: settings.enemyId, weight: 1 }];
}
/** 1種類は従来の2B。複数はv12で制御・確率・件数・(敵ID,割合)を保存。 */
export function encodeEncounter(value: EncounterSettings | undefined): number[] {
  const data = parseEncounter(value);
  if (!data) return [0];
  if (data.enemies) return [127 | (data.enabled ? 128 : 0), data.rate, data.enemies.length, ...data.enemies.flatMap(e => [e.enemyId, e.weight])];
  return [(data.rate + 1) | (data.enabled ? 128 : 0), data.enemyId];
}
export function decodeEncounter(control: number, enemyId?: number, table?: { rate: number; enemies: EncounterEntry[] }): EncounterSettings | undefined {
  if (control === 0) return undefined;
  if (table) return parseEncounter({ enabled: Boolean(control & 128), ...table });
  return parseEncounter({ enabled: Boolean(control & 128), enemyId, rate: (control & 127) - 1 });
}
