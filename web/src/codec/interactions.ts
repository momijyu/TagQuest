import { parseInteraction } from '../data/interactions';
import type { InteractionData } from '../data/interactions';
import { isNpc } from '../data/npc-placement';

type Entity = InteractionData & { readonly kind: string };

/** ステージ内の配置順を参照する追加設定。未設定なら空のペイロード。 */
export function encodeInteractions(entities: readonly Entity[]): number[] {
  const records: number[] = [];
  let count = 0;
  entities.forEach((entity, index) => {
    const data = parseInteraction(entity.kind, entity);
    if (data.dialogue) {
      count++;
      if (data.dialogue.type === 'template') records.push(index, data.itemId === undefined ? 0 : 3, data.dialogue.id);
      else {
        const text = new TextEncoder().encode(data.dialogue.text);
        records.push(index, data.itemId === undefined ? 1 : 4, text.length & 255, text.length >> 8, ...text);
      }
      if (data.itemId !== undefined) records.push(data.itemId);
    } else if (data.itemId !== undefined) { count++; records.push(index, 2, data.itemId); }
  });
  if (records.length + 1 > 65535) throw new Error('会話とアイテムの設定は1マップ65535バイト以内にしてください。');
  return count ? [count, ...records] : [];
}

export function decodeInteractions(payload: Uint8Array, entities: Entity[], version = 8): void {
  if (!payload.length) return;
  let cursor = 0;
  const byte = () => { if (cursor >= payload.length) throw new Error('Truncated interaction data'); return payload[cursor++]; };
  const count = byte();
  if (!count) throw new Error('Empty interaction records');
  const seen = new Set<number>();
  for (let i = 0; i < count; i++) {
    const index = byte(), mode = byte();
    if (!entities[index] || seen.has(index)) throw new Error('Invalid interaction target');
    seen.add(index);
    let data: InteractionData;
    if (version < 8 && mode > 2) throw new Error('Unsupported interaction mode');
    if (mode === 0 || mode === 3) data = { dialogue: { type: 'template', id: byte() } };
    else if (mode === 1 || mode === 4) {
      const length = byte() | byte() << 8;
      if (cursor + length > payload.length) throw new Error('Truncated dialogue text');
      const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(payload.subarray(cursor, cursor + length));
      cursor += length;
      data = { dialogue: { type: 'custom', text } };
    } else if (mode === 2) data = { itemId: byte() };
    else throw new Error('Invalid interaction mode');
    if (mode === 3 || mode === 4) data = { ...data, itemId: byte() };
    if (version < 8 && (data.dialogue && !isNpc(entities[index].kind) || data.itemId !== undefined && entities[index].kind !== 'loot')) throw new Error('Invalid legacy interaction target');
    Object.assign(entities[index], parseInteraction(entities[index].kind, data));
  }
  if (cursor !== payload.length) throw new Error('Unexpected interaction bytes');
}
