import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from '../node_modules/vite/dist/node/index.js';
const root=fileURLToPath(new URL('../..',import.meta.url)),out=mkdtempSync(join(tmpdir(),'tq-saved-session-'));
try {
  await build({configFile:false,logLevel:'silent',build:{lib:{entry:{session:join(root,'web/src/game/saved-session.ts'),world:join(root,'web/src/game/world.ts')},formats:['es'],fileName:(_,name)=>`${name}.mjs`},outDir:out}});
  const {startSavedSession,savedSessionLock}=await import(pathToFileURL(join(out,'session.mjs')).href);
  const {createWorldGame}=await import(pathToFileURL(join(out,'world.mjs')).href);
  class Locks {
    held=new Set();
    request(name,options,callback) {
      assert.equal(name,savedSessionLock);assert.deepEqual(options,{mode:'exclusive',ifAvailable:true});
      return Promise.resolve().then(async()=>{
        if(this.held.has(name))return callback(null);
        this.held.add(name);
        try{return await callback({name});}finally{this.held.delete(name);}
      });
    }
  }
  const locks=new Locks(),disk=new Map();let reads=0,writes=0;
  const storage={getItem:key=>{reads++;return disk.get(key)??null;},setItem:(key,value)=>{writes++;disk.set(key,value);},removeItem:key=>disk.delete(key)};
  const scene={id:0,width:6,height:6,spawn:{x:32,y:32},tiles:new Uint8Array(36).fill(7),entities:[]};
  let first,second,disposals=0,mounts=0;
  const start=assign=>saving=>{assert.equal(saving,true);mounts++;const game=createWorldGame([scene],0,()=>.5,{storage});game.save();assign(game);return ()=>disposals++;};
  const both=await Promise.allSettled([
    startSavedSession(start(game=>first=game),()=>true,locks),
    startSavedSession(start(game=>second=game),()=>true,locks),
  ]);
  assert.equal(both[0].status,'fulfilled');assert.equal(both[1].status,'rejected');assert.match(both[1].reason.message,/別の画面/);assert.equal(mounts,1);assert.equal(second,undefined);
  first.rename('保存できる画面');const canonical=disk.get('tagquest.play-save.v1'),counts={reads,writes};
  await assert.rejects(startSavedSession(start(game=>second=game),()=>true,locks),/別の画面/);assert.deepEqual({reads,writes},counts,'the other tab cannot even read or mutate the shared save');assert.equal(disk.get('tagquest.play-save.v1'),canonical);
  const stop=both[0].value;stop();stop();assert.equal(disposals,1);
  const next=await startSavedSession(start(game=>second=game),()=>true,locks);assert.equal(second.status.name,'保存できる画面');second.rename('引き継いだ画面');assert.equal(JSON.parse(disk.get('tagquest.play-save.v1')).player.name,'引き継いだ画面');next();
  const cancelled=await startSavedSession(()=>{throw new Error('cancelled mount must not run');},()=>false,locks);cancelled();
  await assert.rejects(startSavedSession(()=>{throw new Error('mount failed');},()=>true,locks),/mount failed/);
  const afterFailure=await startSavedSession(()=>()=>{},()=>true,locks);afterFailure();
  const saved=disk.get('tagquest.play-save.v1');let preview;
  const fallback=await startSavedSession(saving=>{assert.equal(saving,false);preview=createWorldGame([scene],0);preview.rename('保存なし');return ()=>{};},()=>true,undefined);
  assert.equal(preview.status.name,'保存なし');assert.equal(disk.get('tagquest.play-save.v1'),saved,'unsupported environments do not touch the existing save');fallback();
  await assert.rejects(startSavedSession(()=>()=>{},()=>true,{request(){throw new Error('locks unavailable');}}),/locks unavailable/);
  const main=readFileSync(join(root,'web/src/main.ts'),'utf8');assert.match(main,/startSavedSession\(saving[\s\S]*view\.start\(first, true, scenes, saving \? \{ storage \} : \{\}\)/);
  console.log('Saved session: simultaneous starts select one owner before any save read, blocked competitor cannot write, release/handoff/cancellation/failure and no-lock non-saving fallback passed.');
}finally{rmSync(out,{recursive:true,force:true});}
