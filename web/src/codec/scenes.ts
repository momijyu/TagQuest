import { parseBattleEvent } from '../data/battle-events';
import type { BattleEvent } from '../data/battle-events';
import frames from '../data/entity-frames.json';
import { isBuilding, legacyBuildingPosition } from '../data/building-placement';
import { validatePlacement } from '../data/entity-geometry';
import catalog from '../data/scene-catalog.json';
import { legacyPlayerPosition, playerPlacement } from '../data/player-placement';
import { isNpc, isTownResident, legacyNpcPosition, npcPlacement } from '../data/npc-placement';
import type { InteractionData } from '../data/interactions';
import { decodeInteractions } from './interactions';
import { parseExits, validateExitTargets, exitDirections, exitTargetBits, decodePackedExits } from '../data/stage-exits';
import type { StageExit } from '../data/stage-exits';
import { decodeEncounter } from '../data/encounters/settings';
import type { EncounterSettings } from '../data/encounters/settings';

export interface PlacedEntity extends InteractionData {
  readonly battleEvent?: BattleEvent;
  readonly kind: string;
  readonly x: number;
  readonly y: number;
  readonly parameters: readonly number[];
}

export interface SceneData {
  readonly id: number;
  readonly width: number;
  readonly height: number;
  readonly spawn: { readonly x: number; readonly y: number } | null;
  readonly tiles: Uint8Array;
  readonly entities: readonly PlacedEntity[];
  readonly exits?: readonly StageExit[];
  readonly encounter?: EncounterSettings;
}

class Reader {
  private offset = 0;
  constructor(private readonly bytes: Uint8Array) {}
  take(length: number): Uint8Array {
    if (length > this.bytes.length - this.offset) throw new Error('Truncated scene data');
    const result = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return result;
  }
  byte(): number { return this.take(1)[0]; }
  uint16(): number { const bytes = this.take(2); return bytes[0] | bytes[1] << 8; }
  get finished(): boolean { return this.offset === this.bytes.length; }
}

function tileId(value: number): number {
  if (value >= catalog.tiles.length) throw new Error('Unknown tile ID');
  return value;
}

function decodeFloor(codec: number, payload: Uint8Array, width: number, height: number, palette?: readonly number[]): Uint8Array {
  const resolveTile = (id: number): number => {
    if (id > 15) throw new Error('Invalid packed tile ID');
    if (!palette) return tileId(id);
    if (id >= palette.length) throw new Error('Unknown local tile ID');
    return palette[id];
  };
  const cells = new Uint8Array(width * height);
  if (codec === 0) {
    if (payload.length !== Math.ceil(cells.length / 2)) throw new Error('Invalid RAW length');
    for (let i = 0; i < cells.length; i += 1) {
      cells[i] = resolveTile(i % 2 ? payload[i >> 1] & 15 : payload[i >> 1] >> 4);
    }
    if (cells.length % 2 && (payload[payload.length - 1] & 15)) throw new Error('Invalid RAW padding');
  } else if (codec === 1) {
    let offset = 0;
    for (const value of payload) {
      const count = (value & 15) + 1;
      if (offset + count > cells.length) throw new Error('RLE overflow');
      cells.fill(resolveTile(value >> 4), offset, offset + count);
      offset += count;
    }
    if (offset !== cells.length) throw new Error('Incomplete RLE floor');
  } else if (codec === 2) {
    if (payload.length < 2 || payload.length !== 2 + payload[1] * 3) throw new Error('Invalid RECT length');
    cells.fill(resolveTile(payload[0]));
    for (let offset = 2; offset < payload.length; offset += 3) {
      const packed = payload[offset] << 16 | payload[offset + 1] << 8 | payload[offset + 2];
      const tile = resolveTile(packed >> 20);
      const x = packed >> 15 & 31;
      const y = packed >> 10 & 31;
      const w = (packed >> 5 & 31) + 1;
      const h = (packed & 31) + 1;
      if (x + w > width || y + h > height) throw new Error('RECT outside map');
      for (let row = y; row < y + h; row += 1) cells.fill(tile, row * width + x, row * width + x + w);
    }
  } else {
    throw new Error('Unsupported floor codec');
  }
  return cells;
}

