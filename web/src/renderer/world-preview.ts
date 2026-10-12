import worldSource from '../../../compiler/maps/world.json';
import { parseWorld, toSceneData } from '../editor/model';
import { worldSea } from '../data/tiles/world-sea';
import { worldSand } from '../data/tiles/world-sand';
import { worldMountain, worldForest } from '../data/objects/world-terrain';
import { worldLocations, worldLocationNames } from '../data/objects/world-locations';
import { drawCompiledScene } from './compiled-scene';

export const worldMaterials = { sea: worldSea, sand: worldSand, mountain: worldMountain, forest: worldForest } as const;
export const worldLandmarks = worldLocations;
export const worldLandmarkNames = worldLocationNames;
export const worldPreviewScene = toSceneData(parseWorld(worldSource).stages[0]);

export function drawWorldPreview(context: CanvasRenderingContext2D): void {
  drawCompiledScene(context, worldPreviewScene);
}
