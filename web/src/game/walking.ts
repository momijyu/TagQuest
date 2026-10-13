import type { SceneData } from '../codec/scenes';
import catalog from '../data/scene-catalog.json';
import { playerCollisionFrame } from '../data/player-placement';
import { entityFrame, entityCollisionFrame } from '../renderer/compiled-scene';
import { isNpc } from '../data/npc-placement';
import { dialogueText, dialogueSpeaker, npcNames, isInspectableObject, canHaveItem, inspectionText } from '../data/interactions';
import type { Dialogue } from '../data/interactions';
import { findItem } from '../data/items';
import { isWorldLocation } from '../data/objects/world-locations';

export type Direction = 'front' | 'back' | 'left' | 'right';
export interface Position { readonly x: number; readonly y: number }
const walkableTiles = new Set(['marble', 'carpet', 'grass', 'dirt', 'brick', 'bridge', 'forest-ground', 'sand', 'cave-floor', 'demon-floor', 'demon-carpet', 'world-forest', 'meadow-flowers', 'ruins-floor']);
type Rectangle = Position & { readonly width: number; readonly height: number };
export interface GameMessage { readonly speaker: string; readonly text: string; readonly dialogue?: Dialogue; readonly shopKind?: string; readonly battleEntityIndex?: number }
const overlaps = (a: Rectangle, b: Rectangle) => a.x < b.x + b.width && a.x + a.width > b.x
  && a.y < b.y + b.height && a.y + a.height > b.y;

export function canStand(scene: SceneData, position: Position): boolean {
  const frame = playerCollisionFrame(position);
  if (frame.x < 0 || frame.y < 0 || frame.x + frame.width > scene.width * 16 || frame.y + frame.height > scene.height * 16) return false;
  for (let y = Math.floor(frame.y / 16); y <= Math.floor((frame.y + frame.height - 1) / 16); y++) {
    for (let x = Math.floor(frame.x / 16); x <= Math.floor((frame.x + frame.width - 1) / 16); x++) {
      if (!walkableTiles.has(catalog.tiles[scene.tiles[y * scene.width + x]])) return false;
    }
  }
  return !scene.entities.some(entity => {
    if (entity.kind === 'loot' || entity.kind === 'world-forest' || isWorldLocation(entity.kind) || entity.kind.startsWith('moat-')) return false;
    const obstacle = entityCollisionFrame(entity);
    return overlaps(frame, obstacle);
  });
}

/** 実際に調べられる最初の配置物。壁・カウンター・向きの判定を検証画面とも共有する。 */
export function interactionTarget(scene: SceneData, position: Position, direction: Direction,
  removed: ReadonlySet<number> = new Set(), collected: ReadonlySet<number> = new Set()): number | undefined {
  const dx = direction === 'left' ? -1 : direction === 'right' ? 1 : 0;
  const dy = direction === 'back' ? -1 : direction === 'front' ? 1 : 0;
  let fallback: number | undefined;
  for (const distance of [16, 32]) {
    const probe = { x: position.x + dx * distance, y: position.y + dy * distance };
    for (const [index, entity] of scene.entities.entries()) {
      const object = isInspectableObject(entity.kind);
      const frame = object || isNpc(entity.kind) ? entityCollisionFrame(entity) : entityFrame(entity);
      const throne = entity.kind === 'throne' || entity.kind === 'demon-throne';
      if (throne && (direction !== 'back' || playerCollisionFrame(position).y < frame.y + frame.height)) continue;
      if (removed.has(index) || entity.kind === 'loot' && collected.has(index)
        || !(isNpc(entity.kind) && (entity.dialogue || entity.battleEvent || entity.kind.endsWith('-merchant')) || entity.kind === 'loot' && entity.itemId !== undefined
          || object)) continue;
      // 店員は同じ売り場のカウンター越しに、下側から2マスまで話せる。
      const shop = direction === 'back' && entity.kind.endsWith('-merchant') ? scene.entities.find(candidate => {
        if (candidate.kind !== entity.kind.replace('-merchant', '-shop')) return false;
        const frame = entityFrame(candidate), npc = entityFrame(entity), feet = playerCollisionFrame(position);
        return npc.x >= frame.x && npc.x + npc.width <= frame.x + frame.width && npc.y >= frame.y
          && npc.y + npc.height <= frame.y + frame.height && feet.y >= frame.y + frame.height;
      }) : undefined;
      if ((distance === 32 && !shop) || !overlaps(playerCollisionFrame(probe), frame)) continue;
      const passage = { ...scene, entities: scene.entities.filter((candidate, index) => !removed.has(index) && candidate !== entity && candidate !== shop) };
      let clear = true;
      for (let step = 1; step <= distance; step++) {
        if (!canStand(passage, { x: position.x + dx * step, y: position.y + dy * step })) { clear = false; break; }
      }
      if (!clear) continue;
      // 未設定の売り場の反応より、カウンター越しの店員との会話を優先する。
      if (object && !entity.dialogue && entity.itemId === undefined && !throne && entity.kind !== 'treasure-chest') {
        fallback ??= index;
        continue;
      }
      return index;
    }
  }
  return fallback;
}

