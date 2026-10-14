import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from '../node_modules/vite/dist/node/index.js';
const root=fileURLToPath(new URL('../..',import.meta.url)),out=mkdtempSync(join(tmpdir(),'tq-leveling-gear-'));
try {
 await build({configFile:false,logLevel:'silent',build:{lib:{entry:Object.fromEntries([
  ['player','game/player-state'],['battle','game/battle'],['world','game/world'],['items','data/items'],['config','data/encounters/combat-config'],
  ['rewards','game/battle-rewards'],['facilities','data/facilities'],['shops','data/shops'],['recipes','data/exchanges'],['presets','editor/adventure-presets'],['progression','data/progression'],
 ].map(([name,file])=>[name,join(root,`web/src/${file}.ts`)])),formats:['es'],fileName:(_,name)=>`${name}.mjs`},outDir:out}});
 const read=name=>import(pathToFileURL(join(out,`${name}.mjs`)).href);
 const {createPlayerState}=await read('player'),{createBattle}=await read('battle'),{createWorldGame}=await read('world');
 const {itemCatalog,findItem,parseItemCatalog}=await read('items'),{playerConfig,enemyCatalog,parsePlayerDefinition}=await read('config');
 const {battleExperience,battleGold}=await read('rewards'),{facilityConfig}=await read('facilities'),{shopCatalog}=await read('shops'),{exchangeRecipes}=await read('recipes');
 const {createAdventurePreset}=await read('presets'),{progressionConfig}=await read('progression');
 assert.equal(itemCatalog.length,76);for(const item of itemCatalog)assert.doesNotMatch(item.name,/[()（）]/);
 assert.deepEqual(itemCatalog.slice(71).map(item=>item.name),['祝福の靴','天恵のブローチ','会心の手袋','聖者のロザリオ','黄金の指輪']);
 for(const id of [71,72,73,74,75]){const gear=findItem(id).equipment;assert.equal(gear.slot,'accessory');assert.equal(gear.requiredLevel,1);assert.equal(gear.attack,0);assert.equal(gear.defense,0);assert.equal(gear.selfDamageFraction??0,0);assert.equal(gear.cannotEscape??false,false);assert.equal(gear.curseDamage??0,0);assert.equal(gear.encounterMultiplier??1,1);}
 const person=(id,extra={})=>({...playerConfig,initialItems:[{itemId:id,quantity:2}],...extra});
 const scene=(id=0)=>({id,width:6,height:6,spawn:{x:16,y:16},tiles:new Uint8Array(36).fill(7),entities:[]});
 const storage=()=>{const disk=new Map();return {disk,getItem:k=>disk.get(k)??null,setItem:(k,v)=>disk.set(k,v),removeItem:k=>disk.delete(k)};};
 const seed=(scenes,options={},update=()=>{})=>{const memory=storage();let game=createWorldGame(scenes,scenes[0].id,()=>.5,{...options,storage:memory});game.save();const saved=JSON.parse(memory.getItem('tagquest.play-save.v1'));update(saved);memory.setItem('tagquest.play-save.v1',JSON.stringify(saved));game=createWorldGame(scenes,scenes[0].id,()=>.5,{...options,storage:memory});return {game,memory};};
 const shoes=createWorldGame([scene()],0,()=>.5,{player:person(71),initialEquipment:[71]});
 for(let n=0;n<7;n++){assert.equal(shoes.move(n%2?'left':'right'),true);assert.equal(shoes.status.experience,(n+1)*2);assert.equal(shoes.message,null);}
 shoes.move('left');assert.equal(shoes.status.experience,16);assert.equal(shoes.status.level,2);assert.match(shoes.message.text,/レベル2.*全回復/s);assert.equal(shoes.status.hp,45);assert.equal(shoes.status.mp,12);
 assert.equal(shoes.move('right'),false);assert.equal(shoes.status.experience,16);shoes.interact();assert.equal(shoes.message,null);shoes.unequip('accessory');shoes.move('right');assert.equal(shoes.status.experience,16);
 const bagOnly=createWorldGame([scene()],0,()=>.5,{player:person(71)});bagOnly.move('right');assert.equal(bagOnly.status.experience,0);
 const blocked=createWorldGame([{...scene(),spawn:{x:0,y:16}}],0,()=>.5,{player:person(71),initialEquipment:[71]});assert.equal(blocked.move('left'),false);assert.equal(blocked.status.experience,0);
 const traveler=createWorldGame([scene()],0,()=>.5,{player:person(71,{initialExperience:progressionConfig.levelThresholds[9]}),initialEquipment:[71]});const startXp=traveler.status.experience;
 traveler.useFieldSkill(17);assert.equal(traveler.status.experience,startXp);traveler.move('right');traveler.returnToPortal();assert.equal(traveler.status.experience,startXp+2,'teleport and spell casts grant no walking XP');
 const left={...scene(0),exits:[{x:2,y:2,targetStageId:1,targetX:1,targetY:2,direction:'right'}]},right={...scene(1),exits:[{x:1,y:2,targetStageId:0,targetX:2,targetY:2,direction:'left'}]};
 const {game:exitLevel}=seed([left,right],{player:person(71,{initialExperience:14}),initialEquipment:[71]},saved=>{saved.player.vitals.hp=1;saved.player.vitals.mp=0;});
 exitLevel.move('right');assert.equal(exitLevel.scene.id,1);assert.equal(exitLevel.status.experience,16);assert.equal(exitLevel.status.hp,45);assert.equal(exitLevel.status.mp,12);exitLevel.interact();assert.equal(exitLevel.scene.id,1,'arrival exit never bounces after learning popup');
 const lootExit={...left,entities:[{kind:'loot',x:32,y:32,parameters:[0],itemId:0}]};const loot=createWorldGame([lootExit,right],0,()=>.5,{player:person(71,{initialExperience:14}),initialEquipment:[71]});loot.move('right');assert.equal(loot.scene.id,0);assert.match(loot.message.text,/手に入れ/);loot.interact();assert.match(loot.message.text,/レベル2/);loot.interact();assert.equal(loot.scene.id,1,'exit resumes after pickup plus walking level-up messages');assert.equal(loot.status.experience,16);
 const edge={...scene(0),spawn:{x:0,y:16},exits:[{x:0,y:2,targetStageId:1,targetX:1,targetY:2,direction:'right'}]};const outward=createWorldGame([edge,scene(1)],0,()=>.5,{player:person(71),initialEquipment:[71]});assert.equal(outward.move('left'),true);assert.equal(outward.status.experience,2);
 const {game:regen,memory}=seed([scene()],{player:person(72),initialEquipment:[72]},saved=>{saved.player.vitals={hp:1,mp:0,poisoned:true};});
 regen.move('right');regen.move('left');assert.equal(regen.status.hp,1);assert.equal(regen.status.mp,0);assert.equal(regen.status.regenSteps,2);
 const reload=createWorldGame([scene()],0,()=>.5,{storage:memory});assert.equal(reload.status.regenSteps,2);reload.move('right');assert.equal(reload.status.hp,3);assert.equal(reload.status.mp,1);assert.equal(reload.status.poisoned,true);assert.equal(reload.status.regenSteps,0);assert.equal(reload.status.experience,0);
 const across=createWorldGame([scene(9)],9,()=>.5,{storage:memory});assert.equal(across.status.walkRegen.steps,3);assert.equal(across.status.equipment.accessory,72);assert.equal(across.status.hp,3);
 const capped=createPlayerState(person(72));capped.equip(72);capped.setVitals({hp:39,mp:10,poisoned:false});capped.walk();capped.walk();capped.walk();assert.deepEqual(capped.vitals,{hp:40,mp:10,poisoned:false});
 capped.walk();capped.walk();capped.equip(72);assert.equal(capped.regenSteps,2,'selecting the same item does not restart the cycle');capped.unequip('accessory');assert.equal(capped.regenSteps,0);capped.walk();assert.equal(capped.regenSteps,0);capped.equip(72);assert.equal(capped.regenSteps,0);
 const old=capped.snapshot();delete old.regenSteps;const legacy=createPlayerState();legacy.restore(old);assert.equal(legacy.regenSteps,0);
 for(const value of [-1,.5,255,true]){const before=legacy.snapshot();assert.throws(()=>legacy.restore({...before,regenSteps:value}));assert.deepEqual(legacy.snapshot(),before);}
 capped.setVitals({hp:0,mp:0,poisoned:false});assert.equal(capped.walk(),null);assert.equal(capped.vitals.hp,0);
 for(const id of [71,72,73,74,75]) {const p=createPlayerState(person(id),undefined,false);p.equip(id);assert.equal(p.definition.selfDamageFraction,0);assert.equal(p.definition.cannotEscape,false);assert.equal(p.definition.encounterMultiplier,1);if(id===71){assert.equal(p.definition.walkExperience,2);assert.equal(p.definition.experienceMultiplier,1.5);assert.equal(p.definition.roundExperienceUp,true);}if(id===73)assert.equal(p.definition.criticalChance,.3);if(id===74)assert.equal(p.definition.victoryMpRecovery,10);if(id===75)assert.equal(p.definition.goldMultiplier,2);}
 for(const [xp,expected]of [[0,0],[1,2],[5,8],[111,167]])assert.equal(battleExperience(xp,1.5,true),expected);assert.equal(battleExperience(111,1.2),133,'curse rounding remains floor');assert.equal(battleGold(111,2),222);
 const inert={...enemyCatalog[1],stats:{hp:1,attack:1,defense:0,magic:0},reward:{gold:5,experience:5,items:[]},patterns:{beforeAttacked:[{type:'say',text:'待つ'}],afterAttacked:[{type:'say',text:'待つ'}]}};
 const randomScene={...scene(),encounter:{enabled:true,rate:100,enemyId:1}};
 const boots=createWorldGame([randomScene],0,()=>.5,{player:person(71,{initialGold:0}),initialEquipment:[71],enemies:[inert]});boots.move('right');assert.equal(boots.status.experience,2);boots.battle.attack();assert.match(boots.battle.text,/8の経験値/);boots.finishEncounter('victory');boots.finishEncounter('victory');assert.equal(boots.status.experience,10);assert.equal(boots.status.gold,5);
 const ring=createWorldGame([randomScene],0,()=>.5,{player:person(75,{initialGold:0}),initialEquipment:[75],enemies:[inert]});ring.move('right');ring.battle.attack();assert.match(ring.battle.text,/10G/);ring.finishEncounter('victory');ring.finishEncounter('victory');assert.equal(ring.status.gold,10);assert.equal(ring.status.experience,5);assert.equal(inert.reward.gold,5);
 const rosary=createPlayerState(person(74,{maxMp:20}));rosary.equip(74);const definition=rosary.definition;
 for(const [mp,expected]of [[0,10],[15,20],[20,20]]){const b=createBattle(inert,{player:definition,playerMp:mp});b.attack();assert.equal(b.playerMp,expected);b.attack();b.advance();assert.equal(b.playerMp,expected);if(mp===20)assert.doesNotMatch(b.text,/MPが0回復/);}
 const spell=createBattle(inert,{player:definition,playerMp:5,random:()=>.5});spell.useSkill(1);assert.equal(spell.playerMp,12);
 const noReward=createBattle({...inert,reward:null},{player:definition,playerMp:0});noReward.attack();assert.equal(noReward.playerMp,10);
 const escape=createBattle({...inert,canEscape:true},{player:definition,playerMp:0});escape.escape();assert.equal(escape.playerMp,0);
 const defeat=createBattle(inert,{player:{...definition,selfDamageFraction:.08},playerHp:1,playerMp:0});defeat.attack();assert.equal(defeat.phase,'defeat');assert.equal(defeat.playerMp,0);
 const seeded=seed([randomScene],{player:person(74,{maxMp:20}),initialEquipment:[74],enemies:[{...inert,reward:{gold:0,experience:0,items:[]}}]},saved=>saved.player.vitals.mp=0);
 seeded.game.move('right');seeded.game.battle.attack();assert.equal(seeded.game.status.mp,10);seeded.game.save();seeded.game.save();assert.equal(seeded.game.status.mp,10);seeded.game.finishEncounter('victory');assert.equal(seeded.game.status.mp,10);const resumed=createWorldGame([randomScene],0,()=>.5,{storage:seeded.memory});assert.equal(resumed.status.mp,10);
 const gloves=createPlayerState(person(73));gloves.equip(73);const fighter={...gloves.definition,stats:{hp:100,attack:20,defense:0,magic:10}};
 for(const [roll,multiplier]of [[.299999,2],[.3,1]])for(const skill of [null,0]){const b=createBattle({...inert,stats:{...inert.stats,hp:9999,defense:3}},{player:fighter,random:()=>roll});if(skill===null)b.attack();else b.useSkill(skill);assert.equal(b.feedback.amount,Math.floor(20*(skill===null?1:1.5)*multiplier)-3);}
 let draws=0;const magic=createBattle({...inert,stats:{...inert.stats,hp:9999}},{player:fighter,random:()=>{draws++;return .5;}});magic.useSkill(1);assert.equal(draws,1);assert.doesNotMatch(magic.text,/会心/);
 const experienced=createPlayerState(person(73,{initialExperience:progressionConfig.levelThresholds[17]}));experienced.equip(73);experienced.addItem(45,1);experienced.equip(45);assert.equal(experienced.definition.criticalChance,.38);
 assert.equal(facilityConfig.casinoPrizes.find(p=>p.itemId===71).coins,800);assert.equal(facilityConfig.casinoPrizes.find(p=>p.itemId===75).coins,1000);
 const collector=createPlayerState();collector.addCoins(800);assert.equal(collector.redeem(71).ok,true);assert.equal(collector.coins,0);assert.equal(collector.equip(71).ok,true);assert.equal(collector.redeem(71).ok,false);
 const recipe=exchangeRecipes.find(r=>r.id===14);assert.equal(recipe.result.itemId,72);assert.ok(shopCatalog.find(s=>s.merchant==='item-merchant').recipes.includes(14));const trade=createPlayerState({...playerConfig,initialItems:recipe.ingredients,initialGold:recipe.gold});assert.equal(trade.exchange(14).ok,true);assert.equal(trade.equip(72).ok,true);assert.equal(trade.exchange(14).ok,false);
 assert.ok(shopCatalog.find(s=>s.merchant==='black-market-dealer').items.includes(75));assert.equal(findItem(75).price,5000);
 for(const size of ['normal','large','small']){const world=createAdventurePreset(size);for(const [id,name]of [[73,'紅蓮の竜穴'],[74,'古い民家の地下蔵']]){const placements=world.stages.filter(stage=>stage.entities.some(e=>e.kind==='treasure-chest'&&e.itemId===id));assert.equal(placements.length,size==='small'?0:1);if(placements.length)assert.equal(placements[0].name,name);}}
 for(const name of ['祝福の靴（育成）','黄金の指輪(Gold)'])assert.throws(()=>parseItemCatalog([{...findItem(71),name}]));
 for(const [key,value]of [['walkExperience',-1],['walkExperience',.5],['victoryMpRecovery',true],['goldMultiplier',.5],['roundExperienceUp',1],['walkRegen',{steps:0,hp:2,mp:1}],['walkRegen',{steps:3,hp:NaN,mp:1}]]){assert.throws(()=>parseItemCatalog([{...findItem(71),equipment:{...findItem(71).equipment,[key]:value}}]));assert.throws(()=>parsePlayerDefinition({...playerConfig,[key]:value}));}
 const locks=JSON.parse(readFileSync(join(root,'web/scripts/small-world-lock.json'),'utf8'));for(const[file,hash]of Object.entries(locks))assert.equal(createHash('sha256').update(readFileSync(join(root,file))).digest('hex'),hash,file);
 console.log('Leveling gear: successful-step XP/regen, level-up plus exits/loot, save/legacy/caps/swaps, rounded battle XP/doubled gold/once-only MP recovery, critical boundaries, acquisition and unchanged small world passed.');
} finally {rmSync(out,{recursive:true,force:true});}
