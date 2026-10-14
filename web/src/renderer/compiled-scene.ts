import { returnRune } from '../data/effects/return-rune';
import { facilityBuildings, ship, ironGate } from '../data/objects/ultimate-facilities';
import { worldTerrainTiles } from '../data/tiles/world-terrain';
import { explorationTiles } from '../data/tiles/exploration';
import { caveCrystal, signpost, stoneTablet } from '../data/objects/exploration';
import { placementFrame } from '../data/entity-geometry';
import { isBuilding, buildingDrawingPosition } from '../data/building-placement';
import catalog from '../data/scene-catalog.json';
import type { PlacedEntity, SceneData } from '../codec/scenes';
import type { ImageSprite } from '../data/characters/types';
import { castleFloor } from '../data/tiles/castle-floor';
import { castleCarpet } from '../data/tiles/castle-carpet';
import { castleWall } from '../data/tiles/castle-wall';
import { castleWallLeft, castleWallRight } from '../data/tiles/castle-side-wall';
import { castleWallTopLeft, castleWallTopRight } from '../data/tiles/castle-wall-corner';
import { townGrass } from '../data/tiles/town-grass';
import { townDirt } from '../data/tiles/town-dirt';
import { townBrick } from '../data/tiles/town-brick';
import { castleMoat } from '../data/tiles/castle-moat';
import { castleBridge } from '../data/tiles/castle-bridge';
import { emptyTile } from '../data/tiles/empty';
import { demonCastleTiles } from '../data/tiles/demon-castle';
import { demonPillar, demonThrone } from '../data/objects/demon-castle';
import { caveFloor, caveWall } from '../data/tiles/cave';
import { forestGround } from '../data/tiles/forest-ground';
import { tree } from '../data/objects/tree';
import { worldSea } from '../data/tiles/world-sea';
import { worldSand } from '../data/tiles/world-sand';
import { worldMountain, worldForest } from '../data/objects/world-terrain';
import { worldLocations, isWorldLocation, worldLocationDrawingPosition } from '../data/objects/world-locations';
import { drawCoast } from './coast';
import { automaticWall } from './wall';
import { throne } from '../data/objects/throne';
import { pillar } from '../data/objects/pillar';
import { castleExterior } from '../data/objects/castle-exterior';
import { well } from '../data/objects/well';
import { townHouses } from '../data/objects/town-houses';
import { townNpcs } from '../data/characters/town-npcs';
import { forestCaveNpcs } from '../data/characters/forest-cave-npcs';
import { serviceBuildings, bountyBoard } from '../data/objects/service-buildings';
import { dangerGrounds } from '../data/tiles/danger-grounds';
import { enemyPixelSprites } from '../data/encounters/enemy-pixels';
import { voidGod } from '../data/characters/void-god';
import { demonLord } from '../data/characters/demon-lord';
import { demonGuard } from '../data/characters/demon-guard';
import { treasureChest, openTreasureChest } from '../data/objects/treasure-chest';
import { townShops } from './shop-preview';
import { drawTile } from './tile';
import { drawSprite } from './sprite';
import { drawImageSprite } from './image-sprite';
import { placementInsets } from '../data/entity-placement';
import { playerCollisionFrame, playerDrawingPosition, playerPlacement } from '../data/player-placement';
import { isNpc, npcDrawingPosition, npcPlacement } from '../data/npc-placement';

