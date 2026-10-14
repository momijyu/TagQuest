import entries from './bounty-catalog.json';
import { record, whole, label } from './catalog-validation';
import { findEnemy } from './encounters/combat-config';

export interface BountyDefinition { enemyId:number; name:string; location:string; recommendedLevel:number; gold:number; bonus:number; title:string }
export const bountyCatalog: readonly BountyDefinition[] = entries.map(value=>{
  const entry=record(value), enemyId=whole(entry.enemyId,0,255);
  if(!findEnemy(enemyId)) throw new Error('賞金首の敵IDが不明です。');
  return {enemyId,name:label(entry.name),location:label(entry.location),recommendedLevel:whole(entry.recommendedLevel,1,99),gold:findEnemy(enemyId)!.reward?.gold ?? 0,bonus:whole(entry.bonus),title:label(entry.title)};
});
if(new Set(bountyCatalog.map(b=>b.enemyId)).size!==bountyCatalog.length) throw new Error('賞金首が重複しています。');
