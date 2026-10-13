import { parseBattleEvent, encodeBattleEvents } from '../data/battle-events';
import type { BattleEvent } from '../data/battle-events';
import { placementFrame, validatePlacement } from '../data/entity-geometry';
import { isBuilding, legacyBuildingPosition } from '../data/building-placement';
import castleSource from '../../../compiler/maps/castle.json';
import townSource from '../../../compiler/maps/town.json';
import catalog from '../data/scene-catalog.json';
import { canonicalTile } from '../data/walls';
import type { SceneData } from '../codec/scenes';
import { placementInsets } from '../data/entity-placement';
import { legacyPlayerPosition, fitPlayerPosition, playerPlacement } from '../data/player-placement';
import { isNpc, isTownResident, legacyNpcPosition, npcPlacement } from '../data/npc-placement';
import { parseInteraction } from '../data/interactions';
import type { Dialogue } from '../data/interactions';
import { encodeInteractions } from '../codec/interactions';
import { parseExits, validateExitTargets, encodeExits, encodePackedExits } from '../data/stage-exits';
import type { StageExit } from '../data/stage-exits';
import { parseEncounter, encodeEncounter } from '../data/encounters/settings';
import type { EncounterSettings } from '../data/encounters/settings';

export interface Rectangle { tile: string; x: number; y: number; width: number; height: number }
export interface Entity { kind: string; x: number; y: number; parameters: number[]; dialogue?: Dialogue; itemId?: number; battleEvent?: BattleEvent }
export interface EditableScene {
  id: number;
  name: string;
  width: number;
  height: number;
  spawn: { x: number; y: number } | null;
  spawnAnchor: 'frame';
  residentAnchor: 'frame';
  npcAnchor: 'frame';
  buildingAnchor?: 'frame';
  floor: { default: string; rectangles: Rectangle[] };
  entities: Entity[];
  exits: StageExit[];
  encounter?: EncounterSettings;
}
export interface World { format: 'tagquest-world-editor-v1'; stages: EditableScene[] }
export const labels: Record<string, string> = {
  castle: '城の外観', town: '街', world: 'フィールド', forest: '森', cave: '洞窟', 'demon-castle': '魔王城',
  marble: '大理石', carpet: '赤いカーペット', 'wall-top': '城の壁', 'wall-left': '左の壁',
  'wall-right': '右の壁', 'wall-top-left': '左上の壁', 'wall-top-right': '右上の壁',
  grass: '草', dirt: '土', brick: 'レンガ', water: '堀の水', bridge: '木の橋', empty: '空白',
  'forest-ground': '森の地面', 'cave-floor': '岩の床', 'cave-wall': '岩の壁',
  'demon-floor': '魔王城の石床', 'demon-carpet': '紫のカーペット',
  'demon-wall-top': '魔王城の壁', 'demon-wall-left': '魔王城の左壁', 'demon-wall-right': '魔王城の右壁',
  'demon-wall-top-left': '魔王城の左上壁', 'demon-wall-top-right': '魔王城の右上壁',
  'demon-throne': '魔王城の玉座', 'demon-pillar': '魔王城の柱', tree: '木',
  sea: '海・川', sand: '砂浜', 'world-mountain': '山', 'world-forest': '森（全体マップ）',
  'world-town': '街（全体マップ）', 'world-forest-entrance': '森の入口',
  'world-cave': '洞窟（全体マップ）', 'world-demon-castle': '魔王城（全体マップ）',
  throne: '玉座', pillar: '柱', king: '王様', well: '井戸', 'weapon-shop': '武器屋',
  'armor-shop': '防具屋', 'item-shop': '道具屋', 'house-red': '赤屋根の家', 'house-slate': '青屋根の家',
  'weapon-merchant': '武器屋の店員', 'armor-merchant': '防具屋の店員', 'item-merchant': '道具屋の店員',
  traveler: '若者', resident: '女性', elder: 'おじいさん', loot: 'キラキラ',
  'treasure-chest': '宝箱', 'cave-witch': '洞窟の魔女', 'forest-fairy': '森の妖精', 'demon-lord': '魔王',
  'meadow-flowers': '花の草地', 'ruins-floor': '遺跡の石畳', 'world-ruins': '古城の遺跡（全体マップ）', signpost: '道しるべ', 'cave-crystal': '洞窟の水晶',
  'stone-tablet': '古い石碑',
  'moat-outer-bank': '堀の外縁', 'moat-inner-bank': '堀の内縁',
};
export const stageLabel = (scene: EditableScene): string => scene.name === 'castle' ? '城' : labels[scene.name] ?? scene.name;
export const clone = <T>(value: T): T => structuredClone(value);

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JSONの形式が違います。');
  return value as Record<string, unknown>;
}
function integer(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label}は${min}〜${max}の整数にしてください。`);
  }
  return value;
}
function tile(value: unknown): string {
  if (typeof value !== 'string' || !catalog.tiles.includes(value)) throw new Error('不明な床の種類です。');
  return canonicalTile(value);
}
function coordinate(value: unknown, extent: number, label: string, spawn = false): number {
  const result = integer(value, 0, Math.min(spawn ? 508 : 510, extent * 16 - 2), label);
  if (result % 2) throw new Error(`${label}は2px刻みにしてください。`);
  return result;
}
export function parseStage(value: unknown): EditableScene {
  const s = object(value);
  const id = integer(s.id, 0, 255, 'マップID');
  if (typeof s.name !== 'string' || !s.name.trim() || s.name.length > 80) throw new Error('マップ名を1〜80文字で入力してください。');
  const width = integer(s.width, 1, 32, '横幅');
  const height = integer(s.height, 1, 32, '縦幅');
  const spawnValue = s.spawn == null ? null : object(s.spawn);
  let spawn = spawnValue ? {
    x: coordinate(spawnValue.x, width, '開始X', true), y: coordinate(spawnValue.y, height, '開始Y', true),
  } : null;
  if (s.spawnAnchor !== undefined && s.spawnAnchor !== 'frame') throw new Error('開始位置の基準が不明です。');
  if (spawn && s.spawnAnchor === undefined) {
    spawn = legacyPlayerPosition(spawn);
    coordinate(spawn.x, width, '開始X', true);
  }
  if (spawn && (spawn.x + playerPlacement.width > width * 16 || spawn.y + playerPlacement.height > height * 16)) {
    throw new Error('主人公の1×2マスの枠をマップ内に収めてください。');
  }
  const floor = object(s.floor);
  if (!Array.isArray(floor.rectangles) || floor.rectangles.length > 4096) throw new Error('床の範囲指定が多すぎます。');
  const rectangles = floor.rectangles.map(value => {
    const r = object(value);
    const x = integer(r.x, 0, width - 1, '床X');
    const y = integer(r.y, 0, height - 1, '床Y');
    return { tile: tile(r.tile), x, y, width: integer(r.width, 1, width - x, '床の横幅'),
      height: integer(r.height, 1, height - y, '床の縦幅') };
  });
  if (!Array.isArray(s.entities) || s.entities.length > 255) throw new Error('配置は1マップ255個までです。');
  if (s.residentAnchor !== undefined && s.residentAnchor !== 'frame') throw new Error('住民の配置の基準が不明です。');
  if (s.npcAnchor !== undefined && s.npcAnchor !== 'frame') throw new Error('NPCの配置の基準が不明です。');
  if (s.buildingAnchor !== undefined && s.buildingAnchor !== 'frame') throw new Error('建物の配置の基準が不明です。');
  const entities = s.entities.map(value => {
    const e = object(value);
    const definition = catalog.entities.find(item => item.name === e.kind);
    if (!definition) throw new Error('不明な配置物です。');
    let x = coordinate(e.x, width, '配置X');
    const y = coordinate(e.y, height, '配置Y');
    if (isBuilding(definition.name) && s.buildingAnchor === undefined) {
      x = legacyBuildingPosition({ kind: definition.name, x, y }).x;
      coordinate(x, width, '配置X');
    }
    if (isNpc(definition.name)) {
      if (s.npcAnchor === undefined && !(isTownResident(definition.name) && s.residentAnchor === 'frame')) {
        x = legacyNpcPosition({ x, y }).x;
      }
      if (x + npcPlacement.width > width * 16 || y + npcPlacement.height > height * 16) {
        throw new Error('NPCの1×2マスの枠をマップ内に収めてください。');
      }
    }
    const raw = e.parameters ?? [];
    if (!Array.isArray(raw) || raw.length !== definition.parameters) throw new Error('配置物の設定数が違います。');
    const parameters = raw.map(value => integer(value, 0, 255, '配置物の設定'));
    if (definition.name === 'king' && parameters[0] > 1) throw new Error('王様戦の設定は0か1です。');
    if (definition.name === 'loot' && parameters[0] > 7) throw new Error('光のコマは0〜7です。');
    if (definition.name.startsWith('moat-') && (!parameters[0] || !parameters[1]
      || x + parameters[0] * 2 > width * 16 || y + parameters[1] * 2 > height * 16)) {
      throw new Error('堀の石縁がマップからはみ出しています。');
    }
    validatePlacement({ kind: definition.name, x, y, parameters }, width, height);
    return { kind: definition.name, x, y, parameters, ...parseInteraction(definition.name, e), ...(e.battleEvent == null ? {} : { battleEvent: parseBattleEvent(definition.name, e.battleEvent) }) };
  });
  const encounter = parseEncounter(s.encounter);
  return { id, name: s.name.trim(), width, height, spawn, spawnAnchor: 'frame', residentAnchor: 'frame', npcAnchor: 'frame', buildingAnchor: 'frame', floor: { default: tile(floor.default), rectangles }, entities, exits: parseExits(s.exits, width, height), ...(encounter ? { encounter } : {}) };
}
export function parseWorld(value: unknown): World {
  const stages = Array.isArray(value) ? value : object(value).stages ?? [value];
  if (!Array.isArray(stages) || !stages.length || stages.length > 255) throw new Error('マップは1〜255個にしてください。');
  const parsed = stages.map(parseStage);
  if (new Set(parsed.map(s => s.id)).size !== parsed.length) throw new Error('マップIDが重複しています。');
  validateExitTargets(parsed);
  return { format: 'tagquest-world-editor-v1', stages: parsed };
}
export const initialWorld = (): World => parseWorld([castleSource, townSource]);

export function toSceneData(stage: EditableScene): SceneData {
  const tiles = new Uint8Array(stage.width * stage.height).fill(catalog.tiles.indexOf(canonicalTile(stage.floor.default)));
  for (const r of stage.floor.rectangles) {
    for (let y = r.y; y < r.y + r.height; y += 1) {
      tiles.fill(catalog.tiles.indexOf(canonicalTile(r.tile)), y * stage.width + r.x, y * stage.width + r.x + r.width);
    }
  }
  const { exits, ...rest } = stage;
  return { ...rest, tiles, ...(exits?.length ? { exits } : {}) };
}

// Preserve paint order; compare horizontal/vertical sweeps and consecutive adjacent commands.
export function compactFloor(stage: EditableScene): void {
  const cells = toSceneData(stage).tiles;
  const cost = (floor: EditableScene['floor']) => {
    const ids = new Set([floor.default, ...floor.rectangles.map(r => r.tile)]);
    const local = [...ids].some(name => catalog.tiles.indexOf(name) >= 16);
    return local && ids.size > 16 ? Infinity : floor.rectangles.length * 3 + (local ? ids.size + 1 : 0);
  };
  let best = stage.floor, bestCost = cost(best);
  const consider = (floor: EditableScene['floor']) => {
    const candidateCost = cost(floor);
    if (candidateCost < bestCost) { best = floor; bestCost = candidateCost; }
  };
  const adjacent: Rectangle[] = [];
  for (const source of stage.floor.rectangles) {
    const r = { ...source }, previous = adjacent.at(-1);
    if (previous?.tile === r.tile && previous.y === r.y && previous.height === r.height
      && (previous.x + previous.width === r.x || r.x + r.width === previous.x)) {
      previous.x = Math.min(previous.x, r.x); previous.width += r.width;
    } else if (previous?.tile === r.tile && previous.x === r.x && previous.width === r.width
      && (previous.y + previous.height === r.y || r.y + r.height === previous.y)) {
      previous.y = Math.min(previous.y, r.y); previous.height += r.height;
    } else adjacent.push(r);
  }
  consider({ default: stage.floor.default, rectangles: adjacent });
  for (const defaultName of new Set([stage.floor.default, ...Array.from(cells, id => catalog.tiles[id])])) {
    const defaultId = catalog.tiles.indexOf(defaultName);
    for (const vertical of [false, true]) {
      const rectangles: Rectangle[] = [];
      let previous = new Map<string, Rectangle>();
      const rows = vertical ? stage.width : stage.height, columns = vertical ? stage.height : stage.width;
      const cell = (row: number, col: number) => cells[vertical ? col * stage.width + row : row * stage.width + col];
      for (let row = 0; row < rows; row++) {
        const current = new Map<string, Rectangle>();
        for (let col = 0; col < columns;) {
          const id = cell(row, col); let end = col + 1;
          while (end < columns && cell(row, end) === id) end++;
          if (id !== defaultId) {
            const key = `${id}:${col}:${end}`, earlier = previous.get(key);
            const rect = earlier ?? { tile: catalog.tiles[id], x: vertical ? row : col, y: vertical ? col : row,
              width: vertical ? 0 : end - col, height: vertical ? end - col : 0 };
            if (vertical) rect.width++; else rect.height++;
            if (!earlier) rectangles.push(rect);
            current.set(key, rect);
          }
          col = end;
        }
        previous = current;
      }
      consider({ default: defaultName, rectangles });
    }
  }
  stage.floor = best;
}
export function paint(stage: EditableScene, tileName: string, x: number, y: number, width = 1, height = 1): void {
  stage.floor.rectangles.push({ tile: canonicalTile(tileName), x, y, width, height });
}
export function resize(stage: EditableScene, width: number, height: number): void {
  const old = toSceneData(stage);
  stage.floor.rectangles = [];
  stage.width = width;
  stage.height = height;
  stage.exits = (stage.exits ?? []).filter(exit => exit.x < width && exit.y < height);
  for (let y = 0; y < Math.min(height, old.height); y += 1) {
    for (let x = 0; x < Math.min(width, old.width); x += 1) {
      const name = catalog.tiles[old.tiles[y * old.width + x]];
      if (name !== stage.floor.default) paint(stage, name, x, y);
    }
  }
  stage.entities = stage.entities.filter(e => e.x < width * 16 && e.y < height * 16);
  for (const entity of stage.entities) if (entity.kind.startsWith('moat-')) {
    entity.parameters = [Math.min(entity.parameters[0], (width * 16 - entity.x) / 2),
      Math.min(entity.parameters[1], (height * 16 - entity.y) / 2)];
  }
  if (stage.spawn && (stage.spawn.x >= width * 16 || stage.spawn.y >= height * 16)) stage.spawn = null;
  if (stage.spawn) stage.spawn = height < 2 ? null : fitPlayerPosition(stage.spawn, width, height, 2);
  stage.entities = stage.entities.filter(e => { try { validatePlacement(e, width, height); return true; } catch { return false; } });
  compactFloor(stage);
}
export function makeEntity(kind: string, x: number, y: number, stage: EditableScene): Entity {
  const parameters = kind === 'king' ? [1] : kind === 'loot' ? [0] : kind.startsWith('moat-')
    ? [Math.min(32, (stage.width * 16 - x) / 2), Math.min(32, (stage.height * 16 - y) / 2)] : [];
  const inset = placementInsets(kind);
  return { kind, x: x + inset.left, y: y + inset.top, parameters };
}

export interface StageReport { id: number; bytes: number; floorBytes: number; entityBytes: number; interactionBytes: number; exitBytes: number; encounterBytes: number; codec: string }
export function encodeWorld(world: World, compactEntities = false): { bytes: Uint8Array<ArrayBuffer>; reports: StageReport[] } {
  const usesExtendedTiles = world.stages.some(stage => [stage.floor.default, ...stage.floor.rectangles.map(r => r.tile)]
    .some(name => catalog.tiles.indexOf(name) >= 16));
  const hasEvents = world.stages.some(s => s.entities.some(e => e.battleEvent));
  const hasBuildings = world.stages.some(stage => stage.entities.some(e => isBuilding(e.kind)));
  const fractionalRate = world.stages.some(stage => stage.encounter && !Number.isInteger(stage.encounter.rate));
  const packedExits = fractionalRate || hasBuildings || compactEntities && world.stages.some(stage => stage.exits?.length);
  const version = fractionalRate ? 15 : hasBuildings ? 14 : packedExits ? 13 : world.stages.some(stage => (stage.encounter?.enemies?.length ?? 0) > 1) ? 12 : compactEntities ? 11 : hasEvents ? 10 : usesExtendedTiles ? 9 : 8;
  const bytes: number[] = [0x54, 0x51, version, world.stages.length];
  const reports: StageReport[] = [];
  for (const source of world.stages) {
    const stage = compactEntities ? { ...source, floor: structuredClone(source.floor) } : source;
    if (compactEntities) compactFloor(stage);
    const sceneTiles = toSceneData(stage).tiles;
    const tileIds = [...new Set([catalog.tiles.indexOf(canonicalTile(stage.floor.default)), ...stage.floor.rectangles.map(r => catalog.tiles.indexOf(canonicalTile(r.tile)))])].sort((a, b) => a - b);
    const localPalette = tileIds.some(id => id >= 16);
    if (localPalette && tileIds.length > 16) throw new Error('1マップの床は16種類までです。');
    const storedId = (globalId: number) => localPalette ? tileIds.indexOf(globalId) : globalId;
    const tiles = Uint8Array.from(sceneTiles, storedId);
    const raw: number[] = [];
    for (let i = 0; i < tiles.length; i += 2) raw.push(tiles[i] << 4 | (tiles[i + 1] ?? 0));
    const rle: number[] = [];
    for (let i = 0; i < tiles.length;) {
      let count = 1;
      while (i + count < tiles.length && tiles[i + count] === tiles[i] && count < 16) count += 1;
      rle.push(tiles[i] << 4 | count - 1);
      i += count;
    }
    const rect = [storedId(catalog.tiles.indexOf(canonicalTile(stage.floor.default))), stage.floor.rectangles.length];
    for (const r of stage.floor.rectangles) {
      const value = storedId(catalog.tiles.indexOf(canonicalTile(r.tile))) << 20 | r.x << 15 | r.y << 10 | (r.width - 1) << 5 | r.height - 1;
      rect.push(value >> 16, value >> 8 & 255, value & 255);
    }
    const candidates = [raw, rle, ...(stage.floor.rectangles.length <= 255 ? [rect] : [])];
    const codec = candidates.reduce((best, value, i) => value.length < candidates[best].length ? i : best, 0);
    const floor = localPalette ? [tileIds.length, ...tileIds, ...candidates[codec]] : candidates[codec];
    const packedEntities = compactEntities && stage.entities.every(e => { const f = placementFrame(e); return f.x % 16 === 0 && f.y % 16 === 0 && f.x >= 0 && f.y >= 0 && f.x / 16 < 32 && f.y / 16 < 32; });
    const entities = packedEntities ? stage.entities.flatMap(e => { const f = placementFrame(e); const value = catalog.entities.findIndex(d => d.name === e.kind) << 10 | f.x / 16 << 5 | f.y / 16; return [value >> 8, value & 255, ...e.parameters]; }) : stage.entities.flatMap(e => [e.parameters.length << 6 | catalog.entities.findIndex(d => d.name === e.kind),
      e.x / 2, e.y / 2, ...e.parameters]);
    const interactions = encodeInteractions(stage.entities);
    bytes.push(stage.id, stage.width, stage.height, stage.spawn ? stage.spawn.x / 2 : 255,
      stage.spawn ? stage.spawn.y / 2 : 255, codec | (localPalette ? 128 : 0) | (packedEntities ? 64 : 0), floor.length & 255, floor.length >> 8, stage.entities.length,
      ...floor, ...entities, interactions.length & 255, interactions.length >> 8);
    // 自由文を多く設定しても、引数展開の上限に達しないよう追記する。
    for (const byte of interactions) bytes.push(byte);
    const exits = packedExits ? encodePackedExits(stage.exits ?? [], world.stages.map(s => s.id)) : encodeExits(stage.exits ?? []);
    bytes.push(...exits);
    const encounter = encodeEncounter(stage.encounter);
    bytes.push(...encounter);
    const events = version >= 10 ? encodeBattleEvents(stage.entities) : []; bytes.push(...events);
    reports.push({ id: stage.id, bytes: 11 + floor.length + entities.length + interactions.length + exits.length + encounter.length + events.length, floorBytes: floor.length,
      entityBytes: entities.length, interactionBytes: 2 + interactions.length, exitBytes: exits.length, encounterBytes: encounter.length + events.length, codec: ['RAW', 'RLE', 'RECT'][codec] });
  }
  return { bytes: new Uint8Array(bytes), reports };
}

export class History {
  private previous: World[] = [];
  private next: World[] = [];
  constructor(public world: World) {}
  get canUndo(): boolean { return this.previous.length > 0; }
  get canRedo(): boolean { return this.next.length > 0; }
  commit(before: World): boolean {
    if (JSON.stringify(before) === JSON.stringify(this.world)) return false;
    this.previous.push(before);
    if (this.previous.length > 60) this.previous.shift();
    this.next = [];
    return true;
  }
  undo(): void { const before = this.previous.pop(); if (before) { this.next.push(this.world); this.world = before; } }
  redo(): void { const after = this.next.pop(); if (after) { this.previous.push(this.world); this.world = after; } }
}