const rift = { size: 16, palette: ['#271f47', '#7056b8', '#bba0f7', '#ebdcff'], pixels: Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => {
  const distance = ((x - 7.5) / 5) ** 2 + ((y - 7.5) / 7) ** 2;
  return distance > 1 ? '0' : distance > 0.7 ? '3' : distance > 0.4 ? '1' : '0';
}).join('')) };
const tiles = { ...dangerGrounds, 'void-rift': rift,
  marble: castleFloor, carpet: castleCarpet, 'wall-top': castleWall,
  'wall-left': castleWallLeft, 'wall-right': castleWallRight,
  'wall-top-left': castleWallTopLeft, 'wall-top-right': castleWallTopRight,
  grass: townGrass, dirt: townDirt, brick: townBrick, water: castleMoat, bridge: castleBridge,
  empty: emptyTile, 'forest-ground': forestGround, sea: worldSea, sand: worldSand, 'cave-floor': caveFloor, 'cave-wall': caveWall, ...demonCastleTiles, ...worldTerrainTiles, ...explorationTiles,
};
const uniqueSprites = Object.fromEntries([[15,'queen-arachne'],[16,'fenrir'],[17,'volkex']].map(([id,name])=>{ const sprite=enemyPixelSprites[String(name)]; return [id,{...sprite,width:32,height:32,pixels:Array.from({length:32},(_,y)=>Array.from({length:32},(_,x)=>sprite.pixels[Math.floor(y*sprite.height/32)][x*2]).join(''))}]; }));
const sisterSprite = { ...townNpcs.resident.sprite, palette: townNpcs.resident.sprite.palette.map((color,index)=>index===5?'#4b6789':index===6?'#e0e3dc':index===7?'#485263':index===8?'#7a8698':color) };
const sprites = { ...facilityBuildings, ship, 'iron-gate': ironGate, 'well-entrance': well, blacksmith: townNpcs.traveler.sprite, 'shrine-keeper': sisterSprite, 'casino-dealer': townNpcs.traveler.sprite, 'black-market-dealer': townNpcs.traveler.sprite, 'fortune-teller': forestCaveNpcs['cave-witch'].sprite, captain: townNpcs.elder.sprite, 'corral-keeper': townNpcs.resident.sprite, ...serviceBuildings, 'bounty-board': bountyBoard, 'guild-master': townNpcs.elder.sprite, sister:sisterSprite, alchemist:forestCaveNpcs['cave-witch'].sprite, 'unique-monster':uniqueSprites[15],
  pillar, 'demon-pillar': demonPillar, castle: castleExterior, well, tree, signpost, 'cave-crystal': caveCrystal, 'stone-tablet': stoneTablet,
  'world-mountain': worldMountain, 'world-forest': worldForest,
  ...worldLocations,
  'house-red': townHouses.red.sprite, 'house-slate': townHouses.slate.sprite,
  traveler: townNpcs.traveler.sprite, resident: townNpcs.resident.sprite, elder: townNpcs.elder.sprite,
  'cave-witch': forestCaveNpcs['cave-witch'].sprite, 'forest-fairy': forestCaveNpcs['forest-fairy'].sprite,
  'treasure-chest': treasureChest,
  'demon-lord': demonLord,
  'demon-guard': demonGuard, innkeeper: townNpcs.elder.sprite,
  'weapon-merchant': townShops.weapon.shopkeeper,
  'armor-merchant': townShops.armor.shopkeeper, 'item-merchant': townShops.item.shopkeeper,
};
const shops = {
  'weapon-shop': townShops.weapon, 'armor-shop': townShops.armor, 'item-shop': townShops.item,
};
const horizontalBridge = { ...castleBridge,
  pixels: castleBridge.pixels.map((_, y) => castleBridge.pixels.map((_, x) => castleBridge.pixels[15 - x][y]).join('')),
};
function sceneTile(scene: SceneData, column: number, row: number) {
  const wall = automaticWall(scene, column, row);
  if (wall) return wall;
  const name = catalog.tiles[scene.tiles[row * scene.width + column]] as keyof typeof tiles;
  if (name === 'bridge' && row > 0 && row + 1 < scene.height
    && catalog.tiles[scene.tiles[(row - 1) * scene.width + column]] === 'sea'
    && catalog.tiles[scene.tiles[(row + 1) * scene.width + column]] === 'sea') return horizontalBridge;
  return tiles[name];
}

