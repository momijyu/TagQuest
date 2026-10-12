import { townGrass } from '../data/tiles/town-grass';
import { townDirt } from '../data/tiles/town-dirt';
import { forestGround } from '../data/tiles/forest-ground';
import { tree } from '../data/objects/tree';
import { drawTile } from './tile';
import { drawSprite } from './sprite';
import forestSource from '../../../compiler/maps/forest.json';
import { parseWorld, toSceneData } from '../editor/model';
import { drawCompiledScene } from './compiled-scene';
import { lootSparkleFrames } from '../data/effects/loot-sparkle';

export const forestMaterials = { grass: townGrass, ground: forestGround, tree } as const;
export const forestStagePreview = toSceneData(parseWorld(forestSource).stages[0]);

export function drawForestStagePreview(context: CanvasRenderingContext2D): void {
  drawCompiledScene(context, forestStagePreview);
  for (const entity of forestStagePreview.entities) if (entity.kind === 'loot') drawSprite(context, lootSparkleFrames[2], entity.x, entity.y);
}

/** 素材の色と敷き詰めを確認する見本。実際のステージ配置とは分離する。 */
export function drawForestPreview(context: CanvasRenderingContext2D): void {
  for (let y = 0; y < 9; y++) for (let x = 0; x < 11; x++) {
    const pathX = y < 4 ? 5 : 6;
    const path = x === pathX || y === 4 && x === 5;
    drawTile(context, path ? townDirt : x < 4 ? townGrass : forestGround, x * 16, y * 16);
  }
  for (const [x, y] of [[16,16], [96,0], [48,80], [128,80]]) drawSprite(context, tree, x, y);
}