export function decodeScenes(bytes: Uint8Array): readonly SceneData[] {
  const reader = new Reader(bytes);
  if (reader.byte() !== 0x54 || reader.byte() !== 0x51) {
    throw new Error('Unsupported scene format');
  }
  const version = reader.byte();
  if (version < 1 || version > 14) throw new Error('Unsupported scene format');
  const count = reader.byte();
  if (!count) throw new Error('No stages');
  const readerStageCount = count;
  const scenes: SceneData[] = [];
  const stageIds = new Set<number>();
  for (let index = 0; index < count; index += 1) {
    const id = reader.byte();
    const width = reader.byte();
    const height = reader.byte();
    if (stageIds.has(id)) throw new Error('Duplicate stage ID');
    stageIds.add(id);
    if (width < 1 || width > 32 || height < 1 || height > 32) throw new Error('Invalid map dimensions');
    const sx = reader.byte();
    const sy = reader.byte();
    let spawn = sx === 255 && sy === 255 ? null : { x: sx * 2, y: sy * 2 };
    if (spawn && (sx === 255 || sy === 255 || spawn.x >= width * 16 || spawn.y >= height * 16)) {
      throw new Error('Spawn outside map');
    }
    if (spawn && version === 1) spawn = legacyPlayerPosition(spawn);
    if (spawn && version >= 2 && (spawn.x + playerPlacement.width > width * 16 || spawn.y + playerPlacement.height > height * 16)) {
      throw new Error('Player frame outside map');
    }
    const codec = reader.byte();
    if ((codec & (version >= 11 ? 63 : version >= 9 ? 127 : 255)) > 2) throw new Error('Unsupported floor codec');
    const floorLength = reader.uint16();
    const entityCount = reader.byte();
    let floor = reader.take(floorLength);
    let palette: number[] | undefined;
    if (version >= 9 && (codec & 128)) {
      const length = floor[0];
      if (!length || length > 16 || floor.length <= length) throw new Error('Invalid local tile palette');
      palette = Array.from(floor.subarray(1, length + 1), tileId);
      if (new Set(palette).size !== length) throw new Error('Duplicate local tile ID');
      floor = floor.subarray(length + 1);
    }
    const tiles = decodeFloor(codec & (version >= 11 ? 63 : 127), floor, width, height, palette);
    const entities: PlacedEntity[] = [];
    for (let entityIndex = 0; entityIndex < entityCount; entityIndex += 1) {
      const packed = version >= 11 && Boolean(codec & 64);
      const control = packed ? reader.byte() << 8 | reader.byte() : reader.byte();
      const definition = catalog.entities[packed ? control >> 10 : control & 63];
      const length = packed ? definition?.parameters : control >> 6;
      if (!definition || length !== definition.parameters) throw new Error('Invalid entity definition');
      const frame = frames[definition.name as keyof typeof frames] ?? { x: 0, y: 0 };
      let x = packed ? (control >> 5 & 31) * 16 - frame.x : reader.byte() * 2;
      const y = packed ? (control & 31) * 16 - frame.y : reader.byte() * 2;
      if (x >= width * 16 || y >= height * 16) throw new Error('Entity outside map');
      if (version < 14 && isBuilding(definition.name)) x = legacyBuildingPosition({ kind: definition.name, x, y }).x;
      if (isNpc(definition.name)) {
        if (version < 4 && !(isTownResident(definition.name) && version >= 3)) x = legacyNpcPosition({ x, y }).x;
        if ((version >= 4 || (version === 3 && isTownResident(definition.name)))
          && (x + npcPlacement.width > width * 16 || y + npcPlacement.height > height * 16)) {
          throw new Error('NPC frame outside map');
        }
      }
      const parameters = Array.from(reader.take(length));
      if (definition.name === 'king' && parameters[0] > 1) throw new Error('Invalid king encounter flag');
      if (definition.name === 'loot' && parameters[0] > 7) throw new Error('Invalid loot phase');
      if (definition.name.startsWith('moat-') && (!parameters[0] || !parameters[1]
        || x + parameters[0] * 2 > width * 16 || y + parameters[1] * 2 > height * 16)) {
        throw new Error('Invalid moat bank dimensions');
      }
      if (version >= 4) validatePlacement({ kind: definition.name, x, y, parameters }, width, height);
      entities.push({ kind: definition.name, x, y, parameters });
    }
    if (version >= 5) decodeInteractions(reader.take(reader.uint16()), entities, version);
    let exits: StageExit[] = [];
    if (version >= 6) {
      const count = reader.byte();
      if (version >= 13) exits = decodePackedExits(reader.take(Math.ceil(count * (22 + exitTargetBits(readerStageCount)) / 8)), count, readerStageCount);
      else for (let i = 0; i < count; i++) {
        const x = reader.byte(), y = reader.byte(), targetStageId = reader.byte(), targetX = reader.byte(), targetY = reader.byte();
        const direction = exitDirections[reader.byte()];
        exits.push({ x, y, targetStageId, targetX, targetY, direction });
      }
      parseExits(exits, width, height);
    }
    const control = version >= 7 ? reader.byte() : 0;
    const encounter = version >= 12 && (control & 127) === 127
      ? decodeEncounter(control, undefined, { rate: reader.byte(), enemies: Array.from({ length: reader.byte() }, () => ({ enemyId: reader.byte(), weight: reader.byte() })) })
      : decodeEncounter(control, control ? reader.byte() : undefined);
    if (version >= 10) {
      const count = reader.byte(), seen = new Set<number>();
      for (let i = 0; i < count; i++) {
        const index = reader.byte(), enemyId = reader.byte(), flags = reader.byte();
        if (!entities[index] || seen.has(index) || flags > 3) throw new Error('Invalid battle event'); seen.add(index);
        Object.assign(entities[index], { battleEvent: parseBattleEvent(entities[index].kind, { enemyId, once: Boolean(flags & 1), clear: Boolean(flags & 2) }) });
      }
    }
    scenes.push({ id, width, height, spawn, tiles, entities, ...(exits.length ? { exits } : {}), ...(encounter ? { encounter } : {}) });
  }
  if (!reader.finished) throw new Error('Trailing scene data');
  if (version >= 13) for (const scene of scenes) for (const exit of scene.exits ?? []) exit.targetStageId = scenes[exit.targetStageId].id;
  validateExitTargets(scenes);
  return scenes;
}