function drawingSize(entity: PlacedEntity): { width: number; height: number } {
  if (entity.kind.startsWith('moat-')) return { width: entity.parameters[0] * 2, height: entity.parameters[1] * 2 };
  if (entity.kind === 'king') return { width: 32, height: 32 };
  if (entity.kind === 'loot') return { width: 16, height: 16 };
  if (entity.kind === 'throne' || entity.kind === 'demon-throne') return { width: 24, height: 24 };
  if (entity.kind in shops) return shops[entity.kind as keyof typeof shops].building;
  if (entity.kind in sprites) return sprites[entity.kind as keyof typeof sprites];
  return { width: 16, height: 16 };
}

export function entitySize(entity: PlacedEntity): { width: number; height: number } {
  if (isBuilding(entity.kind)) { const { width, height } = placementFrame(entity); return { width, height }; }
  if (isNpc(entity.kind)) return npcPlacement;
  if (isWorldLocation(entity.kind)) return { width: 16, height: 16 };
  const size = drawingSize(entity);
  const inset = placementInsets(entity.kind);
  return { width: size.width + inset.left + inset.right, height: size.height + inset.top + inset.bottom };
}

export function entityDrawingFrame(entity: PlacedEntity): { x: number; y: number; width: number; height: number } {
  const position = isWorldLocation(entity.kind) ? worldLocationDrawingPosition(entity)
    : isNpc(entity.kind) ? npcDrawingPosition(entity) : isBuilding(entity.kind) ? buildingDrawingPosition(entity) : entity;
  const { width, height } = drawingSize(entity);
  return { x: position.x, y: position.y, width, height };
}

export function entityFrame(entity: PlacedEntity): { x: number; y: number; width: number; height: number } {
  return placementFrame(entity);
}

/** 民家は下側4×2マス、お店は下側中央4×4マス。屋根や奥壁の後ろは通れる。 */
export function entityCollisionFrame(entity: PlacedEntity): { x: number; y: number; width: number; height: number } {
  if (entity.kind === 'house-red' || entity.kind === 'house-slate' || entity.kind in serviceBuildings || entity.kind in facilityBuildings || entity.kind in shops) {
    const drawing = entityDrawingFrame(entity);
    const width = 64, height = entity.kind in shops ? 64 : 32;
    return { x: drawing.x + (drawing.width - width) / 2, y: drawing.y + drawing.height - height, width, height };
  }
  const frame = entityFrame(entity);
  if (entity.kind === 'throne' || entity.kind === 'demon-throne') return { ...frame, x: frame.x + (frame.width - 16) / 2, width: 16 };
  if (entity.kind === 'tree') return { x: frame.x + 16, y: frame.y + 32, width: 16, height: 16 };
  if (entity.kind === 'cave-crystal' || entity.kind === 'stone-tablet') return { x: frame.x, y: frame.y + 16, width: 16, height: 16 };
  if (isNpc(entity.kind)) return { x: frame.x, y: frame.y + 16, width: 16, height: 16 };
  return frame;
}

function drawBank(context: CanvasRenderingContext2D, entity: PlacedEntity): void {
  const { x, y, parameters, kind } = entity;
  const w = parameters[0] * 2;
  const h = parameters[1] * 2;
  context.fillStyle = '#6d7b86';
  for (const [dx, dy, rw, rh] of [[0, 0, w, 2], [0, h - 2, w, 2], [0, 0, 2, h], [w - 2, 0, 2, h]]) {
    context.fillRect(x + dx, y + dy, rw, rh);
  }
  context.fillStyle = '#c8ccca';
  const inset = kind === 'moat-inner-bank' ? 1 : 0;
  for (const [dx, dy, rw, rh] of [[inset, inset, w - inset * 2, 1], [inset, h - 1 - inset, w - inset * 2, 1],
    [inset, inset, 1, h - inset * 2], [w - 1 - inset, inset, 1, h - inset * 2]]) {
    context.fillRect(x + dx, y + dy, rw, rh);
  }
}

