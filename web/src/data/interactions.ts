import templates from './dialogue-templates.json';
import { isNpc } from './npc-placement';
import { findItem } from './items';
import inspectableObjects from './inspectable-objects.json';

export type Dialogue = { readonly type: 'template'; readonly id: number } | { readonly type: 'custom'; readonly text: string };
export interface InteractionData { readonly dialogue?: Dialogue; readonly itemId?: number }
export interface DialogueTemplate { readonly name: string; readonly text: string; readonly speaker?: string; readonly afterClear?: string; readonly storyRole?: string; readonly locationName?: string }
export const dialogueTemplates: readonly DialogueTemplate[] = templates;
export const customDialogueLimit = 1024;
export const dialogueByteLength = (text: string): number => new TextEncoder().encode(text).length;
export const isInspectableObject = (kind: string) => inspectableObjects.includes(kind);
const inspectionMessages: Readonly<Record<string, string>> = {
  'house-red': '鍵がかかっているようだ。',
  'house-slate': '鍵がかかっているようだ。',
  well: 'きれいな水をたたえた井戸だ。',
  'cave-crystal': '澄んだ光を放つ水晶だ。',
  'stone-tablet': '風化した石碑だ。',
  signpost: '道しるべだ。文字はかすれて読めない。',
  tree: '枝葉を広げた大きな木だ。',
  pillar: '白い石で作られた柱だ。',
  'demon-pillar': '黒い石で作られた柱だ。',
  castle: '堀に囲まれたお城だ。',
  'weapon-shop': '武器屋の売り場だ。店員に話しかけてみよう。',
  'armor-shop': '防具屋の売り場だ。店員に話しかけてみよう。',
  'item-shop': '道具屋の売り場だ。店員に話しかけてみよう。',
  throne: '赤いクッションと金の装飾がついた玉座だ。',
  'demon-throne': '紫のクッションと金の装飾がついた玉座だ。',
  'treasure-chest': '宝箱は空っぽだった。',
};
/** 未設定の調査物にもWeb共通の反応を返し、NFCに文章を追加しない。 */
export const inspectionText = (kind: string): string => inspectionMessages[kind] ?? '特に変わったものはない。';
export const canHaveDialogue = (kind: string) => isNpc(kind) || isInspectableObject(kind);
export const canHaveItem = (kind: string) => kind === 'loot' || isInspectableObject(kind);
export const npcNames: Record<string, string> = {
  king: '王様', traveler: '若者', resident: '女性', elder: 'おじいさん',
  'weapon-merchant': '武器屋の店員', 'armor-merchant': '防具屋の店員', 'item-merchant': '道具屋の店員',
  'cave-witch': '洞窟の魔女', 'forest-fairy': '森の妖精', 'demon-lord': '魔王', 'demon-guard': '魔王の子分', innkeeper: '宿屋の主人',
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

export function dialogueText(dialogue: Dialogue, cleared = false): string {
  if (dialogue.type === 'custom') return dialogue.text;
  const template = dialogueTemplates[dialogue.id];
  return cleared ? template.afterClear ?? template.text : template.text;
}
export function dialogueSpeaker(dialogue: Dialogue | undefined, fallback: string): string {
  return dialogue?.type === 'template' ? dialogueTemplates[dialogue.id].speaker ?? fallback : fallback;
}
