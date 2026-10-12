import templates from './dialogue-templates.json';
import { isNpc } from './npc-placement';
import { findItem } from './items';
import inspectableObjects from './inspectable-objects.json';

export type Dialogue = { readonly type: 'template'; readonly id: number } | { readonly type: 'custom'; readonly text: string };
export interface InteractionData { readonly dialogue?: Dialogue; readonly itemId?: number }
export const dialogueTemplates = templates;
export const customDialogueLimit = 1024;
export const dialogueByteLength = (text: string): number => new TextEncoder().encode(text).length;
export const isInspectableObject = (kind: string) => inspectableObjects.includes(kind);
export const canHaveDialogue = (kind: string) => isNpc(kind) || isInspectableObject(kind);
export const canHaveItem = (kind: string) => kind === 'loot' || isInspectableObject(kind);
export const npcNames: Record<string, string> = {
  king: '王様', traveler: '若者', resident: '女性', elder: 'おじいさん',
  'weapon-merchant': '武器屋の店員', 'armor-merchant': '防具屋の店員', 'item-merchant': '道具屋の店員',
  'cave-witch': '洞窟の魔女', 'forest-fairy': '森の妖精', 'demon-lord': '魔王',
};

export function validateCustomDialogue(text: unknown): string {
  if (typeof text !== 'string' || !text.trim() || dialogueByteLength(text) > customDialogueLimit
    || /[\u0000-\u0008\u000b-\u001f\u007f\ud800-\udfff]/u.test(text)) {
    throw new Error('会話は空でないUTF-8 1024バイト以内の文章にしてください。');
  }
  return text;
}

export function parseInteraction(kind: string, value: { dialogue?: unknown; itemId?: unknown }): InteractionData {
  const result: { dialogue?: Dialogue; itemId?: number } = {};
  if (value.dialogue != null) {
    if (!canHaveDialogue(kind) || typeof value.dialogue !== 'object' || Array.isArray(value.dialogue)) throw new Error('メッセージはNPCか調べられるオブジェクトに設定してください。');
    const data = value.dialogue as Record<string, unknown>;
    if (data.type === 'template' && typeof data.id === 'number' && Number.isInteger(data.id) && data.id >= 0 && data.id <= 255 && dialogueTemplates[data.id]) {
      result.dialogue = { type: 'template', id: data.id };
    } else if (data.type === 'custom') result.dialogue = { type: 'custom', text: validateCustomDialogue(data.text) };
    else throw new Error('会話テンプレートが不明です。');
  }
  if (value.itemId != null) {
    if (!canHaveItem(kind) || typeof value.itemId !== 'number' || !Number.isInteger(value.itemId) || value.itemId < 0 || value.itemId > 255 || !findItem(value.itemId)) {
      throw new Error('キラキラか調べられるオブジェクトには一覧にあるアイテムを設定してください。');
    }
    result.itemId = value.itemId;
  }
  return result;
}

export function dialogueText(dialogue: Dialogue): string {
  return dialogue.type === 'template' ? dialogueTemplates[dialogue.id].text : dialogue.text;
}
