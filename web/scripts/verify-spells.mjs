import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../node_modules/vite/dist/node/index.js';

const root = fileURLToPath(new URL('../..', import.meta.url)), out = mkdtempSync(join(tmpdir(), 'tq-spells-'));
try {
  await build({ configFile: false, logLevel: 'silent', build: { lib: { entry: Object.fromEntries([
    ['battle','game/battle'], ['world','game/world'], ['player','game/player-state'], ['power','game/spell-power'],
    ['skills','data/skills'], ['config','data/encounters/combat-config'], ['portal','game/return-portal'],
    ['renderer','renderer/compiled-scene'], ['rune','data/effects/return-rune'],
  ].map(([name,file]) => [name,join(root,`web/src/${file}.ts`)])), formats:['es'], fileName:(_,name)=>`${name}.mjs` }, outDir:out } });
  const read = name => import(pathToFileURL(join(out,`${name}.mjs`)).href);
  const {createBattle} = await read('battle'), {createWorldGame} = await read('world'), {createPlayerState} = await read('player');
  const {spellPower} = await read('power'), {skillCatalog,findSkill,parseSkillCatalog,isFieldSpell,isBattleSkill} = await read('skills');
  const {playerConfig,enemyCatalog} = await read('config'), {returnPortalKey,validReturnPortal,isDungeon} = await read('portal');
  assert.deepEqual(skillCatalog.map(skill=>skill.id),Array.from({length:24},(_,i)=>i));
  assert.deepEqual(playerConfig.skills,skillCatalog.map(skill=>skill.id));
  for (const skill of skillCatalog.filter(skill=>skill.id>=1 && skill.id<=12)) assert.doesNotMatch(skill.description,/\d|基礎/);
  for (const [id,cost,level] of [[17,5,10],[18,4,6],[19,6,10],[20,9,16],[21,8,12],[22,12,22],[23,10,15]]) {
    const skill=findSkill(id); assert.equal(skill.mpCost,cost); assert.equal(skill.learnLevel,level);
    assert.equal(isFieldSpell(skill),id<=19); assert.equal(isBattleSkill(skill),id>=20);
  }
  for (const [id,min,max,scale] of [[2,18,24,.3],[4,45,55,.6],[7,100,120,1],[10,220,260,1.4]]) assert.deepEqual(findSkill(id).effect,{type:'heal-hp',amount:(min+max)/2,magicScale:scale,amountRange:{min,max}});
  const hero={...playerConfig,level:99,maxMp:9999,stats:{hp:9999,attack:20,defense:0,magic:50}};
  const inert={...enemyCatalog[1],stats:{hp:9999,attack:40,defense:25,magic:40},actionsPerTurn:1,patterns:{beforeAttacked:[{type:'say',text:'待つ'}],afterAttacked:[{type:'say',text:'待つ'}]}};
  // Deterministic lower/middle/upper bounds, all scaling coefficients, and identical field/battle healing.
  for (const roll of [0,.5,.999999]) for (const skill of skillCatalog.filter(skill=>['magic-damage','heal-hp'].includes(skill.effect.type))) {
    const expected=(skill.effect.amountRange ? skill.effect.amountRange.min+Math.floor(roll*(skill.effect.amountRange.max-skill.effect.amountRange.min+1)) : Math.floor(skill.effect.amount*(.85+roll*.3)))+Math.floor(hero.stats.magic*skill.effect.magicScale);
    assert.equal(spellPower(skill.effect,50,()=>roll),expected);
    const battle=createBattle(inert,{player:hero,playerHp:1,random:()=>roll}); assert.equal(battle.useSkill(skill.id).ok,true);
    if(skill.effect.type==='magic-damage') assert.equal(battle.feedback.amount,Math.max(1,expected-(skill.effect.ignoreDefense?0:25)));
    else {
      const field=createPlayerState({...hero,initialExperience:97020});field.setVitals({hp:1,mp:9999,poisoned:false});
      assert.equal(field.useFieldSkill(skill.id,()=>roll).ok,true);
      const fieldExpected=(skill.effect.amountRange ? skill.effect.amountRange.min+Math.floor(roll*(skill.effect.amountRange.max-skill.effect.amountRange.min+1)) : Math.floor(skill.effect.amount*(.85+roll*.3)))+Math.floor(field.definition.stats.magic*skill.effect.magicScale);
      const equivalent=createBattle(inert,{player:field.definition,playerHp:1,random:()=>roll});equivalent.useSkill(skill.id);
      assert.equal(field.vitals.hp,Math.min(9999,1+fieldExpected));assert.equal(field.vitals.hp,equivalent.playerHp);assert.equal(field.vitals.mp,battle.playerMp);
    }
  }
  let draws=0;const counted=()=>{draws++;return .5;};
  const full=createBattle(inert,{player:hero,random:counted});assert.equal(full.useSkill(2).ok,false);assert.equal(full.useSkill(17).ok,false);assert.equal(draws,0);assert.equal(full.playerMp,9999);
  const dry=createBattle(inert,{player:hero,playerMp:0,playerHp:1,random:counted});assert.equal(dry.useSkill(2).ok,false);assert.equal(draws,0);
  full.useSkill(1);assert.equal(draws,1);full.useSkill(1);assert.equal(draws,1);
  const weakMagic=spellPower(findSkill(2).effect,10,()=>.5),staffMagic=spellPower(findSkill(2).effect,180,()=>.5);assert.equal(weakMagic,24);assert.equal(staffMagic,75);
  const cap=createBattle(inert,{player:hero,playerHp:9998,random:()=>.999999});cap.useSkill(12);assert.equal(cap.playerHp,9999);assert.equal(cap.feedback.amount,1);
  const pierce=createBattle({...inert,stats:{...inert.stats,defense:9999}},{player:hero,random:()=>.5});pierce.useSkill(20);assert.equal(pierce.feedback.amount,90);
  // Drain uses damage actually inflicted, including a finishing blow, and never overfills HP.
  for(const [hp,playerHp,healed] of [[9999,1,19],[5,1,2],[9999,9998,1]]) {
    const drain=createBattle({...inert,stats:{...inert.stats,hp}},{player:hero,playerHp,random:()=>.5});drain.useSkill(21);
    assert.equal(drain.playerHp,playerHp+healed);assert.equal(drain.playerMp,9991);assert.match(drain.text,/命を吸収/);
    if(hp===5){assert.equal(drain.phase,'victory');assert.equal(drain.useSkill(21).ok,false);assert.equal(drain.playerHp,3);}
  }
  const assault={...inert,actionsPerTurn:2,patterns:{beforeAttacked:[{type:'attack',text:'連撃',power:1,hits:2}],afterAttacked:[{type:'attack',text:'連撃',power:1,hits:2}]}};
  const freeze=createBattle(assault,{player:hero,random:()=>.5,poisoned:true});freeze.useSkill(22);freeze.advance();
  assert.equal(freeze.playerHp,9997,'freeze cancels all hits and both actions; existing poison ticks once');assert.match(freeze.text,/動けない/);
  freeze.advance();freeze.guard();freeze.advance();assert.equal(freeze.playerHp,9915,'freeze lasts one turn, not the whole battle');
  // Barrier lasts precisely three enemy turns, including multi-action/multi-hit magic; guard stacks.
  const mage={...inert,actionsPerTurn:2,patterns:{beforeAttacked:[{type:'magic-attack',text:'魔弾',power:1,hits:2}],afterAttacked:[{type:'magic-attack',text:'魔弾',power:1,hits:2}]}};
  const shield=createBattle(mage,{player:hero,random:()=>.5});shield.useSkill(23);shield.advance();assert.equal(shield.playerHp,9919);assert.equal(shield.barrierTurns,2);
  shield.advance();shield.guard();shield.advance();assert.equal(shield.playerHp,9879);assert.equal(shield.barrierTurns,1);
  shield.advance();shield.guard();shield.advance();assert.equal(shield.playerHp,9839);assert.equal(shield.barrierTurns,0);assert.match(shield.text,/消えた/);
  shield.advance();shield.guard();shield.advance();assert.equal(shield.playerHp,9759);
  const physical=createBattle(assault,{player:hero,random:()=>.5,poisoned:true});physical.useSkill(23);physical.advance();assert.equal(physical.playerHp,9837,'physical and poison damage are not reduced');
  shield.advance();shield.useSkill(23);shield.advance();shield.advance();shield.useSkill(23);assert.equal(shield.barrierTurns,3,'recasting refreshes duration');
  assert.equal(createBattle(mage,{player:hero}).barrierTurns,0,'no barrier leaks into a new battle');
  for(const effect of [{...findSkill(20).effect,ignoreDefense:1},{...findSkill(22).effect,freeze:'yes'},{...findSkill(21).effect,drainFraction:1.1},{...findSkill(1).effect,magicScale:-1},{type:'magic-barrier',turns:0,reduction:.5},{type:'no-encounters',steps:256}]) assert.throws(()=>parseSkillCatalog([{...findSkill(20),effect}]));

  const scene=(id,tile=7)=>({id,width:6,height:6,spawn:{x:16,y:16},tiles:new Uint8Array(36).fill(tile),entities:[]});
  const town=scene(0),cave=scene(1,17),cave2=scene(2,17); // Verify inference with the catalog, rather than trusting tile numbers.
  const tiles=JSON.parse(readFileSync(join(root,'web/src/data/scene-catalog.json'),'utf8')).tiles;
  cave.tiles.fill(tiles.indexOf('cave-floor'));cave2.tiles.fill(tiles.indexOf('cave-floor'));assert.equal(isDungeon(cave),true);
  town.entities=[{kind:'item-shop',x:80,y:0,parameters:[]}];
  town.exits=[{x:2,y:2,targetStageId:1,targetX:1,targetY:2,direction:'right'}];
  cave.exits=[{x:0,y:2,targetStageId:0,targetX:2,targetY:2,direction:'left'},{x:2,y:2,targetStageId:2,targetX:1,targetY:2,direction:'right'}];
  cave2.exits=[{x:0,y:2,targetStageId:1,targetX:2,targetY:2,direction:'left'}];
  const scenes=[town,cave,cave2],disk=new Map(),storage={getItem:key=>disk.get(key)??null,setItem:(key,value)=>disk.set(key,value),removeItem:key=>disk.delete(key)};
  const veteran={...hero,initialExperience:97020};
  let world=createWorldGame(scenes,0,()=>.5,{player:veteran,storage});
  const source=structuredClone(scenes);
  assert.equal(world.useFieldSkill(18).ok,false);assert.equal(world.status.mp,9999);
  assert.equal(world.move('right'),true);assert.equal(world.scene.id,1);
  const marked={stageId:1,...world.position,direction:world.direction};assert.equal(world.useFieldSkill(17).ok,true);assert.deepEqual(world.returnPortal,marked);
  assert.ok(disk.has(returnPortalKey));assert.equal(Object.keys(JSON.parse(disk.get(returnPortalKey)).worlds).length,1);assert.equal(world.status.mp,9994);
  world=createWorldGame(scenes,0,()=>.5,{player:veteran,storage});assert.deepEqual(world.returnPortal,marked);assert.equal(world.scene.id,1);
  assert.equal(world.useFieldSkill(18).ok,true);assert.equal(world.scene.id,0);assert.deepEqual(world.position,{x:32,y:16});assert.equal(world.safeSteps,6);assert.equal(world.canReturnAtTownEntrance,true);
  const mp=world.status.mp;assert.equal(world.returnToPortal().ok,true);assert.deepEqual(world.position,{x:16,y:16});assert.equal(world.status.mp,mp);
  world.move('right');assert.equal(world.scene.id,2);assert.equal(world.useFieldSkill(18).ok,true);assert.equal(world.scene.id,1,'escape returns to the entrance actually used, not the first authored exit');assert.deepEqual(world.position,{x:32,y:16});
  const other=createWorldGame([{...scene(9),width:7,tiles:new Uint8Array(42).fill(7)}],9,()=>.5,{storage});assert.equal(other.returnPortal,null,'coordinates never leak across worlds');assert.equal(other.useFieldSkill(17).ok,true);
  assert.equal(Object.keys(JSON.parse(disk.get(returnPortalKey)).worlds).length,2);assert.deepEqual(createWorldGame(scenes,0,()=>.5,{storage}).returnPortal,marked);
  assert.equal(validReturnPortal({...marked,x:17},scenes),false);assert.equal(validReturnPortal({...marked,stageId:255},scenes),false);
  assert.equal(validReturnPortal({...marked,y:9999},scenes),false);
  assert.deepEqual(scenes,source,'magic does not mutate authored maps');
  const fallback=createWorldGame(scenes,1,()=>.5,{player:veteran});assert.equal(fallback.useFieldSkill(18).ok,true);assert.equal(fallback.scene.id,0,'fresh dungeon start uses its authored outside exit');
  const noEntrance=scene(5,tiles.indexOf('cave-floor'));
  const stranded=createWorldGame([noEntrance],5,()=>.5,{player:veteran});delete stranded.scene.spawn;const unspent=stranded.status.mp;assert.equal(stranded.useFieldSkill(18).ok,false);assert.equal(stranded.status.mp,unspent);
  const broke=new Map([[returnPortalKey,'invalid json']]);const badStorage={...storage,getItem:key=>broke.get(key)??null,setItem:(key,value)=>broke.set(key,value),removeItem:key=>broke.delete(key)};
  const broken=createWorldGame([scene(0)],0,()=>.5,{player:veteran,storage:badStorage});assert.equal(broken.returnPortal,null);assert.equal(broken.status.level,99);
  world=createWorldGame(scenes,0,()=>.5,{player:veteran,storage});world.reset();assert.equal(world.returnPortal,null);assert.equal(disk.has(returnPortalKey),false);
  // Forty successful steps, blocked input excluded, expiry/recast/reload, and scripted fights unaffected.
  const randomScene={...scene(0),encounter:{enabled:true,rate:100,enemyId:1}};
  let fog=createWorldGame([randomScene],0,()=>0,{player:veteran,storage});assert.equal(fog.useFieldSkill(19).ok,true);assert.equal(fog.mistSteps,40);
  fog.move('left');assert.equal(fog.mistSteps,39);assert.equal(fog.move('left'),false);assert.equal(fog.mistSteps,39);
  for(let i=0;i<9;i++)fog.move(i%2?'left':'right');assert.equal(fog.mistSteps,30);
  fog=createWorldGame([randomScene],0,()=>0,{storage});assert.equal(fog.mistSteps,30);
  assert.equal(fog.useFieldSkill(19).ok,true);assert.equal(fog.mistSteps,40);
  for(let i=0;i<40;i++){assert.equal(fog.move(i%2?'left':'right'),true);assert.equal(fog.battle,null);}
  assert.equal(fog.mistSteps,0);fog.move('right');assert.ok(fog.battle);assert.equal(fog.useFieldSkill(17).ok,false);
  const scripted=createWorldGame([{...scene(0),entities:[{kind:'demon-lord',x:16,y:0,parameters:[],battleEvent:{enemyId:4,once:true,clear:true}}]}],0,()=>0,{player:veteran});
  scripted.useFieldSkill(19);scripted.move('back');scripted.interact();scripted.interact();assert.ok(scripted.battle,'mist does not skip explicitly requested boss battles');
  const across=createWorldGame(scenes,0,()=>0,{player:veteran});across.useFieldSkill(19);across.move('right');assert.equal(across.scene.id,1);assert.equal(across.mistSteps,39);
  const edge0={...scene(3),spawn:{x:0,y:16},exits:[{x:0,y:2,targetStageId:4,targetX:1,targetY:2,direction:'right'}]},edge1=scene(4);
  const edge=createWorldGame([edge0,edge1],3,()=>0,{player:veteran});edge.useFieldSkill(19);assert.equal(edge.move('left'),true);assert.equal(edge.scene.id,4);assert.equal(edge.mistSteps,39);
  // A visual rune is runtime-only and placed underneath actors, with no new serialized entity/tile ID.
  const {drawCompiledScene}=await read('renderer'),{returnRune}=await read('rune');assert.equal(returnRune.pixels.length,16);
  const calls=[],context=new Proxy({fillStyle:''},{get(target,key){return key in target?target[key]:(...args)=>calls.push([key,...args]);},set(target,key,value){target[key]=value;return true;}});
  drawCompiledScene(context,scene(0)); const terrainCalls=calls.length;calls.length=0;
  drawCompiledScene(context,scene(0),undefined, {returnPortal:{x:16,y:16}});
  const painted=returnRune.pixels.flatMap(row=>[...row]).filter(pixel=>pixel!=='.').length;assert.equal(calls.length-terrainCalls,painted);
  assert.ok(calls.slice(terrainCalls).every(([method,x,y])=>method==='fillRect' && x>=16 && x<32 && y>=32 && y<48));
  const locks=JSON.parse(readFileSync(join(root,'web/scripts/small-world-lock.json'),'utf8'));
  for(const [file,hash] of Object.entries(locks.files ?? locks)) assert.equal(createHash('sha256').update(readFileSync(join(root,file))).digest('hex'),hash,`${file} remains byte-identical`);
  console.log('Spells: random bounds and shared magic scaling, special combat effects/turns, portal scope/save/reset, dungeon entry escape, 40-step mist and immutable small-world files passed.');
} finally {rmSync(out,{recursive:true,force:true});}
