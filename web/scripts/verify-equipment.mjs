import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../node_modules/vite/dist/node/index.js';

const root=fileURLToPath(new URL('../..',import.meta.url)),out=mkdtempSync(join(tmpdir(),'tq-equipment-'));
try {
  await build({configFile:false,logLevel:'silent',build:{lib:{entry:Object.fromEntries([
    ['items','data/items'],['skills','data/skills'],['shops','data/shops'],['recipes','data/exchanges'],
    ['config','data/encounters/combat-config'],['progression','data/progression'],
    ['player','game/player-state'],['world','game/world'],['battle','game/battle'],['cost','game/skill-cost'],
  ].map(([name,file])=>[name,join(root,`web/src/${file}.ts`)])),formats:['es'],fileName:(_,name)=>`${name}.mjs`},outDir:out}});
  const read=name=>import(pathToFileURL(join(out,`${name}.mjs`)).href);
  const {itemCatalog,findItem,parseItemCatalog}=await read('items'),{findSkill,skillCatalog}=await read('skills');
  const {shopCatalog}=await read('shops'),{exchangeRecipes}=await read('recipes');
  const {playerConfig,enemyCatalog,parsePlayerDefinition}=await read('config'),{progressionConfig}=await read('progression');
  const {createPlayerState}=await read('player'),{createWorldGame}=await read('world'),{createBattle}=await read('battle');
  const {skillMpCost,skillMpLabel}=await read('cost');
  const expected=[
    [43,'鋼の剣',350,8,'weapon',{attack:16}], [44,'魔導士の杖',450,10,'weapon',{attack:4,magic:24,mp:20,mpCostReduction:1}],
    [45,'ミスリルソード',1200,18,'weapon',{attack:30,criticalChance:.08}], [46,'月影の賢者杖',1600,22,'weapon',{attack:8,magic:48,mp:40,mpCostReduction:2}],
    [47,'火炎の波刃剣',2800,28,'weapon',{attack:42,magic:16}], [48,'天魔の破邪剣',5000,38,'weapon',{attack:60,defense:10}],
    [49,'鉄の盾',180,6,'shield',{defense:5}], [50,'鋼鉄の大盾',500,14,'shield',{defense:12,hp:15}],
    [51,'ルーンバックラー',850,18,'shield',{defense:8,magic:12,mp:15}], [52,'ドラゴンシールド',2500,32,'shield',{defense:24,hp:30}],
    [53,'鉄の胸当て',220,6,'armor',{defense:10}], [54,'シルバーメイル',750,16,'armor',{defense:18,hp:20}],
    [55,'星屑の魔導ローブ',1100,20,'armor',{defense:12,magic:28,mp:35,mpCostReduction:1}], [56,'ドラゴンアーマー',3800,34,'armor',{defense:36,attack:8,hp:50}],
    [57,'シルバーヘルム',600,16,'head',{defense:10}], [58,'賢者のサークレット',900,20,'head',{defense:5,magic:18,mp:25}],
    [59,'ドラゴンスカル',2200,32,'head',{defense:16,attack:5,hp:20}], [60,'疾風のブーツ',800,12,'accessory',{defense:3,hp:10,evasionChance:.08}],
    [61,'賢者のアミュレット',1500,22,'accessory',{magic:15,mp:25,mpCostReduction:1}], [62,'バーサーカーリング',2000,28,'accessory',{attack:18,defense:-6,criticalChance:.1}],
  ];
  assert.deepEqual(itemCatalog.map(item=>item.id),Array.from({length:76},(_,i)=>i));
  const sold=new Set(shopCatalog.flatMap(shop=>shop.items));
  for(const [id,name,price,level,slot,bonus] of expected) {
    const item=findItem(id);assert.equal(item.name,name);assert.equal(item.price,price);assert.equal(item.sellPrice,price/2);assert.equal(item.equipment.slot,slot);assert.equal(item.equipment.requiredLevel,level);assert.ok(sold.has(id));
    for(const key of ['hp','mp','attack','defense','magic','mpCostReduction','criticalChance','evasionChance']) assert.equal(item.equipment[key]??0,bonus[key]??0,`${name}: ${key}`);
    const locked=createPlayerState({...playerConfig,initialExperience:progressionConfig.levelThresholds[level-1]-1,initialItems:[{itemId:id,quantity:1}]});
    const before=locked.snapshot();assert.equal(locked.equip(id).ok,false);assert.deepEqual(locked.snapshot(),before);locked.gainExperience(1);assert.equal(locked.equip(id).ok,true);
    for(const key of ['hp','mp','attack','defense','magic']) assert.equal((key==='mp'?locked.definition.maxMp:locked.definition.stats[key]),Math.max(0,locked.baseStats[key]+(bonus[key]??0)));
    assert.equal(locked.definition.mpCostReduction,bonus.mpCostReduction??0);locked.unequip(slot);assert.equal(locked.definition.mpCostReduction,0);
  }
  const equipment=[46,55,51,58,61], definition={...playerConfig,initialExperience:progressionConfig.levelThresholds[21],initialItems:equipment.map(itemId=>({itemId,quantity:1}))};
  const mage=createPlayerState(definition);equipment.forEach(id=>assert.equal(mage.equip(id).ok,true));
  assert.equal(mage.totalMpReduction,4);assert.equal(mage.definition.mpCostReduction,4);assert.equal(mage.definition.stats.magic,173);assert.equal(mage.definition.maxMp,192);
  mage.addItem(46,9);assert.equal(mage.totalMpReduction,4,'copies in the bag are not extra equipped slots');
  mage.addItem(44,1);mage.equip(44);assert.equal(mage.totalMpReduction,3,'weapon swaps replace, rather than stack, bonuses');mage.equip(46);
  for(const skill of skillCatalog) {
    const cost=skill.kind==='spell'?Math.max(1,skill.mpCost-4):skill.mpCost;
    assert.equal(skillMpCost(skill,4),cost);assert.equal(mage.skillMpCost(skill.id),cost);
    assert.equal(skillMpLabel(skill,4),`MP ${cost}${cost===skill.mpCost?'':`（通常${skill.mpCost}）`}`);
  }
  assert.equal(skillMpCost({...findSkill(1),mpCost:0},9999),1);assert.equal(skillMpCost({...findSkill(0),mpCost:0},9999),0);
  const inert={...enemyCatalog[1],stats:{hp:9999,attack:20,defense:0,magic:40},patterns:{beforeAttacked:[{type:'say',text:'待つ'}],afterAttacked:[{type:'say',text:'待つ'}]}};
  for(const skill of skillCatalog.filter(skill=>skill.kind==='spell' && skill.learnLevel<=22 && ![17,18,19].includes(skill.id))) {
    const cost=skillMpCost(skill,4),battle=createBattle(inert,{player:mage.definition,playerMp:cost,playerHp:1,random:()=>.5});
    assert.equal(battle.useSkill(skill.id).ok,true);assert.equal(battle.playerMp,0);
    const dry=createBattle(inert,{player:mage.definition,playerMp:cost-1,playerHp:1,random:()=>{throw new Error('a failed cast must not draw');}});
    assert.equal(dry.useSkill(skill.id).ok,false);assert.equal(dry.phase,'commands');assert.equal(dry.playerMp,cost-1);
  }
  const physical=createBattle(inert,{player:mage.definition,playerMp:1});assert.equal(physical.useSkill(0).ok,false);assert.equal(physical.playerMp,1);assert.equal(physical.phase,'commands');
  const oneMp=createBattle(inert,{player:mage.definition,playerMp:1,random:()=>.5});oneMp.useSkill(1);assert.equal(oneMp.playerMp,0);assert.equal(oneMp.feedback.amount,81);assert.equal(oneMp.useSkill(1).ok,false);
  const field=createPlayerState(definition);equipment.forEach(id=>field.equip(id));field.setVitals({hp:1,mp:1,poisoned:false});assert.equal(field.useFieldSkill(2,()=>.5).ok,true);assert.equal(field.vitals.mp,0);assert.equal(field.vitals.hp,73);
  const full=field.vitals;assert.equal(field.useFieldSkill(2,()=>{throw new Error('no random draw on failure');}).ok,false);assert.deepEqual(field.vitals,full);
  const restored=createPlayerState();restored.restore(JSON.parse(JSON.stringify(mage.snapshot())));assert.equal(restored.totalMpReduction,4);assert.deepEqual(restored.definition.stats,mage.definition.stats);
  const legacy=createPlayerState();assert.equal(legacy.totalMpReduction,0);assert.equal(findItem(24).equipment.mpCostReduction,0);assert.equal(findItem(11).equipment.mpCostReduction,0);
  for(const reduction of [-1,.5,10000,true,'1',NaN,Infinity]) assert.throws(()=>parseItemCatalog([{...findItem(44),equipment:{...findItem(44).equipment,mpCostReduction:reduction}}]));
  for(const chance of [-.1,1.1,true,'0.08',NaN,Infinity]) {
    assert.throws(()=>parseItemCatalog([{...findItem(60),equipment:{...findItem(60).equipment,evasionChance:chance}}]));assert.throws(()=>parsePlayerDefinition({...playerConfig,evasionChance:chance}));
  }
  for(const reduction of [-1,1.5,true,Infinity,100000]) assert.throws(()=>parsePlayerDefinition({...playerConfig,mpCostReduction:reduction}));
  assert.equal(parsePlayerDefinition({...playerConfig,mpCostReduction:4,evasionChance:.08}).mpCostReduction,4);
  for(const defense of [-10000,10000,-.5,true]) assert.throws(()=>parseItemCatalog([{...findItem(62),equipment:{...findItem(62).equipment,defense}}]));
  const cursed=createPlayerState({...playerConfig,stats:{...playerConfig.stats,defense:0},initialExperience:97020},{...progressionConfig,growthPerLevel:{...progressionConfig.growthPerLevel,defense:0}});
  cursed.addItem(62,1);cursed.equip(62);assert.equal(cursed.definition.stats.defense,0,'negative defense never becomes a negative combat stat');assert.equal(cursed.definition.stats.attack,cursed.baseStats.attack+18);assert.equal(cursed.definition.criticalChance,.1);
  cursed.unequip('accessory');assert.equal(cursed.definition.stats.defense,0);assert.equal(cursed.definition.criticalChance,0);
  const warrior=createPlayerState({...playerConfig,initialExperience:97020},undefined,false);for(const id of [45,62]){warrior.addItem(id,1);warrior.equip(id);}assert.equal(warrior.definition.criticalChance,.18,'normal equipment bonuses work without optional facilities');
  for(const [roll,multiplier] of [[.179999,2],[.18,1]]) {const battle=createBattle(inert,{player:warrior.definition,random:()=>roll});battle.attack();assert.equal(battle.feedback.amount,warrior.definition.stats.attack*multiplier);}
  const bootUser=createPlayerState({...playerConfig,initialExperience:progressionConfig.levelThresholds[11]});bootUser.addItem(60,1);bootUser.equip(60);assert.equal(bootUser.definition.evasionChance,.08);
  const attack={type:'attack',text:'打撃',power:1,inflictPoison:true},magic={type:'magic-attack',text:'魔弾',power:1};
  const dodger={...bootUser.definition,stats:{hp:100,attack:20,defense:0,magic:10}};
  for(const [roll,hp,poison] of [[.079999,100,false],[.08,90,true]]) {const battle=createBattle({...inert,patterns:{beforeAttacked:[attack],afterAttacked:[attack]}},{player:dodger,random:()=>roll});battle.guard();battle.advance();assert.equal(battle.playerHp,hp);assert.equal(battle.poisoned,poison);if(!poison)assert.match(battle.text,/受け流した/);}
  let draws=0;const multi=createBattle({...inert,actionsPerTurn:2,patterns:{beforeAttacked:[{...attack,hits:2}],afterAttacked:[attack]}},{player:dodger,random:()=>[0,.08,0,.08][draws++]});multi.guard();multi.advance();assert.equal(draws,4);assert.equal(multi.playerHp,80);assert.equal(multi.poisoned,true);
  const poisoned=createBattle({...inert,patterns:{beforeAttacked:[attack],afterAttacked:[attack]}},{player:dodger,poisoned:true,random:()=>0});poisoned.guard();poisoned.advance();assert.equal(poisoned.playerHp,98,'dodging does not suppress poison ticks');
  const spell=createBattle({...inert,patterns:{beforeAttacked:[magic],afterAttacked:[magic]}},{player:dodger,random:()=>{throw new Error('magic does not roll physical evasion');}});spell.guard();spell.advance();assert.equal(spell.playerHp,80);
  bootUser.unequip('accessory');assert.equal(bootUser.definition.evasionChance,0);
  // Field exploration spells use the same cost, with save/reload and a different world.
  const scene=(id,tile=7)=>({id,width:6,height:6,spawn:{x:16,y:16},tiles:new Uint8Array(36).fill(tile),entities:[]});
  const tiles=JSON.parse(readFileSync(join(root,'web/src/data/scene-catalog.json'),'utf8')).tiles;
  const town=scene(0),cave=scene(1,tiles.indexOf('cave-floor'));town.exits=[{x:2,y:2,targetStageId:1,targetX:1,targetY:2,direction:'right'}];cave.exits=[{x:0,y:2,targetStageId:0,targetX:2,targetY:2,direction:'left'}];
  const disk=new Map(),storage={getItem:key=>disk.get(key)??null,setItem:(key,value)=>disk.set(key,value),removeItem:key=>disk.delete(key)};
  let game=createWorldGame([town,cave],0,()=>.5,{player:definition,initialEquipment:equipment,storage});let mp=game.status.mp;
  assert.equal(game.useFieldSkill(17).ok,true);assert.equal(game.status.mp,--mp);assert.equal(game.useFieldSkill(19).ok,true);mp-=2;assert.equal(game.status.mp,mp);
  assert.equal(game.useFieldSkill(18).ok,false);assert.equal(game.status.mp,mp);game.move('right');assert.equal(game.scene.id,1);assert.equal(game.useFieldSkill(18).ok,true);assert.equal(game.status.mp,--mp);assert.equal(game.scene.id,0);
  game=createWorldGame([town,cave],0,()=>.5,{storage});assert.equal(game.status.totalMpReduction,4);assert.equal(game.status.mp,mp);assert.equal(game.useFieldSkill(17).ok,true);
  const other=createWorldGame([scene(9)],9,()=>.5,{storage});assert.equal(other.status.totalMpReduction,4);assert.deepEqual(other.status.equipment,game.status.equipment);assert.equal(other.returnPortal,null);
  const oldSource=readFileSync(join(root,'compiler/maps/adventure-small.json'));
  const locks=JSON.parse(readFileSync(join(root,'web/scripts/small-world-lock.json'),'utf8'));for(const [file,hash] of Object.entries(locks))assert.equal(createHash('sha256').update(readFileSync(join(root,file))).digest('hex'),hash);
  assert.ok(oldSource.length);const report=JSON.parse(readFileSync(join(root,'art/adventure-small/world.report.json'),'utf8'));assert.deepEqual([report.binary_bytes,report.final_url_bytes,report.ndef_tlv_bytes],[302,439,444]);
  assert.deepEqual(exchangeRecipes.slice(10,14).map(recipe=>recipe.result.itemId),[46,52,56,61]);
  for(const recipe of exchangeRecipes.slice(10)) {
    const state=createPlayerState({...playerConfig,initialGold:recipe.gold,initialItems:recipe.ingredients});assert.equal(state.exchange(recipe.id).ok,true);assert.equal(state.gold,0);assert.ok(state.inventory.some(item=>item.itemId===recipe.result.itemId));
    const before=state.snapshot();assert.equal(state.exchange(recipe.id).ok,false);assert.deepEqual(state.snapshot(),before);
  }
  console.log('Equipment: 20 specified items, prices/slots/level gates and shops, signed defense/clamp, stacked MP reduction/minimum/physical exclusion, combat/field/portal costs, saves, critical/evasion boundaries, recipes and immutable small world passed.');
} finally {rmSync(out,{recursive:true,force:true});}
