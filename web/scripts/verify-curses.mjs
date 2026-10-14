import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../node_modules/vite/dist/node/index.js';
const root = fileURLToPath(new URL('../..', import.meta.url)), out = mkdtempSync(join(tmpdir(), 'tq-curses-'));
try {
  await build({configFile:false,logLevel:'silent',build:{lib:{entry:Object.fromEntries([
    ['player','game/player-state'], ['world','game/world'], ['battle','game/battle'], ['items','data/items'],
    ['config','data/encounters/combat-config'], ['presets','editor/adventure-presets'], ['shops','data/shops'], ['recipes','data/exchanges'],
  ].map(([name,file])=>[name,join(root,`web/src/${file}.ts`)])),formats:['es'],fileName:(_,name)=>`${name}.mjs`},outDir:out}});
  const read = name => import(pathToFileURL(join(out,`${name}.mjs`)).href);
  const {createPlayerState}=await read('player'), {createWorldGame}=await read('world'), {createBattle}=await read('battle');
  const {findItem,parseItemCatalog}=await read('items'), {playerConfig,enemyCatalog}=await read('config');
  const {createAdventurePreset}=await read('presets'), {shopCatalog}=await read('shops'), {exchangeRecipes}=await read('recipes');
  const ids=[67,68,69,70], types=['self-damage','no-escape','high-encounter','slip-damage'];
  for(const [index,id] of ids.entries()) {
    const item=findItem(id); assert.equal(item.equipment.cursed,true); assert.equal(item.equipment.curseType,types[index]);
    assert.doesNotMatch(item.description,/自傷|呪い|逃走|逃げ|遭遇|削|侵食|HP.*減|8%|2倍/);
    assert.doesNotMatch(item.name,/[()（）]/);
    assert.ok(!shopCatalog.some(shop=>shop.items.includes(id)));
    assert.ok(!exchangeRecipes.some(recipe=>recipe.result.itemId===id));
    assert.ok(!enemyCatalog.some(enemy=>enemy.reward?.items.some(item=>item.itemId===id)));
  }
  assert.equal(findItem(67).equipment.attack,70); assert.equal(findItem(68).equipment.defense,45); assert.equal(findItem(68).equipment.hp,80);
  assert.equal(findItem(69).equipment.magic,35); assert.equal(findItem(69).equipment.experienceRate,1.2); assert.equal(findItem(69).equipment.experienceMultiplier,1.2);
  assert.equal(findItem(70).name,'怨念の兜');
  for(const equipment of [{cursed:1},{cursed:true},{cursed:true,curseType:'unknown'},{cursed:false,curseType:'self-damage'},{experienceRate:0},{experienceRate:1.5,experienceMultiplier:1.2}])
    assert.throws(()=>parseItemCatalog([{...findItem(67),equipment:{...findItem(67).equipment,curseType:undefined,...equipment}}]));
  const person = (gold=100) => ({...playerConfig,initialExperience:97020,initialGold:gold,initialItems:[...ids,3,5,7,22,25,9,10,12].map(itemId=>({itemId,quantity:2}))});
  const player=createPlayerState(person()); for(const id of ids) assert.equal(player.equip(id).ok,true);
  player.equip(7); const locked=player.snapshot();
  for(const [slot,replacement] of [['weapon',3],['armor',5],['accessory',22],['head',25]]) {
    assert.match(player.unequip(slot).message,/呪われていて外せない/); assert.equal(player.equip(replacement).ok,false); assert.deepEqual(player.snapshot(),locked);
  }
  assert.equal(player.equipRoyalSet().ok,false); assert.deepEqual(player.snapshot(),locked);
  assert.equal(player.equip(67).ok,true); assert.deepEqual(player.snapshot(),locked);
  const restored=createPlayerState(); restored.restore(locked); assert.equal(restored.unequip('weapon').ok,false);
  assert.equal(player.purify().ok,true); assert.equal(player.gold,0); assert.equal(player.cursedEquipment.length,0);
  assert.deepEqual(player.snapshot().inventory,locked.inventory); assert.equal(player.equipment.shield,7);
  for(const slot of ['weapon','armor','accessory','head']) assert.equal(player.equipment[slot],null);
  assert.ok(player.vitals.hp<=player.definition.stats.hp); assert.ok(player.vitals.mp<=player.definition.maxMp);
  const clean=player.snapshot(); assert.equal(player.purify().ok,false); assert.deepEqual(player.snapshot(),clean);
  assert.equal(player.equip(67).ok,true); assert.equal(player.unequip('weapon').ok,false,'wearing it again restores the curse');
  const poor=createPlayerState(person(99)); poor.equip(67); const poorSave=poor.snapshot(); assert.equal(poor.purify().ok,false); assert.deepEqual(poor.snapshot(),poorSave);
  assert.equal(poor.pray().ok,true); assert.equal(poor.unequip('weapon').ok,false,'free poison prayer cannot cleanse equipment');
  const inert={id:200,name:'試験敵',characterId:'leaf-gel',stats:{hp:9999,attack:1,defense:0,magic:0},patterns:{beforeAttacked:[{type:'say',text:'待機'}],afterAttacked:[{type:'say',text:'待機'}]}};
  const cursedHero=createPlayerState(person()); for(const id of ids) cursedHero.equip(id);
  const blood=createBattle(inert,{player:cursedHero.definition,random:()=>.5}); const hp=blood.playerHp;
  assert.doesNotMatch(blood.text,/枷|呪い|鎖/); blood.attack(); assert.match(blood.text,/大剣が血を求めて疼く！ 自分のHPが削られた！/);
  assert.equal(blood.playerHp,hp-Math.floor(cursedHero.definition.stats.hp*.08)); blood.advance(); assert.match(blood.text,/怨念が体を蝕む…！ HPが6減った！/);
  blood.advance(); const beforeEscape=blood.playerHp; blood.escape(); assert.equal(blood.phase,'commands'); assert.match(blood.text,/重い鎖が絡みついて逃げ出せない/); assert.equal(blood.playerHp,beforeEscape);
  const mage=createBattle(inert,{player:cursedHero.definition,random:()=>.5}); mage.useSkill(1); assert.equal(mage.playerHp,hp,'magic never triggers sword self-damage');
  const scene={id:0,width:6,height:6,spawn:{x:32,y:32},tiles:new Uint8Array(36).fill(7),entities:[{kind:'sister',x:32,y:16,parameters:[]}]};
  const disk=new Map(),storage={getItem:k=>disk.get(k)??null,setItem:(k,v)=>disk.set(k,v),removeItem:k=>disk.delete(k)};
  let world=createWorldGame([scene],0,()=>.5,{player:person(),initialEquipment:ids,storage});
  assert.equal(world.purify().ok,false,'only the sister can perform purification'); world.move('back'); world.interact();
  assert.match(world.message.text,/恐ろしい呪い.*100G/s); assert.equal(world.purify().ok,false,'dialogue must finish first');
  for(let n=0;world.message;n++){assert.ok(n<5);world.interact();}
  assert.equal(world.shop.merchant,'sister'); assert.equal(world.purify().ok,true); assert.equal(world.status.gold,0);
  world=createWorldGame([scene],0,()=>.5,{storage}); assert.equal(world.status.cursedEquipment.length,0); assert.equal(world.status.gold,0); assert.equal(world.purify().ok,false);
  for(const size of ['normal','large','small']) {const preset=createAdventurePreset(size); for(const id of ids) assert.equal(preset.stages.flatMap(stage=>stage.entities).filter(entity=>entity.itemId===id&&entity.kind==='treasure-chest').length,size==='small'?0:1);}
  const locks=JSON.parse(readFileSync(join(root,'web/scripts/small-world-lock.json'),'utf8'));
  for(const[file,hash] of Object.entries(locks)) assert.equal(createHash('sha256').update(readFileSync(join(root,file))).digest('hex'),hash,file);
  console.log('Hidden curses: flavor-only descriptions, locked swaps/royal auto-equip/save, paid church cleansing, atomic failures, battle logs and unchanged small world passed.');
} finally {rmSync(out,{recursive:true,force:true});}
