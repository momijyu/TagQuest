import { castleFloor } from './data/tiles/castle-floor';
import { castleCarpet } from './data/tiles/castle-carpet';
import { castleWall } from './data/tiles/castle-wall';
import { castleWallLeft, castleWallRight } from './data/tiles/castle-side-wall';
import { castleWallTopLeft, castleWallTopRight } from './data/tiles/castle-wall-corner';
import { throne } from './data/objects/throne';
import { pillar } from './data/objects/pillar';
import { enemyReferenceUrl } from './data/encounters/enemy-illustrations';
import { enemyPixelSprites } from './data/encounters/enemy-pixels';
import { enemyCatalog } from './data/encounters/combat-config';
import { drawTile } from './renderer/tile';
import { drawSprite } from './renderer/sprite';
import { drawImageSprite } from './renderer/image-sprite';
import type { ImageSprite } from './data/characters/types';
import { drawTownPreview, townFloorTiles } from './renderer/town-preview';
import { drawCompiledScene } from './renderer/compiled-scene';
import { castleMoat } from './data/tiles/castle-moat';
import { castleBridge } from './data/tiles/castle-bridge';
import { drawShopPreview, townShops } from './renderer/shop-preview';
import { townHouses } from './data/objects/town-houses';
import { well } from './data/objects/well';
import { startLootPreview } from './renderer/loot-preview';
import { townNpcs } from './data/characters/town-npcs';
import { startGalleryPlay } from './game/gallery-play';
import { itemCatalog } from './data/items';
import { demonCastleMaterials } from './renderer/demon-castle-preview';
import { labels } from './editor/model';
import { caveMaterials } from './renderer/cave-preview';
import { drawForestPreview, forestMaterials } from './renderer/forest-preview';
import { drawWorldPreview, worldMaterials, worldLandmarks, worldLandmarkNames } from './renderer/world-preview';
import { adventureScenes } from './data/adventure-scenes';
import { adventureMaterials } from './renderer/adventure-materials';

import type { PlayCharacters } from './game/play-view';
import type { loadKingSprites } from './data/characters/king';