/** 編集データを変更せず、1マスずつ歩くための一時的な状態。 */
export function createWalkingGame(source: SceneData, entry?: { position: Position; direction: Direction }) {
  const scene = structuredClone(source);
  const start = entry?.position ?? scene.spawn;
  if (!start) throw new Error('「開始位置」で主人公を置いてからプレイしてください。');
  if (!canStand(scene, start)) throw new Error('開始位置の足元が壁・空白・水・配置物と重なっています。歩ける場所に置いてください。');
  const spawn = { ...start };
  let position = { ...spawn };
  let direction: Direction = entry?.direction ?? 'front';
  const collected = new Set<number>();
  const opened = new Set<number>();
  const removed = new Set<number>();
  const inventory = new Map<number, number>();
  const messages: GameMessage[] = [];
  const collisionScene = () => ({ ...scene, entities: scene.entities.filter((_, index) => !removed.has(index)) });
  function collect(index: number): void {
    const entity = scene.entities[index];
    const item = entity.itemId === undefined ? undefined : findItem(entity.itemId);
    if (!canHaveItem(entity.kind) || !item || collected.has(index)) return;
    collected.add(index);
    inventory.set(item.id, (inventory.get(item.id) ?? 0) + 1);
    messages.push({ speaker: '', text: `${item.name}を手に入れた！` });
  }
  function collectTouched(): void {
    scene.entities.forEach((entity, index) => {
      if (entity.kind === 'loot' && overlaps(playerCollisionFrame(position), entityFrame(entity))) collect(index);
    });
  }
  collectTouched();
  return {
    scene,
    get position(): Position { return { ...position }; },
    get direction(): Direction { return direction; },
    get message(): GameMessage | null { return messages[0] ?? null; },
    get inventory() { return [...inventory].map(([itemId, count]) => ({ itemId, count })); },
    get visibleEntities() { return scene.entities.filter((entity, index) => !(entity.kind === 'loot' && collected.has(index)) && !removed.has(index)); },
    get openedChests() { return new Set(scene.entities.filter((entity, index) => entity.kind === 'treasure-chest' && opened.has(index))); },
    removeEntity(index: number): void { removed.add(index); },
    removeCharacter(kind: string, predicate: (entity: SceneData['entities'][number]) => boolean = () => true): void {
      scene.entities.forEach((entity, index) => { if (entity.kind === kind && predicate(entity)) removed.add(index); });
    },
    enter(next: Position, facing: Direction): void {
      if (!canStand(collisionScene(), next)) throw new Error('到着位置が歩けない場所です。');
      position = { ...next }; direction = facing; messages.length = 0; collectTouched();
    },
    reset(): void {
      position = { ...spawn }; direction = 'front'; collected.clear(); opened.clear(); removed.clear(); inventory.clear(); messages.length = 0;
      collectTouched();
    },
    interact(): void {
      if (messages.length) { messages.shift(); return; }
      collectTouched();
      if (messages.length) return;
      const index = interactionTarget(scene, position, direction, removed, collected);
      if (index === undefined) return;
      const entity = scene.entities[index];
      const object = isInspectableObject(entity.kind);
      const chest = entity.kind === 'treasure-chest';
      if (chest && opened.has(index)) {
        messages.push({ speaker: '', text: '宝箱は空っぽだった。' });
        return;
      }
      if (object && entity.itemId !== undefined && collected.has(index)) {
        messages.push({ speaker: '', text: 'もうここには何もないようだ。' });
        return;
      }
      if (chest) opened.add(index);
      if (entity.dialogue || entity.battleEvent || entity.kind.endsWith('-merchant')) messages.push({ speaker: dialogueSpeaker(entity.dialogue, npcNames[entity.kind] ?? ''), text: entity.dialogue ? dialogueText(entity.dialogue) : entity.battleEvent ? '戦いが始まる！' : 'いらっしゃい！',
        ...(entity.dialogue ? { dialogue: entity.dialogue } : {}),
        ...(entity.battleEvent ? { battleEntityIndex: index } : {}),
        ...(entity.kind.endsWith('-merchant') ? { shopKind: entity.kind } : {}) });
      else if (entity.itemId === undefined || collected.has(index)) {
        if (object) messages.push({ speaker: '', text: inspectionText(entity.kind) });
      }
      collect(index);
      return;
    },
    cancelBattleDialogue(): boolean {
      if (messages[0]?.battleEntityIndex === undefined) return false;
      messages.shift(); return true;
    },
    move(nextDirection: Direction): boolean {
      if (messages.length) return false;
      direction = nextDirection;
      const dx = direction === 'left' ? -1 : direction === 'right' ? 1 : 0;
      const dy = direction === 'back' ? -1 : direction === 'front' ? 1 : 0;
      // 2px刻みで置いた障害物も、移動の途中ですり抜けない。
      for (let distance = 1; distance <= 16; distance++) {
        if (!canStand(collisionScene(), { x: position.x + dx * distance, y: position.y + dy * distance })) return false;
      }
      position = { x: position.x + dx * 16, y: position.y + dy * 16 };
      collectTouched();
      return true;
    },
  };
}
