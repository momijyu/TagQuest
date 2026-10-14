import type { SceneData } from '../codec/scenes';
import { inferLocationName } from '../game/location-names';
import catalog from '../data/scene-catalog.json';

export const isOverworld = (scene: SceneData) => scene.entities.some(entity => entity.kind.startsWith('world-'));
/** Follow incoming entrances to put an indoor player's pin on the correct continent. */
export function worldMapAnchor(stages: readonly SceneData[], stageId: number, position: {x:number;y:number}, mapId?: number) {
  const current = stages.find(stage => stage.id === stageId)!;
  if (mapId === stageId || isOverworld(current) && mapId === undefined) return { scene: current, x: (position.x + 8) / 16, y: (position.y + 24) / 16, exact: true };
  const queue = [{ id: stageId }], seen = new Set<number>();
  for (let n = 0; n < queue.length; n++) {
    const id = queue[n].id; if (seen.has(id)) continue; seen.add(id);
    for (const stage of stages) for (const exit of stage.exits ?? []) if (exit.targetStageId === id) {
      if (mapId === stage.id || mapId === undefined && isOverworld(stage)) return {scene:stage,x:exit.x+.5,y:exit.y+.5,exact:false};
      queue.push({id:stage.id});
    }
  }
  const selected = stages.find(stage => stage.id === mapId) ?? current;
  return {scene:selected,x:selected.id===stageId?(position.x+8)/16:null,y:selected.id===stageId?(position.y+24)/16:null,exact:selected.id===stageId};
}
const terrainColors: Record<string,string> = { sea:'#346b8e', water:'#346b8e', empty:'#14202b', grass:'#83ad61', dirt:'#998a59', brick:'#a2a18a', bridge:'#bf9a58', sand:'#d3c489', 'world-mountain':'#8d826b', 'world-forest':'#386540', 'forest-ground':'#536d45', 'cave-wall':'#393d49', 'cave-floor':'#737080', 'demon-floor':'#6c607c', 'demon-carpet':'#795280', 'bog-ground':'#506252', 'ice-ground':'#c6e0e8', 'ember-ground':'#a2533d', 'ruins-floor':'#8c9284' };
export function mapLandmarks(scene: SceneData, stages: readonly SceneData[], visited: readonly number[]) {
  const landmarks = (scene.exits ?? []).filter(exit => visited.includes(exit.targetStageId)).map(exit => ({
    ...exit, name: inferLocationName(stages.find(stage => stage.id === exit.targetStageId)!),
    icon: scene.entities.find(entity => entity.x === exit.x*16 && entity.y === exit.y*16)?.kind ?? '入口',
  }));
  // Indoor destinations, including nests and the port, share their region entrance on the continent.
  if (isOverworld(scene)) for (const target of stages) {
    if (!visited.includes(target.id) || target.id === scene.id || isOverworld(target) || landmarks.some(place => place.targetStageId === target.id)) continue;
    const anchor = worldMapAnchor(stages,target.id,{x:0,y:0},scene.id);
    if (anchor.x === null || anchor.y === null) continue;
    landmarks.push({x:Math.floor(anchor.x),y:Math.floor(anchor.y),targetStageId:target.id,targetX:0,targetY:0,direction:'front',name:inferLocationName(target),icon:'拠点'});
  }
  return landmarks;
}
export function mapBearing(x: number, y: number, fromX: number | null, fromY: number | null): string {
  if (fromX === null || fromY === null) return '';
  const dx=Math.round(x+.5-fromX),dy=Math.round(y+.5-fromY);
  return [dx ? `${dx>0?'東':'西'}${Math.abs(dx)}マス` : '',dy ? `${dy>0?'南':'北'}${Math.abs(dy)}マス` : ''].filter(Boolean).join('・') || '現在地付近';
}
export function paintWorldMap(canvas: HTMLCanvasElement, scene: SceneData, landmarks: ReturnType<typeof mapLandmarks>): void {
  const scale = 10; canvas.width=scene.width*scale; canvas.height=scene.height*scale;
  const context=canvas.getContext('2d'); if(!context) return;
  context.imageSmoothingEnabled=false;
  for(let y=0;y<scene.height;y++) for(let x=0;x<scene.width;x++) {
    const kind=catalog.tiles[scene.tiles[y*scene.width+x]];
    context.fillStyle=terrainColors[kind] ?? (kind.includes('wall') ? '#6c7180' : '#ddd9c7');
    context.fillRect(x*scale,y*scale,scale,scale);
  }
  landmarks.forEach((landmark,index)=>{
    context.fillStyle='#f4de8e';context.fillRect(landmark.x*scale+1,landmark.y*scale+1,8,8);
    context.fillStyle='#101820';context.font='8px sans-serif';context.textAlign='center';context.fillText(String(index+1),landmark.x*scale+5,landmark.y*scale+8);
  });
}