const terrainCache = new WeakMap<Uint8Array, { width: number; height: number; image: OffscreenCanvas }>();
function drawTerrain(context: CanvasRenderingContext2D, scene: SceneData): void {
  if (typeof OffscreenCanvas === 'undefined') { paintTerrain(context, scene); return; }
  let cached = terrainCache.get(scene.tiles);
  if (!cached || cached.width !== scene.width || cached.height !== scene.height) {
    const image = new OffscreenCanvas(scene.width * 16, scene.height * 16), paint = image.getContext('2d');
    if (!paint) { paintTerrain(context, scene); return; }
    paintTerrain(paint as unknown as CanvasRenderingContext2D, scene);
    cached = { width: scene.width, height: scene.height, image }; terrainCache.set(scene.tiles, cached);
  }
  context.imageSmoothingEnabled = false; context.drawImage(cached.image, 0, 0);
}
function paintTerrain(context: CanvasRenderingContext2D, scene: SceneData): void {
  for (let row = 0; row < scene.height; row += 1) {
    for (let column = 0; column < scene.width; column += 1) {
      drawTile(context, sceneTile(scene, column, row), column * 16, row * 16);
    }
  }
  // 岩壁と床の境目にだけ厚みを描く。床の通行判定は1マスのまま。
  for (let row = 0; row < scene.height; row++) for (let column = 0; column < scene.width; column++) {
    const at = (x: number, y: number) => x >= 0 && y >= 0 && x < scene.width && y < scene.height
      ? catalog.tiles[scene.tiles[y * scene.width + x]] : undefined;
    if (at(column, row) !== 'cave-floor') continue;
    const x = column * 16, y = row * 16;
    context.fillStyle = '#47454a';
    if (at(column, row - 1) === 'cave-wall') context.fillRect(x, y, 16, 2);
    if (at(column - 1, row) === 'cave-wall') context.fillRect(x, y, 1, 16);
    if (at(column + 1, row) === 'cave-wall') context.fillRect(x + 15, y, 1, 16);
  }
  // カーペットの外周だけに金の細い縁を描き、マスの間には線を入れない。
  for (let row = 0; row < scene.height; row++) for (let column = 0; column < scene.width; column++) {
    const at = (x: number, y: number) => x >= 0 && y >= 0 && x < scene.width && y < scene.height
      ? catalog.tiles[scene.tiles[y * scene.width + x]] : undefined;
    if (at(column, row) !== 'demon-carpet') continue;
    const x = column * 16, y = row * 16;
    context.fillStyle = '#9f8045';
    if (at(column - 1, row) !== 'demon-carpet') context.fillRect(x, y, 1, 16);
    if (at(column + 1, row) !== 'demon-carpet') context.fillRect(x + 15, y, 1, 16);
    if (at(column, row - 1) !== 'demon-carpet') context.fillRect(x, y, 16, 1);
    if (at(column, row + 1) !== 'demon-carpet') context.fillRect(x, y + 15, 16, 1);
  }
  drawCoast(context, scene);
}

