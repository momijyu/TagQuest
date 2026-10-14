import { pixelCanvas } from '../characters/pixel-canvas';

function building(kind: 'inn' | 'tavern' | 'church' | 'witch-hut') {
  const palette = ['#302b36','#66503d','#98714f','#c4a474','#e8e0ca','#b6b1a4','#817d80','#c3d9da',
    ...({ inn: ['#365b40','#598253','#8caa70'], tavern: ['#6a3e38','#a35f46','#d29268'], church: ['#33485e','#597e9c','#94b5c5'], 'witch-hut': ['#453054','#76527f','#a67bb1'] }[kind]),
    '#3f5863','#d3d6c2','#ecc577','#aba39b','#403746'];
  const art = pixelCanvas(64,64,palette), {rect,line,shape,dot}=art;
  rect(5,30,54,33,'0'); rect(7,31,50,30,kind==='tavern'?'9':'4'); rect(53,32,4,29,'5');
  if (kind==='tavern') for(let y=34;y<60;y+=5) { line([8,y],[52,y],'8'); for(let x=8+(y%2)*4;x<52;x+=10) line([x,y],[x,y+4],'8'); }
  for(const x of [7,54]) { rect(x,33,3,28,'1'); rect(x,33,1,27,'3'); }
  // 三角屋根と瓦の規則的な目地。
  shape([[31,5],[62,31],[1,31]],'8',true);
  for(let y=8;y<30;y++) { const half=Math.floor((y-5)*1.15); for(let x=32-half;x<32+half;x++) dot(x,y, y%4===0?'a':(x+(Math.floor(y/4)%2)*4)%8===0?'8':'9'); }
  rect(1,31,62,2,'0'); rect(2,31,60,1,'3');
  for(const x of [11,44]) { rect(x,37,9,11,'0'); rect(x+1,38,7,9,'b'); rect(x+2,39,2,4,'7'); line([x+4,38],[x+4,46],'3'); line([x+1,42],[x+7,42],'3'); }
  rect(26,37,13,24,'0'); rect(27,38,11,22,'1'); for(const x of [28,31,34]) rect(x,39,2,20,'2'); dot(36,49,'d');
  rect(5,60,54,3,'6'); rect(25,60,16,2,'5'); line([6,60],[57,60],'c');
  // 入口脇の看板。ドットでベッド／木樽／鐘／薬瓶を描き分ける。
  rect(41,47,17,13,'0'); rect(42,48,15,11,'1');
  if(kind==='inn') { rect(44,53,11,4,'c'); rect(44,51,3,2,'7'); rect(44,52,1,6,'3'); rect(54,54,1,4,'3'); }
  if(kind==='tavern') { shape([[46,49],[53,49],[55,53],[53,57],[46,57],[44,53]],'2',true); line([45,51],[54,51],'5'); line([45,55],[54,55],'5'); line([49,50],[49,56],'3'); }
  if(kind==='church') { rect(25,0,15,27,'0'); rect(27,1,11,24,'4'); shape([[32,1],[43,8],[21,8]],'8',true); rect(29,10,7,9,'b'); shape([[31,11],[34,11],[36,17],[29,17]],'d'); dot(32,19,'d'); rect(46,53,8,2,'c'); rect(49,50,2,8,'c'); }
  if(kind==='witch-hut') { shape([[48,3],[54,4],[51,18],[44,18],[48,12]],'6',true); line([49,5],[51,5],'e'); rect(48,50,4,2,'5'); rect(47,52,6,5,'8'); rect(48,53,4,3,'a'); dot(49,53,'c'); }
  return art.finish();
}

export const serviceBuildings = { 'inn-building': building('inn'), tavern: building('tavern'), church: building('church'), 'witch-hut': building('witch-hut') };
const board = pixelCanvas(32,32,['#342b2e','#73543b','#aa8055','#d8ba82','#f2e8c6']);
board.rect(3,2,26,22,'0'); board.rect(4,3,24,20,'1'); board.rect(7,5,18,16,'3'); board.rect(9,7,14,12,'4');
for(const y of [9,12,15]) board.line([11,y],[21,y],'2'); board.rect(6,24,3,8,'1'); board.rect(23,24,3,8,'1');
export const bountyBoard = board.finish();
