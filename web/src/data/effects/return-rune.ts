import { pixelCanvas } from '../characters/pixel-canvas';
const rune=pixelCanvas(16,16,['#526596','#a9ccef','#e6f6fb']);
rune.shape([[8,0],[15,8],[8,15],[0,8]],'0');
rune.line([8,1],[14,8],'1');rune.line([14,8],[8,14],'1');rune.line([8,14],[1,8],'1');rune.line([1,8],[8,1],'1');
rune.rect(4,7,8,2,'2');rune.rect(7,4,2,8,'2');
export const returnRune=rune.finish();
