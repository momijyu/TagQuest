import type { SceneData } from '../codec/scenes';
import { bountyCatalog } from '../data/bounties';
import catalog from '../data/scene-catalog.json';
import { dialogueTemplates } from '../data/interactions';

/** 場所名はWeb側で推定する。マップIDの変更やNFCの名前データに依存しない。 */
export function inferLocationName(scene: SceneData): string {
  const namedTemplate = scene.entities.flatMap(entity => entity.dialogue?.type === 'template'
    ? [dialogueTemplates[entity.dialogue.id]?.locationName] : []).find(Boolean);
  if (namedTemplate) return namedTemplate;
  const kinds = new Set(scene.entities.map(entity => entity.kind));
  const tiles = new Set(Array.from(scene.tiles, id => catalog.tiles[id]));
  const roles = new Set(scene.entities.flatMap(entity => entity.dialogue?.type === 'template'
    ? [dialogueTemplates[entity.dialogue.id]?.storyRole] : []));
  if (kinds.has('demon-lord') || kinds.has('demon-throne') || tiles.has('demon-floor')) return '魔王城';
  if (roles.has('ruins') || tiles.has('ruins-floor') || kinds.has('stone-tablet')) return '古城の遺跡';
  if (roles.has('north-king')) return '北の城';
  if (kinds.has('throne') || tiles.has('marble')) return 'お城';
  if (kinds.has('cave-witch') || tiles.has('cave-floor') || tiles.has('cave-wall')) {
    return roles.has('crystal-cave') || scene.entities.filter(entity => entity.kind === 'cave-crystal').length >= 3
      ? '水晶の洞窟' : '洞窟';
  }
  if (['weapon-shop', 'armor-shop', 'item-shop', 'house-red', 'house-slate'].some(kind => kinds.has(kind))) {
    return tiles.has('sea') ? '海辺の集落' : tiles.has('meadow-flowers') ? '北の市場' : '街';
  }
  if (kinds.has('world-ruins')) return '東の大陸';
  if (kinds.has('world-town') && kinds.has('world-forest-entrance') && !kinds.has('world-cave')) return '北の大陸';
  if (kinds.has('tree') || kinds.has('forest-fairy') || tiles.has('forest-ground') && !tiles.has('world-mountain')) {
    if (roles.has('deep-forest')) return '奥深い森';
    if (tiles.has('meadow-flowers') && !scene.encounter?.enabled) return '妖精の花園';
    return '森';
  }
  if (tiles.has('world-mountain') || tiles.has('world-forest') || tiles.has('sea')) return 'フィールド';
  if (tiles.has('grass')) return '草原';
  return '冒険の地';
}

export function sceneRecommendation(scene: SceneData): {min:number;max:number}|null {
  const bounty=bountyCatalog.find(b=>scene.entities.some(e=>e.battleEvent?.enemyId===b.enemyId));
  if(bounty) return {min:bounty.recommendedLevel,max:bounty.recommendedLevel};
  const tiles=new Set(Array.from(scene.tiles,id=>catalog.tiles[id]));
  if(tiles.has('bog-ground')) return {min:15,max:22};
  if(tiles.has('ice-ground')) return {min:25,max:35};
  if(tiles.has('ember-ground')) return {min:35,max:45};
  if(scene.encounter?.enabled && scene.encounter.enemies?.every(e=>e.enemyId===1 || e.enemyId===2)) return {min:1,max:5};
  return null;
}
