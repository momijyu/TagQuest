import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from '../node_modules/vite/dist/node/index.js';
const root=fileURLToPath(new URL('../..',import.meta.url)),out=mkdtempSync(join(tmpdir(),'tq-save-recovery-'));
try {
  await build({configFile:false,logLevel:'silent',build:{lib:{entry:Object.fromEntries([
    ['world','game/world'],['items','data/items'],['player','game/player-state'],['config','data/encounters/combat-config'],['facilities','data/facilities'],
  ].map(([name,file])=>[name,join(root,`web/src/${file}.ts`)])),formats:['es'],fileName:(_,name)=>`${name}.mjs`},outDir:out}});
  const read=name=>import(pathToFileURL(join(out,`${name}.mjs`)).href);
  const {createWorldGame}=await read('world'),{playerConfig}=await read('config'),{facilityConfig}=await read('facilities');
  const {findItem}=await read('items'),{createPlayerState}=await read('player');
  for(const prize of facilityConfig.casinoPrizes) {
    const cost=prize.coins*facilityConfig.coinGoldRate;assert.ok(findItem(prize.itemId).sellPrice<=cost);
    const hero=createPlayerState({...playerConfig,initialGold:cost});assert.equal(hero.buyCoins(prize.coins).ok,true);assert.equal(hero.redeem(prize.itemId).ok,true);assert.equal(hero.sell(prize.itemId).ok,findItem(prize.itemId).sellable!==false);assert.ok(hero.gold<=cost,'exchange/sale never generates gold');
  }
  assert.equal(facilityConfig.casinoPrizes.find(prize=>prize.itemId===41).coins,800);assert.equal(findItem(75).sellPrice,500);
  const key='tagquest.play-save.v1';
  const memory=()=>{const disk=new Map();return {disk,getItem:k=>disk.get(k)??null,setItem:(k,v)=>disk.set(k,v),removeItem:k=>disk.delete(k)};};
  const scene=id=>({id,width:6,height:6,spawn:{x:32,y:32},tiles:new Uint8Array(36).fill(7),entities:[]});
  const options={player:{...playerConfig,name:'記録の勇者',initialExperience:900,initialGold:5000,initialItems:[{itemId:71,quantity:1}]},initialEquipment:[71]};
  const source=[scene(0)],signature=JSON.stringify(source);
  const disk=memory();let game=createWorldGame(source,0,()=>.5,{...options,storage:disk});game.save();game.move('right');
  const otherSource=[scene(7)];const other=createWorldGame(otherSource,7,()=>.5,{storage:disk});other.move('left');
  const original=JSON.parse(disk.getItem(key));original.worlds[signature].stageId=99;const damaged=JSON.stringify(original);disk.setItem(key,damaged);
  game=createWorldGame(source,0,()=>.5,{storage:disk});assert.equal(game.status.name,original.player.name);assert.equal(game.status.experience,original.player.experience);assert.equal(game.status.gold,5000);assert.equal(game.status.equipment.accessory,71);
  assert.match(game.saveStatus,/主人公を保持/);assert.equal(disk.getItem(key),damaged,'opening a damaged world never deletes its original save');
  game.save();assert.equal(disk.getItem(`${key}.recovery`),damaged);
  const repaired=JSON.parse(disk.getItem(key));assert.equal(repaired.worlds[signature].stageId,0);assert.deepEqual(repaired.worlds[JSON.stringify(otherSource)],original.worlds[JSON.stringify(otherSource)]);
  assert.equal(repaired.player.experience,original.player.experience);assert.match(game.saveStatus,/読み込めなかった/);
  const second=memory();let hero=createWorldGame(source,0,()=>.5,{...options,storage:second});hero.save();hero.move('right');
  const previous=second.getItem(key);hero.rename('新しい名前');assert.equal(second.getItem(`${key}.backup`),previous);
  second.setItem(key,'{broken');hero=createWorldGame(source,0,()=>.5,{storage:second});assert.equal(hero.status.name,'記録の勇者');assert.equal(hero.status.level,10);assert.equal(hero.status.gold,5000);assert.match(hero.saveStatus,/バックアップから復元/);assert.equal(second.getItem(key),'{broken');
  hero.save();assert.equal(second.getItem(`${key}.recovery`),'{broken');assert.equal(second.getItem(`${key}.backup`),previous,'recovery does not replace a good backup with damaged JSON');
  const fresh=memory();fresh.setItem(key,'broken-without-backup');const initial=createWorldGame(source,0,()=>.5,{storage:fresh});assert.equal(fresh.getItem(key),'broken-without-backup');initial.save();assert.equal(fresh.getItem(`${key}.recovery`),'broken-without-backup');
  const unwriteable=memory();unwriteable.setItem(key,'broken-to-preserve');const failing={...unwriteable,setItem(){throw new Error('quota');}};const cannotRecover=createWorldGame(source,0,()=>.5,{storage:failing});cannotRecover.save();assert.equal(unwriteable.getItem(key),'broken-to-preserve');assert.match(cannotRecover.saveStatus,/保存できません/);
  const shared=memory();const first=createWorldGame(source,0,()=>.5,{storage:shared});first.save();const next=createWorldGame(otherSource,7,()=>.5,{storage:shared});next.move('right');
  const latest=shared.getItem(key),before=first.position;assert.equal(first.saveConflict,true);assert.equal(first.rename('上書き').ok,false);assert.equal(first.move('right'),false);assert.deepEqual(first.position,before);assert.equal(typeof first.itemName(71),'string');assert.equal(typeof first.gearBonus(71,'attack'),'number');
  first.save();first.reset();assert.equal(shared.getItem(key),latest,'a stale tab cannot save or reset another tab');assert.equal(Object.keys(JSON.parse(latest).worlds).length,2);
  const resumed=createWorldGame(source,0,()=>.5,{storage:shared});assert.equal(resumed.saveConflict,false);resumed.move('left');assert.equal(Object.keys(JSON.parse(shared.getItem(key)).worlds).length,2);
  const resetter=createWorldGame(source,0,()=>.5,{storage:shared});resetter.reset();assert.equal(shared.getItem(`${key}.backup`),null);assert.equal(shared.getItem(`${key}.recovery`),null);assert.equal(resetter.status.level,1);
  const victories=Array.from({length:9},(_,index)=>Math.max(index,8-index)).reduce((a,b)=>a+b,0);
  assert.ok(victories/81*facilityConfig.cardPayout-facilityConfig.cardBet<=0,'even choosing the best side each round cannot generate positive average profit');
  const locks=JSON.parse(readFileSync(join(root,'web/scripts/small-world-lock.json'),'utf8'));for(const[file,hash] of Object.entries(locks))assert.equal(createHash('sha256').update(readFileSync(join(root,file))).digest('hex'),hash,file);
  console.log('Save recovery: world-only repair/hero and other worlds retained, raw recovery/good backup/quota safety, stale-tab mutation/reset blocking and reload, card economy and small-world hashes passed.');
} finally {rmSync(out,{recursive:true,force:true});}
