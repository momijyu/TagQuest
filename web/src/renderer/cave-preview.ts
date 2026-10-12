import caveSource from '../../../compiler/maps/cave.json';
import { caveFloor, caveWall } from '../data/tiles/cave';
import { parseWorld, toSceneData } from '../editor/model';
import { drawCompiledScene } from './compiled-scene';

export const caveMaterials = { floor: caveFloor, wall: caveWall } as const;
export const caveStagePreview = toSceneData(parseWorld(caveSource).stages[0]);
export function drawCaveStagePreview(context: CanvasRenderingContext2D): void {
  drawCompiledScene(context, caveStagePreview);
}
