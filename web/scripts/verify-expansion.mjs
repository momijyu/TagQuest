import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../node_modules/vite/dist/node/index.js';
const root=fileURLToPath(new URL('../..',import.meta.url)),out=mkdtempSync(join(tmpdir(),'tq-expansion-'));
try {
  await build({configFile:false,logLevel:'silent',build:{lib:{entry:Object.fromEntries([
    ['presets','editor/adventure-presets'],['model','editor/model'],['validation','editor/validation'],['world','game/world'],['walking','game/walking'],['battle','game/battle'],['player','game/player-state'],['config','data/encounters/combat-config'],['items','data/items'],['locations','game/location-names'],['renderer','renderer/compiled-scene'],['bounties','data/bounties'],['services','data/objects/service-buildings'],
  ].map(([name,file])=>[name,join(root,`web/src/${file}.ts`)])),formats:['es'],fileName:(_,name)=>`${name}.mjs`},outDir:out}});
  const read=name=>import(pathToFileURL(join(out,`${name}.mjs`)).href);
  const {createAdventurePreset}=await read('presets'),{toSceneData}=await read('model'),{validateWorld}=await read('validation');
  const {createWorldGame}=await read('world'),{canStand,interactionTarget}=await read('walking'),{createBattle}=await read('battle'),{createPlayerState}=await read('player');
  const {playerConfig,enemyCatalog,parseEnemyDefinitions}=await read('config'),{findItem,parseItemCatalog}=await read('items'),{bountyCatalog}=await read('bounties');
  const {inferLocationName,sceneRecommendation}=await read('locations'),{entityCollisionFrame}=await read('renderer'),{serviceBuildings}=await read('services');
  for(const [size,count] of [['normal',16],['large',28],['small',6]]) {
    const world=createAdventurePreset(size); assert.equal(world.stages.length,count);
    const issues=validateWorld(world).filter(issue=>!issue.text.includes('開始位置なし')); assert.deepEqual(issues,[],`${size}: all services, gates and boss approaches are reachable`);
    if(size==='small') {assert.ok(!world.stages.some(s=>s.entities.some(e=>e.kind==='unique-monster')));continue;}
    const scenes=world.stages.map(toSceneData),nest=scenes.filter(s=>s.entities.some(e=>e.kind==='unique-monster'));
    assert.deepEqual(nest.map(s=>s.entities.find(e=>e.kind==='unique-monster').battleEvent.enemyId),[15,16,17]);
    for(const scene of nest) {assert.equal(inferLocationName(scene),bountyCatalog.find(b=>b.enemyId===scene.entities[0].battleEvent.enemyId).location);assert.ok(sceneRecommendation(scene).min>=18);}
    const town=scenes.find(s=>s.id===1); for(const kind of ['inn-building','tavern','church','bounty-board','guild-master','sister','innkeeper']) assert.ok(town.entities.some(e=>e.kind===kind));
    for(const scene of scenes.filter(s=>s.encounter?.enemyId>=18)) {assert.equal(scene.encounter.rate,size==='large'?9:6);assert.equal(scene.encounter.enemies.length,2);}
    assert.equal(scenes.find(s=>s.id===2).encounter.rate,size==='large'?6:4);
  }
  for(const kind of Object.keys(serviceBuildings)) {
    const sprite=serviceBuildings[kind]; assert.equal(sprite.width,64);assert.equal(sprite.height,64);
    assert.ok(sprite.pixels.every(row=>row.length===64&&[...row].every(code=>code==='.'||parseInt(code,36)<sprite.palette.length)));
    assert.deepEqual(entityCollisionFrame({kind,x:48,y:32,parameters:[]}),{x:32,y:64,width:64,height:32});
  }
  const venom={...enemyCatalog.find(e=>e.id===18),stats:{hp:999,attack:10,defense:0,magic:0}};
  const cloak=createPlayerState();cloak.addItem(31,1);cloak.setVitals({hp:30,mp:10,poisoned:true});cloak.equip(31);assert.equal(cloak.vitals.poisoned,false);
  const protectedBattle=createBattle(venom,{player:cloak.definition,poisoned:true});protectedBattle.guard();protectedBattle.advance();assert.equal(protectedBattle.poisoned,false);assert.match(protectedBattle.text,/毒を防いだ/);
  const silver=createPlayerState();silver.addItem(32,1);silver.equip(32);
  for(const [roll,stopped] of [[.14999,true],[.15,false]]) {const battle=createBattle(venom,{player:silver.definition,random:()=>roll});battle.attack();battle.advance();assert.equal(battle.text.includes('動けない'),stopped);}
  const slayer=createPlayerState();slayer.addItem(33,1);slayer.equip(33);
  const dragon={...enemyCatalog.find(e=>e.id===17),stats:{hp:9999,attack:1,defense:28,magic:1}};
  const dragonHit=createBattle(dragon,{player:slayer.definition});dragonHit.attack();assert.equal(dragonHit.feedback.amount,82);
  const nonDragon=createBattle({...dragon,family:'beast'},{player:slayer.definition});nonDragon.attack();assert.equal(nonDragon.feedback.amount,27);
  const technique=createBattle(dragon,{player:slayer.definition});technique.useSkill(0);assert.equal(technique.feedback.amount,137);
  const spell=createBattle(dragon,{player:slayer.definition});spell.useSkill(1);assert.equal(spell.feedback.amount,1,'dragon bonus only affects physical attacks');
  const bound=createBattle({...venom,patterns:{beforeAttacked:[{type:'slow',text:'糸を吐いた',turns:2},{type:'say',text:'待つ'},{type:'say',text:'待つ'},{type:'say',text:'待つ'}],afterAttacked:[{type:'say',text:'待つ'}]}},{random:()=>0});
  bound.guard();bound.advance();bound.advance();assert.equal(bound.slowedTurns,2);bound.useSkill(1);assert.equal(bound.playerMp,10);assert.equal(bound.phase,'player-action');assert.match(bound.text,/拘束/);
  bound.advance();bound.advance();bound.attack();assert.equal(bound.slowedTurns,0);bound.advance();bound.advance();bound.useSkill(1);assert.equal(bound.playerMp,7);
  const buff=createBattle({...venom,patterns:{beforeAttacked:[{type:'boost-attack',text:'遠吠え',power:2,turns:1},{type:'attack',text:'爪',power:1,hits:2}],afterAttacked:[{type:'say',text:'待つ'}]}});
  buff.guard();buff.advance();buff.advance();assert.equal(buff.enemyAttackBoost,2);buff.guard();buff.advance();assert.equal(buff.feedback.amount,20);assert.equal(buff.enemyAttackBoost,1);
  for(const invalid of [-1,1.1,NaN,Infinity,'0.1']) assert.throws(()=>parseItemCatalog([{...findItem(32),equipment:{...findItem(32).equipment,stunChance:invalid}}]));
  for(const action of [{type:'slow',text:'糸',turns:0},{type:'boost-attack',text:'吠え',turns:1,power:4},{type:'attack',text:'爪',power:1,hits:4}]) assert.throws(()=>parseEnemyDefinitions([{...venom,patterns:{beforeAttacked:[action],afterAttacked:[action]}}]));
  const disk=new Map(),storage={getItem:key=>disk.get(key)??null,setItem:(key,value)=>disk.set(key,value),removeItem:key=>disk.delete(key)};
  const scene={id:0,width:11,height:9,spawn:{x:16,y:80},tiles:new Uint8Array(99).fill(7),entities:[
    {kind:'unique-monster',x:80,y:16,parameters:[],battleEvent:{enemyId:15,once:true,clear:false}},
    {kind:'bounty-board',x:32,y:16,parameters:[]},{kind:'guild-master',x:128,y:80,parameters:[]},
    {kind:'sister',x:80,y:80,parameters:[]},{kind:'alchemist',x:128,y:16,parameters:[]},
  ]};
  const enemy={...enemyCatalog.find(e=>e.id===15),stats:{...venom.stats,hp:1}},options={storage,enemies:[enemy]};
  let game=createWorldGame([scene],0,()=>.999999,options);
  const drain=()=>{for(let n=0;game.message&&!game.encounter;n++){assert.ok(n<10);game.interact();}};
  function approach(kind) {
    const map={...game.scene,entities:game.visibleEntities},queue=[{...game.position,path:[]}],seen=new Set(),moves=[['back',0,-16],['front',0,16],['left',-16,0],['right',16,0]];
    for(let i=0;i<queue.length;i++){const p=queue[i],key=`${p.x},${p.y}`;if(seen.has(key))continue;seen.add(key);
      for(const [direction] of moves){const index=interactionTarget(map,p,direction);if(index!==undefined&&map.entities[index].kind===kind){for(const move of p.path){assert.equal(game.move(move),true);drain();}game.move(direction);game.interact();drain();return;}}
      for(const [direction,dx,dy] of moves)if(Array.from({length:16},(_,n)=>({x:p.x+dx*(n+1)/16,y:p.y+dy*(n+1)/16})).every(pos=>canStand(map,pos)))queue.push({x:p.x+dx,y:p.y+dy,path:[...p.path,direction]});
    }assert.fail(`cannot approach ${kind}`);
  }
  assert.equal(game.claimBounty(15).ok,false);approach('guild-master');assert.equal(game.claimBounty(15).ok,false);game.closeShop();
  approach('unique-monster');game.battle.attack();game.finishEncounter('victory');drain();assert.equal(game.status.gold,500);assert.ok(!game.visibleEntities.some(e=>e.kind==='unique-monster'));
  approach('bounty-board');assert.equal(game.bounties[0].status,'defeated');assert.equal(game.claimBounty(15).ok,false);game.closeShop();
  approach('guild-master');assert.equal(game.claimBounty(15).ok,true);assert.equal(game.status.gold,700);assert.ok(game.status.titles.includes('毒巣を払う者'));assert.equal(game.claimBounty(15).ok,false);game.closeShop();
  game=createWorldGame([scene],0,()=>.999999,options);assert.equal(game.bounties[0].status,'claimed');assert.equal(game.status.gold,700);assert.ok(!game.visibleEntities.some(e=>e.kind==='unique-monster'));
  const saved=JSON.parse(disk.get('tagquest.play-save.v1'));saved.player.vitals={hp:7,mp:2,poisoned:true};saved.player.inventory.push([34,3]);disk.set('tagquest.play-save.v1',JSON.stringify(saved));
  game=createWorldGame([scene],0,()=>.999999,options);assert.equal(game.pray().ok,false);approach('sister');assert.equal(game.pray().ok,true);assert.equal(game.status.poisoned,false);assert.equal(game.status.hp,7);assert.equal(game.status.mp,2);assert.equal(game.status.gold,700);game.closeShop();
  approach('alchemist');assert.equal(game.exchange(6).ok,true);assert.equal(game.status.gold,660);assert.equal(game.exchange(6).ok,false);game.closeShop();assert.equal(game.inventory.find(i=>i.itemId===28).count,1);
  game=createWorldGame([scene],0,()=>.999999,options);assert.equal(game.status.gold,660);assert.equal(game.bounties[0].status,'claimed');
  game.reset();assert.equal(game.bounties[0].status,'active');assert.equal(game.status.titles.length,0);assert.ok(game.visibleEntities.some(e=>e.kind==='unique-monster'));
  console.log('Expansion: all maps/service/exit/boss routes, level warnings, building geometry, poison immunity, binding/stun/attack buffs/multiple hits/dragon bonus, guild claim once/save/reset/titles, board, church and alchemy passed.');
} finally {rmSync(out,{recursive:true,force:true});}
