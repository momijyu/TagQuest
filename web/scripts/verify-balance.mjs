import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../node_modules/vite/dist/node/index.js';
const root=fileURLToPath(new URL('../..',import.meta.url)),out=mkdtempSync(join(tmpdir(),'tq-balance-'));
try {
 await build({configFile:false,logLevel:'silent',build:{lib:{entry:Object.fromEntries([
  ['battle','game/battle'],['world','game/world'],['player','game/player-state'],['items','data/items'],['skills','data/skills'],
  ['power','game/spell-power'],['config','data/encounters/combat-config'],['progression','data/progression'],['shops','data/shops'],['presets','editor/adventure-presets'],
 ].map(([name,file])=>[name,join(root,`web/src/${file}.ts`)])),formats:['es'],fileName:(_,name)=>`${name}.mjs`},outDir:out}});
 const read=name=>import(pathToFileURL(join(out,`${name}.mjs`)).href);
 const {createBattle}=await read('battle'),{createWorldGame}=await read('world'),{createPlayerState}=await read('player');
 const {itemCatalog,findItem,isBattleItem,isFieldItem,parseItemCatalog}=await read('items'),{findSkill,skillCatalog,parseSkillCatalog}=await read('skills');
 const {spellPower}=await read('power'),{enemyCatalog,playerConfig,parsePlayerDefinition,parseEnemyDefinitions}=await read('config');
 const {progressionConfig}=await read('progression'),{shopCatalog}=await read('shops'),{createAdventurePreset}=await read('presets');
 for(const skill of skillCatalog) assert.doesNotMatch(skill.name,/[()（）]/);
 for(const name of ['火炎（ファイア）','火炎(Fire)'])assert.throws(()=>parseSkillCatalog([{...findSkill(1),name}]));
 assert.deepEqual(skillCatalog.slice(17).map(s=>s.name),['ゲート','エスケープ','ステルス','サンダー','ドレイン','フロスト','マナバリア']);
 for(const [id,level]of [[4,7],[7,18],[10,35],[13,8],[17,10],[18,6],[20,16],[21,12],[22,22],[23,15]])assert.equal(findSkill(id).learnLevel,level);
 for(const [id,min,max,scale]of [[2,18,24,.3],[4,45,55,.6],[7,100,120,1],[10,220,260,1.4]])for(const roll of [0,.5,.999999])assert.equal(spellPower(findSkill(id).effect,50,()=>roll),min+Math.floor(roll*(max-min+1))+Math.floor(50*scale));
 for(const [id,scale]of [[1,.4],[3,.4],[5,.7],[6,.7],[8,1],[9,1.2],[20,1.1]])assert.equal(findSkill(id).effect.magicScale,scale);
 const novice=createPlayerState({...playerConfig,initialExperience:progressionConfig.levelThresholds[17]});novice.addItem(24,1);novice.equip(24);
 const boss=createBattle(enemyCatalog.find(e=>e.id===4),{player:novice.definition,random:()=>.5});let casts=0;
 while(boss.phase!=='victory'){assert.equal(boss.useSkill(6).ok,true);casts++;assert.ok(casts<=10);if(boss.phase!=='victory'){boss.advance();assert.notEqual(boss.phase,'defeat');boss.advance();}}
 assert.equal(casts,5,'an ordinary Lv18 staff caster cannot evaporate the demon lord in 2–3 casts');
 assert.deepEqual(itemCatalog.filter(isBattleItem).map(i=>i.id),[0,1,2,19,20,37,38,63,64,65,66]);
 for(const id of [13,42,28,29,41,43,67,68,69,70])assert.equal(isBattleItem(findItem(id)),false);
 for(const id of [63,64,65,66]){assert.ok(shopCatalog.find(s=>s.merchant==='item-merchant').items.includes(id));assert.equal(isFieldItem(findItem(id)),false);}
 for(const id of [67,68,69,70])assert.ok(!shopCatalog.some(s=>s.items.includes(id)));
 const hero={...playerConfig,level:99,maxMp:100,stats:{hp:100,attack:20,defense:0,magic:10}};
 const inert={...enemyCatalog[1],boss:false,stats:{hp:9999,attack:20,defense:9,magic:20},reward:{gold:20,experience:111,items:[]},patterns:{beforeAttacked:[{type:'say',text:'待つ'}],afterAttacked:[{type:'say',text:'待つ'}]}};
 const next=b=>{b.advance();if(b.phase==='enemy-action')b.advance();};
 function withItems(enemy=inert,options={}) {const owned=new Map([[63,2],[64,2],[65,2],[66,2]]);const battle=createBattle(enemy,{player:hero,random:()=>.5,consumeItem:id=>{const count=owned.get(id)??0;if(!count)return false;owned.set(id,count-1);return true;},...options});return {battle,owned};}
 const bomb=withItems({...inert,stats:{...inert.stats,defense:9999}},{player:{...hero,selfDamageFraction:.08}});assert.equal(bomb.battle.useItem(63).ok,true);assert.equal(bomb.battle.enemyHp,9959);assert.equal(bomb.battle.playerHp,100);assert.equal(bomb.owned.get(63),1);assert.equal(bomb.battle.useItem(63).ok,false);assert.equal(bomb.owned.get(63),1);
 const killing=withItems({...inert,stats:{...inert.stats,hp:30}});killing.battle.useItem(63);assert.equal(killing.battle.phase,'victory');assert.match(killing.battle.text,/111の経験値/);
 const missing=createBattle(inert,{player:hero,consumeItem:()=>false});assert.equal(missing.useItem(63).ok,false);assert.equal(missing.enemyHp,9999);assert.equal(missing.phase,'commands');
 const smoke=withItems();smoke.battle.useItem(65);assert.equal(smoke.battle.phase,'escape');smoke.battle.cancelEscape();assert.equal(smoke.battle.phase,'escape');assert.equal(smoke.owned.get(65),1);
 for(const enemy of enemyCatalog.filter(e=>e.boss)) {const p=withItems(enemy);assert.equal(p.battle.useItem(65).ok,false);assert.equal(p.battle.phase,'commands');assert.equal(p.owned.get(65),2);}
 const locked=withItems(inert,{player:{...hero,cannotEscape:true}});locked.battle.escape();assert.equal(locked.battle.phase,'commands');assert.equal(locked.battle.useItem(65).ok,false);assert.equal(locked.owned.get(65),2);assert.match(locked.battle.text,/重い鎖が絡みついて逃げ出せない/);
 const assault={...inert,actionsPerTurn:2,patterns:{beforeAttacked:[{type:'attack',text:'連撃',power:1,hits:2}],afterAttacked:[{type:'attack',text:'連撃',power:1,hits:2}]}};
 for(const [roll,hp]of [[.499999,100],[.5,20]]) {const p=withItems(assault,{random:()=>roll});p.battle.useItem(64);p.battle.advance();assert.equal(p.battle.playerHp,hp);assert.equal(p.battle.blindTurns,2);}
 const blind=withItems(assault,{random:()=>0});blind.battle.useItem(64);next(blind.battle);for(let i=0;i<2;i++){blind.battle.guard();next(blind.battle);}assert.equal(blind.battle.blindTurns,0);assert.equal(blind.battle.playerHp,100);blind.battle.guard();next(blind.battle);assert.equal(blind.battle.playerHp,60);
 const magic=withItems({...inert,patterns:{beforeAttacked:[{type:'magic-attack',text:'魔弾',power:1}],afterAttacked:[{type:'magic-attack',text:'魔弾',power:1}]}},{random:()=>{throw Error('magic must not roll blind');}});magic.battle.useItem(64);magic.battle.advance();assert.equal(magic.battle.playerHp,80);
 const buff=withItems();buff.battle.useItem(66);next(buff.battle);assert.equal(buff.battle.attackBuffTurns,3);
 for(let i=0;i<3;i++){buff.battle.attack();assert.equal(buff.battle.feedback.amount,17);next(buff.battle);assert.equal(buff.battle.attackBuffTurns,2-i);}buff.battle.attack();assert.equal(buff.battle.feedback.amount,11);
 const noMagicBuff=withItems();noMagicBuff.battle.useItem(66);next(noMagicBuff.battle);noMagicBuff.battle.useSkill(1);assert.equal(noMagicBuff.battle.feedback.amount,7);
 const cursed=createPlayerState({...playerConfig,initialExperience:progressionConfig.levelThresholds[23]});for(const id of [67,68,69,70]){cursed.addItem(id,2);assert.equal(cursed.equip(id).ok,true);}assert.equal(cursed.definition.selfDamageFraction,.08);assert.equal(cursed.definition.cannotEscape,true);assert.equal(cursed.definition.encounterMultiplier,2);assert.equal(cursed.definition.experienceMultiplier,1.2);assert.equal(cursed.definition.curseDamage,6);
 assert.equal(cursed.definition.stats.attack,cursed.baseStats.attack+84);assert.equal(cursed.definition.stats.defense,cursed.baseStats.defense+59);assert.equal(cursed.definition.stats.magic,cursed.baseStats.magic+49);
 const blood=createBattle(inert,{player:{...hero,selfDamageFraction:.08},random:()=>.5});blood.attack();assert.equal(blood.playerHp,92);next(blood);blood.useSkill(0);assert.equal(blood.playerHp,84);next(blood);blood.useSkill(1);assert.equal(blood.playerHp,84);
 let awards=0;const mutual=createBattle({...inert,stats:{...inert.stats,hp:1}},{player:{...hero,selfDamageFraction:.08},playerHp:8,victoryText:()=>{awards++;return '報酬';}});mutual.attack();assert.equal(mutual.enemyHp,0);assert.equal(mutual.playerHp,0);assert.equal(mutual.phase,'defeat');assert.equal(awards,0);assert.doesNotMatch(mutual.text,/経験値|手に入れ/);
 const helm=createBattle(assault,{player:{...hero,stats:{...hero.stats,hp:200},curseDamage:6},poisoned:true,random:()=>.5});helm.guard();helm.advance();assert.equal(helm.playerHp,152,'four hits + poison once + curse once');
 const frozen=createBattle(assault,{player:{...hero,curseDamage:6},random:()=>.5});frozen.useSkill(22);frozen.advance();assert.equal(frozen.playerHp,94,'freeze never suppresses curse erosion');
 const cursedEscape=createBattle({...inert,patterns:{beforeAttacked:[{type:'escape',text:'逃走',chance:1}],afterAttacked:[{type:'escape',text:'逃走',chance:1}]}},{player:{...hero,curseDamage:6},playerHp:5,random:()=>0});cursedEscape.guard();cursedEscape.advance();assert.equal(cursedEscape.phase,'defeat');assert.equal(cursedEscape.playerHp,0);cursedEscape.advance();assert.equal(cursedEscape.playerHp,0);
 const reward=createBattle(inert,{player:{...hero,experienceMultiplier:1.2}});reward.attack();assert.equal(reward.enemy.reward.experience,133);assert.equal(inert.reward.experience,111);
 for(const slot of ['weapon','armor','accessory','head'])assert.equal(cursed.unequip(slot).ok,false);assert.equal(cursed.purify().ok,true);assert.equal(cursed.definition.selfDamageFraction,0);assert.equal(cursed.definition.cannotEscape,false);assert.equal(cursed.definition.curseDamage,0);assert.equal(cursed.definition.experienceMultiplier,1);assert.equal(cursed.definition.encounterMultiplier,1);
 const field=createPlayerState();field.addItem(63,1);const before=field.snapshot();assert.equal(field.useItem(63).ok,false);assert.deepEqual(field.snapshot(),before);
 const scene={id:0,width:6,height:6,spawn:{x:16,y:16},tiles:new Uint8Array(36).fill(7),entities:[],encounter:{enabled:true,rate:10,enemyId:1}};
 const definition={...playerConfig,initialExperience:progressionConfig.levelThresholds[23],initialItems:[{itemId:69,quantity:1}]};
 for(const [roll,hit]of [[.199999,true],[.2,false]]) {const game=createWorldGame([scene],0,()=>roll,{player:definition,initialEquipment:[69]});game.move('right');assert.equal(Boolean(game.battle),hit);}
 const safe=createWorldGame([{...scene,encounter:{...scene.encounter,rate:100}}],0,()=>0,{player:definition,initialEquipment:[69]});safe.useFieldSkill(19);for(let i=0;i<40;i++){safe.move(i%2?'left':'right');assert.equal(safe.battle,null);}safe.move('right');assert.ok(safe.battle);safe.battle.escape();safe.finishEncounter('escape');for(let i=0;i<6;i++){safe.move(i%2?'right':'left');assert.equal(safe.battle,null);}safe.move('right');assert.ok(safe.battle,'the curse doubles probability without deleting six protected steps');
 const disk=new Map(),storage={getItem:k=>disk.get(k)??null,setItem:(k,v)=>disk.set(k,v),removeItem:k=>disk.delete(k)};
 const rewardScene={...scene,encounter:{...scene.encounter,rate:100}},weak={...inert,stats:{...inert.stats,hp:1}};
 let world=createWorldGame([rewardScene],0,()=>.999999,{player:definition,initialEquipment:[69],enemies:[weak],storage});const xp=world.status.experience;world.move('right');world.battle.attack();assert.match(world.battle.text,/133の経験値/);world.finishEncounter('victory');world.finishEncounter('victory');assert.equal(world.status.experience,xp+133);
 world=createWorldGame([rewardScene],0,()=>.999999,{enemies:[weak],storage});assert.equal(world.status.experience,xp+133);assert.equal(world.status.experienceMultiplier,1.2);assert.equal(world.status.encounterMultiplier,2);assert.equal(world.unequip('accessory').ok,false);assert.equal(world.status.encounterMultiplier,2);
 for(const size of ['normal','large','small']) {const preset=createAdventurePreset(size);for(const id of [67,68,69,70]){const placements=preset.stages.flatMap(stage=>stage.entities.filter(e=>e.itemId===id).map(entity=>({stage,entity})));assert.equal(placements.length,size==='small'?0:1);if(size!=='small'){assert.equal(placements[0].entity.kind,'treasure-chest');assert.equal(placements[0].stage.name,{67:'沈没神殿',68:'地下水路と闇市',69:'氷狼の洞穴',70:'蜘蛛の毒巣'}[id]);}}}
 for(const effect of [{type:'battle-damage',amount:0},{type:'battle-blind',turns:0,missChance:.5},{type:'battle-blind',turns:3,missChance:2},{type:'battle-buff',turns:3,power:.5}])assert.throws(()=>parseItemCatalog([{...findItem(63),effect}]));
 for(const [key,value]of [['selfDamageFraction',1.1],['cannotEscape',1],['curseDamage',.5],['experienceMultiplier',.9],['encounterMultiplier',Infinity]]) {assert.throws(()=>parseItemCatalog([{...findItem(67),equipment:{...findItem(67).equipment,[key]:value}}]));assert.throws(()=>parsePlayerDefinition({...playerConfig,[key]:value}));}
 assert.throws(()=>parseEnemyDefinitions([{...inert,boss:'yes'}]));assert.throws(()=>parseSkillCatalog([{...findSkill(2),effect:{...findSkill(2).effect,amountRange:{min:24,max:18}}}]));
 const locks=JSON.parse(readFileSync(join(root,'web/scripts/small-world-lock.json'),'utf8'));for(const[file,hash]of Object.entries(locks))assert.equal(createHash('sha256').update(readFileSync(join(root,file))).digest('hex'),hash,file);
 console.log('Balance: single spell names/levels/ranges, five-cast Lv18 boss, tactical items/filter/three-turn states, cursed self-death/escape/slip/XP/encounter protections/save, exclusive chest placements and unchanged small files passed.');
}finally{rmSync(out,{recursive:true,force:true});}