export async function startGallery(characters: PlayCharacters, kingSprites: Awaited<ReturnType<typeof loadKingSprites>>, isActive: () => boolean): Promise<() => void> {
  const playerSprites = characters.players;
  const disposers: (() => void)[] = [];
  try {
    for (const id of ['adventure-materials', 'world-locations', 'item-catalog', 'enemy-catalog', 'demon-castle-materials']) document.querySelector(`#${id}`)?.replaceChildren();
    const adventureMaterialList = document.querySelector<HTMLElement>('#adventure-materials');
    if (adventureMaterialList) for (const { name, sprite } of Object.values(adventureMaterials)) {
      const figure = document.createElement('figure'), canvas = document.createElement('canvas');
      canvas.width = 32; canvas.height = 32;
      canvas.setAttribute('aria-label', `${name}のドット絵`);
      const context = canvas.getContext('2d');
      if (context) drawSprite(context, sprite, (32 - sprite.width) / 2, 32 - sprite.height);
      const caption = document.createElement('figcaption'); caption.textContent = name;
      figure.append(canvas, caption); adventureMaterialList.append(figure);
    }

    const worldLocationList = document.querySelector<HTMLElement>('#world-locations');
    if (worldLocationList) for (const [kind, sprite] of Object.entries(worldLandmarks)) {
      const figure = document.createElement('figure'), canvas = document.createElement('canvas');
      canvas.width = sprite.width; canvas.height = sprite.height;
      canvas.setAttribute('aria-label', `${worldLandmarkNames[kind]}の全体マップ用ドット絵`);
      const context = canvas.getContext('2d'); if (context) drawSprite(context, sprite, 0, 0);
      const caption = document.createElement('figcaption'); caption.textContent = worldLandmarkNames[kind];
      figure.append(canvas, caption); worldLocationList.append(figure);
    }

    for (const [kind, material] of Object.entries(worldMaterials)) {
      const context = document.querySelector<HTMLCanvasElement>(`#world-${kind}`)?.getContext('2d');
      if (!context) continue;
      if ('size' in material) drawTile(context, material, 0, 0);
      else drawSprite(context, material, 0, 0);
    }
    const worldContext = document.querySelector<HTMLCanvasElement>('#world-preview')?.getContext('2d');
    if (worldContext) drawWorldPreview(worldContext);

    for (const [kind, material] of Object.entries(forestMaterials)) {
      const canvas = document.querySelector<HTMLCanvasElement>(`#forest-${kind}`);
      const context = canvas?.getContext('2d');
      if (!context) continue;
      if ('size' in material) drawTile(context, material, 0, 0);
      else drawSprite(context, material, 0, 0);
    }
    const forestContext = document.querySelector<HTMLCanvasElement>('#forest-preview')?.getContext('2d');
    if (forestContext) drawForestPreview(forestContext);
    const forestStageContext = document.querySelector<HTMLCanvasElement>('#forest-stage-preview')?.getContext('2d');
    if (forestStageContext) drawCompiledScene(forestStageContext, adventureScenes.forest, { king: characters.king, player: playerSprites.front });

    const itemList = document.querySelector<HTMLElement>('#item-catalog');
    if (itemList) {
      for (const item of itemCatalog) { const row = document.createElement('li'); row.textContent = item.name; itemList.append(row); }
    }

    for (const id of ['castle-exterior-preview', 'town-loot-overlay']) {
      const canvas = document.querySelector<HTMLCanvasElement>(`#${id}`);
      if (!canvas) throw new Error('街の表示領域が見つかりません。');
      canvas.width = adventureScenes.town.width * 16;
      canvas.height = adventureScenes.town.height * 16;
    }
    const npcPreviews = Object.entries(townNpcs).map(([kind, npc]) => {
      const canvas = document.querySelector<HTMLCanvasElement>(`#npc-${kind}`);
      if (!canvas) throw new Error('住民のプレビュー画面が見つかりません。');
      const context = canvas.getContext('2d');
      if (context) drawSprite(context, npc.sprite, 0, 0);
      return { context };
    });

    const wellCanvas = document.querySelector<HTMLCanvasElement>('#well-preview');
    const lootCanvas = document.querySelector<HTMLCanvasElement>('#loot-preview');
    const lootOverlay = document.querySelector<HTMLCanvasElement>('#town-loot-overlay');
    if (!wellCanvas || !lootCanvas || !lootOverlay) throw new Error('井戸・落とし物のプレビュー画面が見つかりません。');
    const wellContext = wellCanvas.getContext('2d');
    const lootContext = lootCanvas.getContext('2d');
    const lootOverlayContext = lootOverlay.getContext('2d');
    if (wellContext) drawSprite(wellContext, well, 0, 0);
    if (lootContext && lootOverlayContext) {
      const stopLootPreview = startLootPreview(lootOverlayContext, lootContext,
        adventureScenes.town.entities.filter(entity => entity.kind === 'loot')
          .map(entity => ({ x: entity.x, y: entity.y, phase: entity.parameters[0] })), isActive);
      disposers.push(stopLootPreview);
    }

    const housePreviews = Object.entries(townHouses).map(([kind, house]) => {
      const canvas = document.querySelector<HTMLCanvasElement>(`#house-${kind}`);
      if (!canvas) throw new Error('民家のプレビュー画面が見つかりません。');
      const context = canvas.getContext('2d');
      if (context) drawSprite(context, house.sprite, 0, 0);
      return { context };
    });

    const shopPreviews = Object.entries(townShops).map(([kind, shop]) => {
      const canvas = document.querySelector<HTMLCanvasElement>(`#shop-${kind}`);
      if (!canvas) throw new Error('お店のプレビュー画面が見つかりません。');
      const context = canvas.getContext('2d');
      if (context) drawShopPreview(context, shop);
      return { context };
    });

    const exteriorCanvas = document.querySelector<HTMLCanvasElement>('#castle-exterior-preview');
    if (!exteriorCanvas) throw new Error('城の外観のプレビュー画面が見つかりません。');
    const exteriorContext = exteriorCanvas.getContext('2d');
    const exteriorParts = Object.entries({ moat: castleMoat, bridge: castleBridge }).map(([kind, tile]) => {
      const canvas = document.querySelector<HTMLCanvasElement>(`#castle-${kind}`);
      if (!canvas) throw new Error('堀・橋のプレビュー画面が見つかりません。');
      return { tile, context: canvas.getContext('2d') };
    });
    if (exteriorContext && exteriorParts.every(({ context }) => context !== null)) {
      drawCompiledScene(exteriorContext, adventureScenes.town);
      for (const { tile, context } of exteriorParts) {
        if (context) drawTile(context, tile, 0, 0);
      }
    }

    const townPreviews = Object.entries(townFloorTiles).map(([kind, tile]) => {
      const canvas = document.querySelector<HTMLCanvasElement>(`#town-${kind}`);
      if (!canvas) throw new Error('街の床のプレビュー画面が見つかりません。');
      return { tile, context: canvas.getContext('2d') };
    });
    const townCanvas = document.querySelector<HTMLCanvasElement>('#town-preview');
    if (!townCanvas) throw new Error('街のプレビュー画面が見つかりません。');
    const townContext = townCanvas.getContext('2d');
    if (townContext && townPreviews.every(({ context }) => context !== null)) {
      for (const { tile, context } of townPreviews) {
        if (context) drawTile(context, tile, 0, 0);
      }
      drawTownPreview(townContext);
    }

    const tileCanvas = document.querySelector<HTMLCanvasElement>('#tile-preview');
    const repeatCanvas = document.querySelector<HTMLCanvasElement>('#repeat-preview');
    const frontCanvas = document.querySelector<HTMLCanvasElement>('#front-preview');
    const throneCanvas = document.querySelector<HTMLCanvasElement>('#throne-preview');
    const wallCanvas = document.querySelector<HTMLCanvasElement>('#wall-preview');
    const pillarCanvas = document.querySelector<HTMLCanvasElement>('#pillar-preview');
    const status = document.querySelector<HTMLParagraphElement>('#status');
    const enemyList = document.querySelector<HTMLElement>('#enemy-catalog');
    if (enemyList) for (const enemy of enemyCatalog) {
      const sprite = enemy.battleImage ? enemyPixelSprites[enemy.battleImage] : undefined;
      if (!sprite) continue;
      const card = document.createElement('figure');
      const preview = document.createElement('canvas'); preview.width = 64; preview.height = 56;
      preview.setAttribute('aria-label', `${enemy.name}のドット絵`);
      const context = preview.getContext('2d');
      if (context) drawSprite(context, sprite, (64 - sprite.width) / 2, 56 - sprite.height);
      const caption = document.createElement('figcaption'); caption.textContent = enemy.name;
      card.append(preview, caption); enemyList.append(card);
      const referenceUrl = enemyReferenceUrl(enemy.battleImage!);
      if (referenceUrl) {
        const details = document.createElement('details'), summary = document.createElement('summary');
        summary.textContent = '参考イラスト';
        const image = document.createElement('img'); image.width = 256; image.height = 256;
        image.alt = `${enemy.name}の原案イラスト`;
        details.addEventListener('toggle', () => { if (details.open && !image.getAttribute('src')) image.src = referenceUrl; });
        details.append(summary, image); card.append(details);
      }
    }
    const playerPreviews = Object.entries(playerSprites).map(([direction, sprite]) => {
      const canvas = document.querySelector<HTMLCanvasElement>(`#player-${direction}`);
      if (!canvas) throw new Error('プレイヤーのプレビュー画面が見つかりません。');
      return { sprite, context: canvas.getContext('2d') };
    });
    const kingPreviews = Object.entries(kingSprites).map(([pose, sprite]) => {
      const canvas = document.querySelector<HTMLCanvasElement>(`#king-${pose}`);
      if (!canvas) throw new Error('王様のプレビュー画面が見つかりません。');
      return { sprite, context: canvas.getContext('2d') };
    });

    if (!tileCanvas || !repeatCanvas || !frontCanvas || !throneCanvas || !wallCanvas || !pillarCanvas || !status) {
      throw new Error('起動に必要な画面要素が見つかりません。');
    }

    const tileContext = tileCanvas.getContext('2d');
    const roomWidth = adventureScenes.castle.width * 16;
    const roomHeight = adventureScenes.castle.height * 16;
    // 広くなった城全体を1ドット=2pxで表示し、内部の画像は十分な解像度で描く。
    const roomRenderScale = 8;
    for (const canvas of [repeatCanvas, frontCanvas]) {
      canvas.width = roomWidth * roomRenderScale;
      canvas.height = roomHeight * roomRenderScale;
      canvas.style.width = `${roomWidth * 2}px`;
    }
    const repeatContext = repeatCanvas.getContext('2d');
    const frontContext = frontCanvas.getContext('2d');
    const throneContext = throneCanvas.getContext('2d');
    const wallContext = wallCanvas.getContext('2d');
    const pillarContext = pillarCanvas.getContext('2d');

    if (
      tileContext && repeatContext && frontContext && throneContext && wallContext && pillarContext
      && playerPreviews.every(({ context }) => context !== null)
      && kingPreviews.every(({ context }) => context !== null)
    ) {
      // 素材確認用の「石・赤・赤・赤・石」。ゲームのマップ配置とは分離する。
      const sampleRow = [castleFloor, castleCarpet, castleCarpet, castleCarpet, castleFloor];

      sampleRow.forEach((tile, column) => {
        drawTile(tileContext, tile, column * castleFloor.size, 0);
      });

      function drawRoom(context: CanvasRenderingContext2D, player: ImageSprite): void {
        context.scale(roomRenderScale, roomRenderScale);
        drawCompiledScene(context, adventureScenes.castle, { king: kingSprites.standing, player });
      }

      drawRoom(repeatContext, playerSprites.back);
      drawRoom(frontContext, playerSprites.front);
      drawSprite(throneContext, throne, 0, 0);
      drawTile(wallContext, castleWallTopLeft, 0, 0);
      drawTile(wallContext, castleWall, castleFloor.size, 0);
      drawTile(wallContext, castleWallTopRight, castleFloor.size * 2, 0);
      drawTile(wallContext, castleWallLeft, 0, castleFloor.size);
      drawTile(wallContext, castleFloor, castleFloor.size, castleFloor.size);
      drawTile(wallContext, castleWallRight, castleFloor.size * 2, castleFloor.size);
      drawSprite(pillarContext, pillar, 0, 0);
      for (const { sprite, context } of [...playerPreviews, ...kingPreviews]) {
        if (context) drawImageSprite(context, sprite, 0, 0);
      }

      const previewsReady = townContext && exteriorContext && wellContext && lootContext && lootOverlayContext
        && [...townPreviews, ...exteriorParts, ...shopPreviews, ...housePreviews, ...npcPreviews].every(({ context }) => context !== null);
      status.hidden = Boolean(previewsReady);
      status.textContent = previewsReady ? '' : 'Canvas 2Dを利用できません。対応ブラウザで開いてください。';
    } else {
      status.textContent = 'Canvas 2Dを利用できません。対応ブラウザで開いてください。';
      status.hidden = false;
    }

    const galleryWalking = document.querySelector<HTMLElement>('#gallery-walking');
    if (galleryWalking) disposers.push(startGalleryPlay(galleryWalking, adventureScenes, characters, isActive));

    for (const [kind, material] of Object.entries(caveMaterials)) {
      const context = document.querySelector<HTMLCanvasElement>(`#cave-${kind}`)?.getContext('2d');
      if (context) drawTile(context, material, 0, 0);
    }
    const caveContext = document.querySelector<HTMLCanvasElement>('#cave-stage-preview')?.getContext('2d');
    if (caveContext) drawCompiledScene(caveContext, adventureScenes.cave, { king: characters.king, player: playerSprites.front });

    const demonCastleList = document.querySelector<HTMLElement>('#demon-castle-materials');
    if (demonCastleList) for (const [kind, material] of Object.entries(demonCastleMaterials)) {
      const figure = document.createElement('figure'), canvas = document.createElement('canvas');
      canvas.width = 'size' in material ? material.size : material.width;
      canvas.height = 'size' in material ? material.size : material.height;
      canvas.setAttribute('aria-label', `${labels[kind]}のドット絵`);
      const context = canvas.getContext('2d');
      if (context) {
        if ('size' in material) drawTile(context, material, 0, 0);
        else drawSprite(context, material, 0, 0);
      }
      const caption = document.createElement('figcaption'); caption.textContent = labels[kind];
      figure.append(canvas, caption); demonCastleList.append(figure);
    }
    const demonCastleContext = document.querySelector<HTMLCanvasElement>('#demon-castle-stage-preview')?.getContext('2d');
    if (demonCastleContext) drawCompiledScene(demonCastleContext, adventureScenes.demonCastle, { king: characters.king, player: playerSprites.front });
    return () => disposers.forEach(dispose => dispose());
  } catch (error) {
    disposers.forEach(dispose => dispose());
    throw error;
  }
}
