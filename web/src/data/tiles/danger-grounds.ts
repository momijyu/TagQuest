export const dangerGrounds = Object.fromEntries([
  ['bog-ground',['#405046','#65735a','#899278','#273c3b']],
  ['ice-ground',['#b6d4df','#dceaf0','#8cb2c6','#7095ad']],
  ['ember-ground',['#433338','#684143','#aa5b40','#d99156']],
].map(([kind, colors])=>[kind,{size:16,palette:colors as string[],pixels:Array.from({length:16},(_,y)=>Array.from({length:16},(_,x)=>{
  const n=(x*17+y*31)%53; return n<2?'2':n<5?'1':n===9?'3':'0';
}).join(''))}])) as Record<string,{size:number;palette:string[];pixels:string[]}>;