export function drawCompiledScene(
  context: CanvasRenderingContext2D,
  scene: SceneData,
  characters?: { readonly king: ImageSprite; readonly player: ImageSprite },
  options: { readonly returnPortal?: {readonly x:number;readonly y:number}; readonly openedChests?: ReadonlySet<PlacedEntity> } = {},
): void {
  drawTerrain(context, scene);
  for (const entity of scene.entities) if (entity.kind.startsWith('moat-')) drawBank(context, entity);
  // 橋の板は岸の石縁より手前に描く。
  for (let i = 0; i < scene.tiles.length; i += 1) {
    if (catalog.tiles[scene.tiles[i]] === 'bridge') drawTile(context, sceneTile(scene, i % scene.width, Math.floor(i / scene.width)), i % scene.width * 16, Math.floor(i / scene.width) * 16);
  }
  const depth = (entity: PlacedEntity): number => {
    const root = entityCollisionFrame(entity);
    if (entity.kind.endsWith('-merchant')) {
      const frame = entityFrame(entity);
      const shop = scene.entities.find(candidate => {
        if (candidate.kind !== entity.kind.replace('-merchant', '-shop')) return false;
        const shopFrame = entityFrame(candidate);
        return frame.x >= shopFrame.x && frame.x + frame.width <= shopFrame.x + shopFrame.width
          && frame.y >= shopFrame.y && frame.y + frame.height <= shopFrame.y + shopFrame.height;
      });
      if (shop) { const frame = entityCollisionFrame(shop); return frame.y + frame.height; }
    }
    return root.y + root.height;
  };
  const hasDepth = (entity: PlacedEntity): boolean => entity.kind === 'tree' || entity.kind === 'cave-crystal' || entity.kind === 'stone-tablet' || entity.kind === 'signpost' || isNpc(entity.kind) || entity.kind === 'treasure-chest' || isBuilding(entity.kind);
  const layeredEntities = scene.entities.filter(hasDepth).sort((a, b) => depth(a) - depth(b) || Number(isBuilding(b.kind)) - Number(isBuilding(a.kind)));
  const feet = characters && scene.spawn ? playerCollisionFrame(scene.spawn) : undefined;
  const inFrontOfPlayer = (entity: PlacedEntity): boolean => Boolean(feet && depth(entity) > feet.y + feet.height);
  function drawEntity(entity: PlacedEntity): void {
    const { kind, x, y } = entity;
    if (kind in sprites) {
      const position = entityDrawingFrame(entity);
      const sprite = kind === 'treasure-chest' && options.openedChests?.has(entity)
        ? openTreasureChest : kind === 'unique-monster' ? uniqueSprites[entity.battleEvent?.enemyId ?? 15] ?? uniqueSprites[15] : kind === 'demon-lord' && entity.battleEvent?.enemyId === 11 ? voidGod : sprites[kind as keyof typeof sprites];
      drawSprite(context, sprite, position.x, position.y);
    }
    else if (kind in shops) {
      const position = entityDrawingFrame(entity);
      drawSprite(context, shops[kind as keyof typeof shops].building, position.x, position.y);
    }
    else if (kind === 'throne' || kind === 'demon-throne') drawSprite(context, kind === 'demon-throne' ? demonThrone : throne, x, y, 1.5);
    else if (kind === 'king' && characters) {
      const position = npcDrawingPosition(entity);
      drawImageSprite(context, characters.king, position.x, position.y, 32 / characters.king.height);
    }
  }
  if (options.returnPortal) drawSprite(context,returnRune,options.returnPortal.x,options.returnPortal.y+16);
  for (const entity of scene.entities) if (!hasDepth(entity)) drawEntity(entity);
  // 建物・木・NPC・宝箱を足元の奥行きで並べ、主人公の前後に分けて描く。
  // 同じ奥行きでは主人公を手前にする。
  function drawCounter(entity: PlacedEntity): void {
    if (!(entity.kind in shops)) return;
    const position = entityDrawingFrame(entity);
    drawSprite(context, shops[entity.kind as keyof typeof shops].counter, position.x, position.y);
  }
  // 同じ奥行きの売り場と店員を描いた後、カウンターを重ねる。
  function drawLayer(front: boolean): void {
    let counters: PlacedEntity[] = [], previousDepth = -Infinity;
    for (const entity of layeredEntities) {
      if (inFrontOfPlayer(entity) !== front) continue;
      const nextDepth = depth(entity);
      if (nextDepth !== previousDepth) { counters.forEach(drawCounter); counters = []; }
      drawEntity(entity);
      if (entity.kind in shops) counters.push(entity);
      previousDepth = nextDepth;
    }
    counters.forEach(drawCounter);
  }
  drawLayer(false);
  if (characters && scene.spawn) {
    const position = playerDrawingPosition(scene.spawn);
    drawImageSprite(context, characters.player, position.x, position.y, playerPlacement.drawingHeight / characters.player.height);
  }
  drawLayer(true);
}
