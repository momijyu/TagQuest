import stageSource from '../../../compiler/maps/demon-castle.json';
import { demonCastleTiles } from '../data/tiles/demon-castle';
import { demonPillar, demonThrone } from '../data/objects/demon-castle';
import { parseWorld, toSceneData } from '../editor/model';
import { drawCompiledScene } from './compiled-scene';

export const demonCastleMaterials = { ...demonCastleTiles, 'demon-pillar': demonPillar, 'demon-throne': demonThrone } as const;
export const demonCastleStagePreview = toSceneData(parseWorld(stageSource).stages[0]);
export function drawDemonCastleStagePreview(context: CanvasRenderingContext2D): void {
  context.fillStyle = '#17141e';
  context.fillRect(0, 0, demonCastleStagePreview.width * 16, demonCastleStagePreview.height * 16);
  drawCompiledScene(context, demonCastleStagePreview);
}
