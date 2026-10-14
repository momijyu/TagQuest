import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../node_modules/vite/dist/node/index.js';
const root=fileURLToPath(new URL('../..',import.meta.url)),out=mkdtempSync(join(tmpdir(),'tq-ultimate-'));
try {
  await build({configFile:false,logLevel:'silent',build:{lib:{entry:Object.fromEntries([
    ['presets','editor/adventure-presets'],['model','editor/model'],['validation','editor/validation'],['world','game/world'],['walking','game/walking'],['battle','game/battle'],['player','game/player-state'],['config','data/encounters/combat-config'],['items','data/items'],['atlas','renderer/world-map'],['locations','game/location-names'],['art','data/objects/ultimate-facilities'],['facilities','data/facilities'],
  ].map(([name,file])=>[name,join(root,`web/src/${file}.ts`)])),formats:['es'],fileName:(_,name)=>`${name}.mjs`},outDir:out}});
  const read=name=>import(pathToFileURL(join(out,`${name}.mjs`)).href);
  const {createAdventurePreset}=await read('presets'),{toSceneData}=await read('model'),{validateWorld}=await read('validation');
  const {createWorldGame}=await read('world'),{canStand,interactionTarget}=await read('walking'),{createPlayerState}=await read('player'),{createBattle}=await read('battle');
  const {playerConfig,enemyCatalog}=await read('config'),{findItem}=await read('items'),{worldMapAnchor,mapLandmarks}=await read('atlas'),{inferLocationName}=await read('locations'),{facilityBuildings}=await read('art');
  const lock=JSON.parse(readFileSync(join(root,'web/scripts/small-world-lock.json'),'utf8'));
  for(const [path,hash] of Object.entries(lock)) assert.equal(createHash('sha256').update(readFileSync(join(root,path))).digest('hex'),hash,`${path}: immutable small-world bytes`);
  assert.deepEqual(readdirSync(join(root,'art/adventure-small')).sort(),Object.keys(lock).filter(path=>path.startsWith('art/adventure-small/')).map(path=>path.split('/').at(-1)).sort());
  for(const [size,count] of [['normal',16],['large',28],['small',6]]) {
    const world=createAdventurePreset(size);assert.equal(world.stages.length,count);
    assert.deepEqual(validateWorld(world).filter(issue=>!issue.text.includes('開始位置なし')),[],`${size}: every authored route and interaction`);
    const game=createWorldGame(world.stages.map(toSceneData),0,()=>.99999);
    assert.equal(game.facilitiesEnabled,size!=='small');
    if(size==='small') assert.ok(!game.stages.some(scene=>scene.entities.some(entity=>entity.kind==='casino-building')));
  }
  for(const sprite of Object.values(facilityBuildings)) assert.ok(sprite.pixels.every(row=>row.length===64&&[...row].every(code=>code==='.'||parseInt(code,36)<sprite.palette.length)));
  const hero=createPlayerState({...playerConfig,initialGold:2000,initialItems:[{itemId:4,quantity:1},{itemId:5,quantity:1},{itemId:17,quantity:5},{itemId:18,quantity:2}]});
  hero.equip(4);const attack=hero.definition.stats.attack;
  assert.equal(hero.enhance(4).ok,true);assert.equal(hero.definition.stats.attack,attack+3);
  assert.equal(hero.enhance(4).ok,true);assert.equal(hero.definition.stats.attack,attack+6);assert.equal(hero.gold,1650);
  hero.buyCoins(100);hero.recruit(3);
  const before=hero.snapshot();assert.equal(hero.enhance(4).ok,false);assert.deepEqual(hero.snapshot(),before);
  const restored=createPlayerState();restored.restore(before);assert.equal(restored.definition.stats.attack,attack+6);assert.equal(restored.coins,100);assert.equal(restored.companion,3);assert.deepEqual(restored.monsters,[3]);
  const smallHero=createPlayerState(undefined,undefined,false);smallHero.restore(before);assert.equal(smallHero.definition.stats.attack,attack,'small runtime does not apply facility enhancements');
  for(const data of [{...before,coins:-1},{...before,enhancements:[[4,3]]},{...before,monsters:[15]},{...before,companion:1}]) assert.throws(()=>createPlayerState().restore(data));
  const enemy={...enemyCatalog.find(e=>e.id===3),stats:{hp:9999,attack:1,defense:0,magic:0}};
  const metal=createPlayerState();metal.addItem(39,1);metal.equip(39);
  const metalBattle=createBattle({...enemy,family:'metal',stats:{...enemy.stats,defense:50}},{player:metal.definition});metalBattle.attack();assert.equal(metalBattle.feedback.amount,28);
  const luck=createPlayerState();luck.addItem(40,1);luck.equip(40);const critical=createBattle(enemy,{player:luck.definition,random:()=>.1499});critical.attack();assert.equal(critical.feedback.amount,20);assert.match(critical.text,/会心/);
  const helper=createBattle(enemy,{support:{name:'森オオカミ',kind:'attack',amount:20}});assert.equal(helper.callMonster().ok,true);helper.advance();helper.advance();assert.equal(helper.callMonster().ok,false);
  const healer=createBattle(enemy,{playerHp:10,support:{name:'リーフジェル',kind:'heal',amount:15}});assert.equal(healer.callMonster().ok,true);assert.equal(healer.playerHp,27);
  const book=createPlayerState();book.addItem(41,1);book.setVitals({hp:1,mp:0,poisoned:false});assert.equal(book.useItem(41).ok,true);assert.equal(book.experience,500);assert.equal(book.level,8);assert.equal(findItem(41).price,800);assert.equal(findItem(41).sellPrice,0);assert.equal(findItem(41).sellable,false);assert.equal(book.vitals.hp,book.definition.stats.hp);

  let roll=.5;
  const disk=new Map(),storage={getItem:key=>disk.get(key)??null,setItem:(key,value)=>disk.set(key,value),removeItem:key=>disk.delete(key)};
  function service(kind,extra={}) {
    const scene={id:0,width:6,height:7,spawn:{x:16,y:48},tiles:new Uint8Array(42).fill(7),entities:[{kind,x:16,y:16,parameters:[]}]};
    const marker={...scene,id:1,entities:[{kind:'blacksmith',x:64,y:16,parameters:[]}]};
    const game=createWorldGame([scene,marker],0,()=>roll,{player:{...playerConfig,initialGold:2000,initialItems:[]},...extra});
    game.move('back');game.move('back');game.interact();while(game.message)game.interact();return game;
  }
  const casino=service('casino-dealer');assert.equal(casino.buyCoins(1000).ok,true);assert.equal(casino.status.gold,1000);assert.equal(casino.race(2).ok,true);assert.equal(casino.status.coins,1020);
  const raceBefore=casino.status.coins;assert.equal(casino.race(4).ok,false);assert.equal(casino.status.coins,raceBefore);
  assert.equal(casino.startCard().ok,true);assert.equal(casino.casinoCard,5);assert.equal(casino.startCard().ok,false);assert.equal(casino.buyCoins(100).ok,false);
  roll=.8;assert.equal(casino.guessCard(true).ok,true);assert.equal(casino.status.coins,1022);assert.equal(casino.guessCard(true).ok,false);
  assert.equal(casino.redeem(39).ok,true);assert.equal(casino.status.coins,522);assert.ok(casino.inventory.some(item=>item.itemId===39));
  roll=.5;casino.startCard();casino.closeShop();assert.equal(casino.casinoCard,null);assert.equal(casino.status.coins,517,'closing forfeits a paid card round');
  const poor=service('casino-dealer',{player:{...playerConfig,initialGold:0}});const poorBefore=poor.status;assert.equal(poor.buyCoins(10).ok,false);assert.equal(poor.race(0).ok,false);assert.equal(poor.startCard().ok,false);assert.equal(poor.redeem(39).ok,false);assert.deepEqual(poor.status,poorBefore);

  const scenes=createAdventurePreset('normal').stages.map(toSceneData),district=scenes.find(scene=>inferLocationName(scene)==='旅人の港と商人街');
  let game=createWorldGame(scenes,district.id,()=>.99999,{storage,player:{...playerConfig,initialGold:2000,initialItems:[]}});
  const drain=()=>{for(let n=0;game.message&&!game.encounter;n++){assert.ok(n<10);game.interact();}};
  function approach(kind) {
    const scene={...game.scene,entities:game.visibleEntities},queue=[{...game.position,path:[]}],seen=new Set(),moves=[['back',0,-16],['front',0,16],['left',-16,0],['right',16,0]];
    for(let i=0;i<queue.length;i++){const p=queue[i],key=`${p.x},${p.y}`;if(seen.has(key))continue;seen.add(key);
      for(const [direction] of moves){const index=interactionTarget(scene,p,direction);if(index!==undefined&&scene.entities[index].kind===kind){for(const move of p.path){assert.equal(game.move(move),true);drain();}game.move(direction);game.interact();drain();return;}}
      for(const [direction,dx,dy] of moves)if(Array.from({length:16},(_,n)=>({x:p.x+dx*(n+1)/16,y:p.y+dy*(n+1)/16})).every(pos=>canStand(scene,pos)))queue.push({x:p.x+dx,y:p.y+dy,path:[...p.path,direction]});
    }assert.fail(`cannot approach ${kind}`);
  }
  approach('shrine-keeper');assert.equal(game.fastTravel(2).ok,false);game.closeShop();
  approach('fortune-teller');assert.ok(game.fortune.some(text=>text.includes('蜘蛛の毒巣')));game.closeShop();
  approach('well-entrance');assert.equal(game.travelFacility().ok,true);assert.equal(inferLocationName(game.scene),'地下水路と闇市');
  const gate=game.scene.entities.find(entity=>entity.kind==='iron-gate');assert.equal(canStand({...game.scene,entities:game.visibleEntities},{x:gate.x,y:gate.y}),false);
  approach('black-market-dealer');assert.equal(game.buy(42).ok,true);assert.ok(!game.visibleEntities.some(entity=>entity.kind==='iron-gate'));game.closeShop();
  game=createWorldGame(scenes,district.id,()=>.99999,{storage});assert.equal(inferLocationName(game.scene),'地下水路と闇市');assert.ok(!game.visibleEntities.some(entity=>entity.kind==='iron-gate'));
  // Return along the actual authored exit.
  while(game.position.x<128)game.move('right');while(game.position.x>128)game.move('left');while(game.scene.id!==district.id){assert.equal(game.move('front'),true);drain();}
  approach('house-slate');assert.equal(game.travelFacility().ok,true);assert.equal(inferLocationName(game.scene),'古い民家の地下蔵');
  while(game.position.y<9*16)game.move('front');game.move('front');assert.equal(game.scene.id,district.id);
  approach('captain');assert.equal(game.travelFacility().ok,true);assert.equal(inferLocationName(game.scene),'沈没神殿');assert.ok(!game.visibleEntities.some(entity=>entity.kind==='iron-gate'));
  approach('captain');assert.equal(game.travelFacility().ok,true);assert.equal(game.scene.id,district.id);
  approach('shrine-keeper');assert.equal(game.fastTravel(scenes.find(scene=>inferLocationName(scene)==='地下水路と闇市').id).ok,true);assert.equal(game.safeSteps,6);
  const anchor=worldMapAnchor(scenes,game.scene.id,game.position);assert.equal(anchor.scene.id,2);assert.equal(anchor.exact,false);
  const exact=worldMapAnchor(scenes,2,{x:160,y:96});assert.deepEqual([exact.x,exact.y],[10.5,7.5]);assert.ok(mapLandmarks(scenes.find(scene=>scene.id===2),scenes,[1]).some(place=>place.targetStageId===1));
  assert.ok(mapLandmarks(scenes.find(scene=>scene.id===2),scenes,[6,7]).some(place=>place.name==='蜘蛛の毒巣'),'visited nests appear on their continent');

  const recruitScene={id:0,width:6,height:6,spawn:{x:16,y:32},tiles:new Uint8Array(36).fill(7),entities:[{kind:'corral-keeper',x:64,y:0,parameters:[]}],encounter:{enabled:true,rate:100,enemyId:3}};
  const oneHp={...enemyCatalog.find(enemy=>enemy.id===3),stats:{hp:1,attack:1,defense:0,magic:0}};
  for(const [chance,recruits] of [[.04999,true],[.05,false]]) {
    let draw=0;const recruitGame=createWorldGame([recruitScene],0,()=>draw,{enemies:[oneHp],storage});
    recruitGame.move('right');recruitGame.battle.attack();draw=chance;recruitGame.finishEncounter('victory');
    assert.equal(Boolean(recruitGame.pendingRecruit),recruits);
    if(recruits){assert.equal(recruitGame.move('front'),false);while(recruitGame.message)recruitGame.interact();assert.equal(recruitGame.recruitMonster(true).ok,true);assert.equal(recruitGame.status.companion,3);assert.equal(recruitGame.recruitMonster(true).ok,false);while(recruitGame.message)recruitGame.interact();
      const resumed = createWorldGame([recruitScene],0,()=>.99999,{enemies:[oneHp],storage});assert.equal(resumed.status.companion,3);assert.equal(resumed.pendingRecruit,null);
      const otherWorld = createWorldGame([{...recruitScene,id:1}],1,()=>0,{enemies:[oneHp],storage});otherWorld.move('right');assert.equal(otherWorld.battle.support.name,'森オオカミ');assert.equal(otherWorld.battle.callMonster().ok,true);
    }
    const resetOwner=createWorldGame([recruitScene],0,()=>.5,{enemies:[oneHp],storage});resetOwner.reset();
  }
  console.log('Ultimate: immutable small files, all facilities/routes, map coordinates/visited pins, forge +1/+2 and save, metal/critical weapons, coins/race/cards/prizes, keys/gates/house/ship, fast travel, fortune, recruitment boundary and once-per-battle support passed.');
} finally {rmSync(out,{recursive:true,force:true});}
