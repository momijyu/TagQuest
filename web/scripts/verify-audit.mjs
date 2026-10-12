// Regressions found by the 2026-10-11 audit, including the new NFC/event contract.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../node_modules/vite/dist/node/index.js';
const root = fileURLToPath(new URL('../..', import.meta.url)), temp = mkdtempSync(join(tmpdir(), 'tq-audit-'));
try {
  const entries = { model:'editor/model', world:'game/world', battle:'game/battle', state:'game/player-state', config:'data/encounters/combat-config', nfc:'codec/nfc-url', decoder:'codec/scenes', renderer:'renderer/compiled-scene', sprites:'renderer/sprite', validation:'editor/validation', adventure:'editor/adventure', references:'data/encounters/enemy-illustrations', walking:'game/walking', sound:'game/battle-sound' };
  await build({configFile:false,logLevel:'silent',build:{lib:{entry:Object.fromEntries(Object.entries(entries).map(([key,p])=>[key,join(root,'web/src',p+'.ts')])),formats:['es'],fileName:(_,name)=>name+'.mjs'},outDir:temp,emptyOutDir:false}});
  const modules = Object.fromEntries(await Promise.all(Object.keys(entries).map(async key=>[key,await import(pathToFileURL(join(temp,key+'.mjs')))])));
  const {parseWorld,encodeWorld,toSceneData}=modules.model, {createWorldGame}=modules.world, {decodeScenes}=modules.decoder;
  const {enemyCatalog,playerConfig}=modules.config, {createPlayerState}=modules.state;
  // Audio is gesture-enabled, optional, short-lived and closable, with no effect on turn state.
  const audioStore=new Map();globalThis.localStorage={getItem:key=>audioStore.get(key),setItem:(key,value)=>audioStore.set(key,value)};
  let tones=0,closed=0;
  globalThis.AudioContext=class {
    state='running';currentTime=0;destination={};
    createOscillator(){return {frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){},start(){tones++;},stop(){}};}
    createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
    async close(){closed++;}
  };
  const sounds=modules.sound.createBattleSound();sounds.play('enemy');assert.equal(tones,0);
  assert.equal(sounds.toggle(),true);sounds.play('enemy');sounds.play('player');sounds.play('heal');assert.equal(tones,3);
  assert.equal(sounds.toggle(),false);sounds.play('enemy');assert.equal(tones,3);sounds.dispose();assert.equal(closed,1);
  // A resume Promise resolves after the tap; the first sound must wait rather than disappear.
  const RunningAudio=globalThis.AudioContext, contexts=[];
  globalThis.AudioContext=class extends RunningAudio {
    state='suspended';resumeCalls=0;
    constructor(){super();contexts.push(this);}
    resume(){this.resumeCalls++;return new Promise((resolve,reject)=>{this.finishResume=()=>{this.state='running';resolve();};this.rejectResume=reject;});}
    async close(){this.state='closed';closed++;}
  };
  const flushResume=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
  const firstTap=modules.sound.createBattleSound();assert.equal(firstTap.toggle(),true);
  firstTap.play('enemy');assert.equal(tones,3);assert.equal(contexts.at(-1).resumeCalls,1);
  contexts.at(-1).finishResume();await flushResume();assert.equal(tones,4,'initial tap plays after resume');firstTap.dispose();
  // A stored ON preference also wakes audio from the first command, without a separate toggle.
  const savedOn=modules.sound.createBattleSound();savedOn.play('player');assert.equal(tones,4);
  contexts.at(-1).finishResume();await flushResume();assert.equal(tones,5);savedOn.dispose();
  const muted=modules.sound.createBattleSound();muted.play('enemy');muted.toggle();
  contexts.at(-1).finishResume();await flushResume();assert.equal(tones,5,'OFF cancels pending sound');muted.dispose();
  const retoggled=modules.sound.createBattleSound();retoggled.toggle();retoggled.play('enemy');
  retoggled.toggle();retoggled.toggle();retoggled.play('heal');
  assert.equal(contexts.at(-1).resumeCalls,1,'commands share the pending resume');
  contexts.at(-1).finishResume();await flushResume();assert.equal(tones,6,'re-enabling cannot revive an earlier sound');retoggled.dispose();
  const abandoned=modules.sound.createBattleSound();abandoned.play('enemy');const abandonedContext=contexts.at(-1);
  abandoned.dispose();abandonedContext.finishResume();await flushResume();assert.equal(tones,6,'disposed screen cannot emit pending sound');
  const contextCount=contexts.length;abandoned.play('enemy');assert.equal(abandoned.toggle(),false);assert.equal(contexts.length,contextCount);
  const denied=modules.sound.createBattleSound();denied.play('enemy');contexts.at(-1).rejectResume(new Error('autoplay denied'));
  await flushResume();assert.equal(tones,6);denied.play('enemy');assert.equal(contexts.at(-1).resumeCalls,2,'later tap retries failed resume');
  contexts.at(-1).finishResume();await flushResume();assert.equal(tones,7);denied.dispose();
  delete globalThis.AudioContext;delete globalThis.localStorage;
  const materialCatalog=JSON.parse(readFileSync(join(root,'web/src/data/scene-catalog.json')));
  for(const definition of materialCatalog.entities){const entity={kind:definition.name,x:32,y:32,parameters:definition.parameters===2?[8,8]:definition.parameters===1?[0]:[]};const frame=modules.renderer.entityFrame(entity), size=modules.renderer.entitySize(entity);assert.equal(frame.width,size.width,definition.name);assert.equal(frame.height,size.height,definition.name);}
  const base={id:0,name:'test',width:5,height:5,spawn:{x:16,y:16},spawnAnchor:'frame',npcAnchor:'frame',floor:{default:'grass',rectangles:[]},entities:[],exits:[]};
  // An off-grid resident across an impassable wall looks close but cannot be addressed.
  const trapped=parseWorld({...base,spawn:{x:0,y:0},floor:{default:'grass',rectangles:[{tile:'wall-top',x:1,y:0,width:1,height:5}]},entities:[{kind:'resident',x:30,y:0,parameters:[],dialogue:{type:'template',id:0}}]});
  const trappedWalker=modules.walking.createWalkingGame(toSceneData(trapped.stages[0]));
  assert.equal(trappedWalker.move('right'),false);trappedWalker.interact();assert.equal(trappedWalker.message,null);
  assert.ok(modules.validation.validateWorld(trapped).some(i=>i.text.includes('調べられる位置')));
  const disconnected=parseWorld([base,{...base,id:1}]);
  assert.ok(modules.validation.validateWorld(disconnected).some(i=>i.stageId===1&&i.text.includes('開始位置から到達')));
  disconnected.stages[0].exits=[{x:2,y:2,targetStageId:1,targetX:1,targetY:2,direction:'front'}];
  assert.ok(!modules.validation.validateWorld(disconnected).some(i=>i.text.includes('到達')));
  // Crossing an automatic exit does not allow talking in the source map at that step.
  const warpConversation=parseWorld([{...base,spawn:{x:16,y:16},floor:{default:'grass',rectangles:[{tile:'wall-top',x:0,y:0,width:5,height:1},{tile:'wall-top',x:0,y:1,width:1,height:4},{tile:'wall-top',x:1,y:1,width:1,height:1},{tile:'wall-top',x:3,y:1,width:2,height:4},{tile:'wall-top',x:1,y:3,width:2,height:2}]},entities:[{kind:'resident',x:32,y:0,parameters:[],dialogue:{type:'template',id:0}}],exits:[{x:2,y:2,targetStageId:1,targetX:1,targetY:2,direction:'front'}]},{...base,id:1}]);
  assert.ok(modules.validation.validateWorld(warpConversation).some(i=>i.stageId===0&&i.text.includes('調べられる位置')));
  const trialPlayer={...playerConfig,initialExperience:900,initialGold:3000,initialItems:[{itemId:9,quantity:1},{itemId:10,quantity:1},{itemId:12,quantity:1}]};
  const trialGame=createWorldGame([toSceneData(parseWorld(base).stages[0])],0,undefined,{player:trialPlayer,initialEquipment:[9,10,12]});
  assert.equal(trialGame.status.level,10);assert.equal(trialGame.status.gold,3000);assert.equal(trialGame.status.appearance,'king');
  assert.equal(trialGame.status.hp,trialGame.status.maxHp);assert.equal(trialGame.status.mp,trialGame.status.maxMp);
  trialGame.unequip('head');trialGame.reset();assert.equal(trialGame.status.appearance,'king');assert.equal(trialGame.status.gold,3000);
  assert.throws(()=>parseWorld({...base,width:1,height:1,spawn:null,entities:[{kind:'tree',x:0,y:0,parameters:[]}]}),/はみ出/);
  execFileSync('python3',['-c',`import sys;sys.path.insert(0,'compiler');from build import compile_game\ntry: compile_game([${JSON.stringify({...base,width:1,height:1,spawn:null,entities:[{kind:'tree',x:0,y:0,parameters:[]}]}).replaceAll('null','None')}])\nexcept ValueError: pass\nelse: raise AssertionError('offmap tree accepted')`],{cwd:root});
  const routes=parseWorld([{...base,exits:[{x:2,y:2,targetStageId:1,targetX:1,targetY:2,direction:'front'}]}, {...base,id:1,spawn:{x:0,y:0},floor:{default:'grass',rectangles:[{tile:'wall-top',x:0,y:1,width:1,height:1}]},encounter:{enabled:true,enemyId:4,rate:100}}]);
  const game=createWorldGame(routes.stages.map(toSceneData),0,()=>0);
  game.move('right');game.move('right');while(game.battle.phase!=='defeat'){if(game.battle.phase==='commands')game.battle.guard();else game.battle.advance();}assert.equal(game.battle.phase,'defeat');game.finishEncounter('defeat');
  assert.equal(game.scene.id,0);assert.deepEqual(game.position,base.spawn);assert.equal(game.playerHp,40);assert.equal(game.battle,null);
  assert.ok(modules.validation.validateWorld(routes).some(i=>i.stageId===1&&i.text.includes('開始位置の足元')));
  const normal=structuredClone(enemyCatalog.find(e=>e.id===1));normal.stats.hp=1;normal.reward=null;normal.firstAttackedMessage='怒った';normal.patterns.beforeAttacked=[{type:'say',text:'平穏'}];normal.patterns.afterAttacked=[{type:'attack',text:'反撃',power:1}];
  const randomGame=createWorldGame([{...toSceneData(parseWorld(base).stages[0]),encounter:{enabled:true,enemyId:1,rate:100}}],0,()=>0,{enemies:[normal]});
  randomGame.move('right');randomGame.battle.attack();randomGame.battle.advance();randomGame.finishEncounter('victory');randomGame.move('left');assert.equal(randomGame.battle.wasAttacked,false);
  globalThis.Image=class {async decode() {}};
  const references=await modules.references.loadEnemyIllustrations();assert.equal(references['demon-lord'],undefined);assert.equal(Object.keys(references).length,3);
  const bossWorld=parseWorld({...base,spawn:{x:16,y:32},entities:[{kind:'demon-lord',x:16,y:0,parameters:[],dialogue:{type:'template',id:9},battleEvent:{enemyId:4,once:true,clear:true}}]});
  const royal=createPlayerState();royal.grantReward(enemyCatalog[0].reward);royal.equipRoyalSet();
  const eventPlayer={...playerConfig,stats:{hp:300,attack:40,defense:10}};
  for (const compact of [false,true]) {
    const bytes=encodeWorld(bossWorld,compact).bytes, scenes=decodeScenes(bytes);
    assert.deepEqual(scenes[0].entities[0].battleEvent,{enemyId:4,once:true,clear:true});
    const py=execFileSync('python3',['-c',`import sys,json;sys.path.insert(0,'compiler');from build import compile_game;w=json.load(sys.stdin);sys.stdout.buffer.write(compile_game(w['stages'],compact=${compact?'True':'False'})[0])`],{cwd:root,input:JSON.stringify(bossWorld)});
    assert.deepEqual(Buffer.from(bytes),py);
    const boss=createWorldGame(scenes,0,()=>0,{player:eventPlayer});
    boss.move('back');boss.interact();assert.equal(boss.battle,null);boss.interact();assert.equal(boss.battle.enemy.id,4);
    const hpBeforeEscape=boss.battle.playerHp;boss.battle.escape();assert.equal(boss.battle.phase,'commands');assert.match(boss.battle.text,/逃げられない/);boss.battle.advance();assert.equal(boss.battle.playerHp,hpBeforeEscape);assert.equal(boss.cleared,false);assert.ok(boss.visibleEntities.some(e=>e.kind==='demon-lord'));
    let hits=0;
    while(boss.battle.phase!=='victory') {assert.notEqual(boss.battle.phase,'defeat');if(boss.battle.phase==='commands'){hits++;boss.battle.attack();}else boss.battle.advance();}
    assert.equal(hits,4);assert.ok(boss.battle.playerHp>0);boss.finishEncounter('victory');assert.equal(boss.cleared,true);assert.ok(!boss.visibleEntities.some(e=>e.kind==='demon-lord'));assert.equal(boss.move('right'),false);
    boss.reset();assert.equal(boss.cleared,false);assert.ok(boss.visibleEntities.some(e=>e.kind==='demon-lord'));
    const weak=createWorldGame(scenes,0);weak.move('back');weak.interact();weak.interact();while(weak.battle.phase!=='defeat'){if(weak.battle.phase==='commands')weak.battle.guard();else weak.battle.advance();}assert.equal(weak.battle.phase,'defeat');weak.finishEncounter('defeat');assert.equal(weak.cleared,false);assert.ok(weak.visibleEntities.some(e=>e.kind==='demon-lord'));
  }
  // Packed boundary coordinates and parameterized moat records; a 2px edit must fall back losslessly.
  for(const offset of [0,2]) {
    const boundary=parseWorld({...base,id:255,width:32,height:32,spawn:null,entities:[
      {kind:'moat-outer-bank',x:16,y:16,parameters:[8,8]},
      {kind:'pillar',x:496,y:488,parameters:[]},
      {kind:'loot',x:496-offset,y:496,parameters:[7],itemId:0},
      {kind:'king',x:0,y:480,parameters:[1],dialogue:{type:'custom',text:'こんにちは 😀'},battleEvent:{enemyId:1,once:false,clear:false}},
    ]});
    const bytes=encodeWorld(boundary,true).bytes, decoded=decodeScenes(bytes);
    assert.equal(Boolean(bytes[9]&64),offset===0);assert.equal(decoded[0].id,255);assert.deepEqual(decoded[0].entities,boundary.stages[0].entities);
    const py=execFileSync('python3',['-c',"import sys,json;sys.path.insert(0,'compiler');from build import compile_game;w=json.load(sys.stdin);sys.stdout.buffer.write(compile_game(w['stages'],compact=True)[0])"],{cwd:root,input:JSON.stringify(boundary)});assert.deepEqual(Buffer.from(bytes),py);
  }
  const world=modules.adventure.createAdventureWorld();
  for (const compact of [false,true]) {
    const encoded=encodeWorld(world,compact), decoded=decodeScenes(encoded.bytes);
    assert.deepEqual(decoded,world.stages.map(toSceneData).map(({id,width,height,spawn,tiles,entities,exits,encounter})=>({id,width,height,spawn,tiles,entities,...(exits?.length?{exits}:{}),...(encounter?{encounter}:{})})));
    const py=execFileSync('python3',['-c',`import sys,json;sys.path.insert(0,'compiler');from build import compile_game;w=json.load(sys.stdin);sys.stdout.buffer.write(compile_game(w['stages'],compact=${compact?'True':'False'})[0])`],{cwd:root,input:JSON.stringify(world)});assert.deepEqual(Buffer.from(encoded.bytes),py);
    const url=modules.nfc.gameUrl(encoded.bytes,'https://example.com/g');assert.deepEqual(modules.nfc.readGameHash(new URL(url).hash),decoded);
    assert.deepEqual(modules.nfc.readGameHash('#game='+modules.nfc.base64url(encoded.bytes)),decoded);
    assert.throws(()=>modules.nfc.readGameHash(new URL(url).hash.slice(0,-5)));
    console.log(`Adventure compact=${compact}: binary ${encoded.bytes.length} B / URL ${url.length} B / NDEF ${modules.nfc.ndefSize(url)} B`);
  }
  for(const n of [1,245,246,250,254,255,256,257,1000]) {const url='https://www.example.com/'+ 'a'.repeat(n);const py=Number(execFileSync('python3',['-c',`import sys;sys.path.insert(0,'compiler');from build import ndef_size;print(ndef_size(sys.argv[1]))`,url],{cwd:root}));assert.equal(modules.nfc.ndefSize(url),py);}
  const unknownHash='#'+modules.nfc.base64url(new Uint8Array([84,81,255,1])); assert.equal(modules.nfc.isGameHash(unknownHash),true);assert.throws(()=>modules.nfc.readGameHash(unknownHash),/Unsupported/);assert.equal(modules.nfc.isGameHash('#VF'),true);assert.equal(modules.nfc.isGameHash('#editor'),false);
  assert.throws(()=>modules.nfc.readGameHash('#'));assert.throws(()=>modules.nfc.readGameHash('#abc$'));assert.throws(()=>modules.nfc.gameUrl(new Uint8Array(),'javascript:alert(1)'));
  // Pixel-identical terrain conversion, and unchanged passage for every world tile.
  const modern=toSceneData(world.stages.find(s=>s.id===2)), legacy=structuredClone(modern), catalog=JSON.parse(readFileSync(join(root,'web/src/data/scene-catalog.json')));
  for (let i=0;i<legacy.tiles.length;i++) {const kind=catalog.tiles[legacy.tiles[i]];if(!['world-mountain','world-forest'].includes(kind))continue;legacy.tiles[i]=catalog.tiles.indexOf(kind==='world-mountain'?'grass':'forest-ground');legacy.entities.push({kind,x:i%legacy.width*16,y:Math.floor(i/legacy.width)*16,parameters:[]});}
  legacy.entities.sort((a,b)=>Number(!['world-mountain','world-forest'].includes(a.kind))-Number(!['world-mountain','world-forest'].includes(b.kind)));
  function raster(scene) {const data=new Uint32Array(scene.width*scene.height*256);modules.renderer.drawCompiledScene({fillStyle:'',fillRect(x,y,w,h){const c=parseInt(this.fillStyle.slice(1),16);for(let row=y;row<y+h;row++)for(let col=x;col<x+w;col++)data[row*scene.width*16+col]=c;}},scene);return data;}
  const modernPixels = raster(modern), legacyPixels = raster(legacy); const differences = [...modernPixels.keys()].filter(i=>modernPixels[i]!==legacyPixels[i]); if(differences.length) console.log('pixel differences', differences.length, differences.slice(0,10).map(i=>[i%(modern.width*16),Math.floor(i/(modern.width*16)),modernPixels[i].toString(16),legacyPixels[i].toString(16)])); assert.equal(differences.length,0);
  for(let y=0;y<modern.height;y++)for(let x=0;x<modern.width;x++)assert.equal(modules.walking.canStand(modern,{x:x*16,y:y*16-16}),modules.walking.canStand(legacy,{x:x*16,y:y*16-16}));
  const demon=enemyCatalog.find(e=>e.id===4), emptyGear={weapon:null,armor:null,shield:null,accessory:null,head:null};
  function probe(equipment,enemy=demon){const battle=modules.battle.createBattle(enemy,{player:royal.definition,equipment});battle.guard();battle.advance();return battle;}
  assert.equal(probe(emptyGear).enemyAttackMultiplier,1);
  for(const [slot,id] of [['head',9],['armor',10],['weapon',11],['weapon',12]]) {
    const partial={...emptyGear,[slot]:id}, fight=probe(partial);assert.equal(fight.enemyAttackMultiplier,100);assert.match(fight.text,/470のダメージ/);
    assert.equal(probe(partial,{...demon,royalEquipmentAttack:{multiplier:100,match:'set'}}).enemyAttackMultiplier,1);
    assert.equal(probe(partial,enemyCatalog[1]).enemyAttackMultiplier,1);
  }
  assert.equal(probe(royal.equipment,{...demon,royalEquipmentAttack:{multiplier:100,match:'set'}}).enemyAttackMultiplier,100);
  assert.equal(probe({...emptyGear,weapon:3}).enemyAttackMultiplier,1);
  assert.equal(probe({...emptyGear,shield:3}).enemyAttackMultiplier,1);
  for(const invalid of [{multiplier:0,match:'any'},{multiplier:Infinity,match:'any'},{multiplier:100,match:'unknown'},{multiplier:100,match:['any']}]) assert.throws(()=>modules.config.parseEnemyDefinitions([{...demon,royalEquipmentAttack:invalid}]));
  // Suppress only royal attack bonuses before the stat cap; normal gear and growth stay effective.
  assert.equal(royal.definition.stats.attack,328);
  const sealed = royal.battleDefinition(demon);
  assert.equal(sealed.stats.attack,28);
  assert.equal(sealed.stats.hp,royal.definition.stats.hp);
  assert.equal(sealed.stats.defense,royal.definition.stats.defense);
  assert.equal(sealed.maxMp,royal.definition.maxMp);
  const attack = modules.battle.createBattle(demon,{player:sealed,equipment:royal.equipment});
  assert.match(attack.text,/王の装備の攻撃力が弱められた/);
  assert.match(attack.text,/100倍/);assert.match(attack.text,/装備を外/);
  attack.attack();assert.deepEqual(attack.feedback,{id:1,target:'enemy',amount:24});assert.equal(attack.enemyHp,96);assert.equal(attack.phase,'player-action');
  const physical = modules.battle.createBattle(demon,{player:sealed,equipment:royal.equipment});
  physical.useSkill(0);assert.equal(physical.enemyHp,82);
  const magic = modules.battle.createBattle(demon,{player:sealed,equipment:royal.equipment});
  magic.useSkill(1);assert.equal(magic.enemyHp,108);
  assert.equal(royal.battleDefinition(enemyCatalog[1]).stats.attack,328);
  assert.equal(royal.battleDefinition({...demon,royalEquipmentPlayerAttackMultiplier:0.1}).stats.attack,58);
  assert.equal(royal.battleDefinition({...demon,royalEquipmentPlayerAttackMultiplier:1}).stats.attack,328);
  for(const [slot,id,bonus] of [['head',9,50],['armor',10,50],['weapon',11,150],['weapon',12,200]]) {
    const individual=createPlayerState({...playerConfig,initialExperience:900,initialItems:[{itemId:id,quantity:1},{itemId:3,quantity:1},{itemId:8,quantity:1}]});
    individual.equip(3);individual.equip(8);individual.equip(id);
    const normalAttack=28+1+(slot==='weapon'?0:3);
    assert.equal(individual.battleDefinition(demon).stats.attack,normalAttack);
    assert.equal(individual.definition.stats.attack,normalAttack+bonus);
  }
  const capped=createPlayerState({...playerConfig,stats:{...playerConfig.stats,attack:9990},initialItems:[{itemId:12,quantity:1}]});
  capped.equip(12);assert.equal(capped.definition.stats.attack,9999);assert.equal(capped.battleDefinition(demon).stats.attack,9990);
  for(const invalid of [-1,1.01,Infinity,NaN,true,'0',null,[]]) assert.throws(()=>modules.config.parseEnemyDefinitions([{...demon,royalEquipmentPlayerAttackMultiplier:invalid}]));
  // Explicit escape-enabled override tests restoration independently of production boss restrictions.
  const royalWorld=createWorldGame([{...toSceneData(parseWorld(base).stages[0]),encounter:{enemyId:4,enabled:true,rate:100}}],0,()=>0,{enemies:[{...demon,canEscape:true}],player:{...playerConfig,initialExperience:900,initialItems:[{itemId:9,quantity:1},{itemId:10,quantity:1},{itemId:11,quantity:1},{itemId:12,quantity:1}]}});
  royalWorld.equip(9);royalWorld.move('right');assert.equal(royalWorld.battle.enemyAttackMultiplier,100);assert.equal(royalWorld.status.attack,28);royalWorld.battle.escape();royalWorld.battle.advance();royalWorld.finishEncounter('escape');assert.equal(royalWorld.status.attack,78);royalWorld.unequip('head');royalWorld.move('left');assert.equal(royalWorld.battle.enemyAttackMultiplier,1);assert.equal(royalWorld.status.attack,28);assert.doesNotMatch(royalWorld.battle.text,/王の装備の攻撃力が弱められた/);
  royalWorld.battle.escape();royalWorld.battle.advance();royalWorld.finishEncounter('escape');
  royalWorld.equip(9);royalWorld.equip(10);royalWorld.equip(12);royalWorld.move('right');
  assert.equal(royalWorld.status.attack,28);royalWorld.battle.attack();assert.equal(royalWorld.battle.enemyHp,96);
  royalWorld.battle.advance();assert.equal(royalWorld.battle.phase,'defeat');royalWorld.finishEncounter('defeat');
  assert.equal(royalWorld.status.attack,328);assert.equal(royalWorld.status.appearance,'king');
  const victoryWorld=createWorldGame([{...toSceneData(parseWorld(base).stages[0]),encounter:{enemyId:4,enabled:true,rate:100}}],0,()=>0,{player:{...playerConfig,initialExperience:900,initialItems:[{itemId:9,quantity:1},{itemId:10,quantity:1},{itemId:12,quantity:1}]},enemies:[{...demon,stats:{...demon.stats,hp:1}}]});
  victoryWorld.equip(9);victoryWorld.equip(10);victoryWorld.equip(12);victoryWorld.move('right');
  assert.equal(victoryWorld.status.attack,28);victoryWorld.battle.attack();victoryWorld.finishEncounter('victory');assert.equal(victoryWorld.status.attack,328);
  assert.equal(royal.definition.stats.attack,328);
  let pixelCalls=0;
  class RasterCanvas {
    constructor(width,height){this.width=width;this.height=height;this.pixels=new Uint32Array(width*height);}
    getContext(){const canvas=this;return {fillStyle:'',fillRect(x,y,w,h){pixelCalls++;const color=parseInt(this.fillStyle.slice(1),16);for(let row=y;row<y+h;row++)for(let col=x;col<x+w;col++)canvas.pixels[row*canvas.width+col]=color;},drawImage(image,x,y,w=image.width,h=image.height){for(let row=0;row<h;row++)for(let col=0;col<w;col++){const color=image.pixels[Math.floor(row*image.height/h)*image.width+Math.floor(col*image.width/w)];if(color)canvas.pixels[(y+row)*canvas.width+x+col]=color;}}};}
  }
  globalThis.OffscreenCanvas=RasterCanvas;
  const canvas=new RasterCanvas(modern.width*16,modern.height*16), context=canvas.getContext();
  modules.renderer.drawCompiledScene(context,modern);assert.deepEqual(canvas.pixels,modernPixels);const warm=pixelCalls;
  canvas.pixels.fill(0);modules.renderer.drawCompiledScene(context,modern);assert.deepEqual(canvas.pixels,modernPixels);assert.equal(pixelCalls,warm,'cached terrain and sprites are not repainted');
  console.log('Audit regressions: geometry, safe respawn, individual enemy state, reference loader, URL/NDEF, v10/v11 Python parity, boss escape/defeat/clear/reset, conditional royal equipment enemy attack and player bonus suppression, identical terrain rendering/collision, and cache reuse passed.');
} finally {delete globalThis.OffscreenCanvas;delete globalThis.Image;rmSync(temp,{recursive:true,force:true});}
