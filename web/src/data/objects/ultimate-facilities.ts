import { pixelCanvas } from '../characters/pixel-canvas';
import { serviceBuildings } from './service-buildings';
import type { PixelSprite } from './types';

const colors = ['#302b36', '#66503d', '#98714f', '#c4a474', '#e8e0ca', '#b6b1a4', '#817d80', '#c3d9da', '#33485e', '#597e9c', '#94b5c5', '#3f5863', '#d3d6c2', '#ecc577', '#a25877', '#557655'];
function facility(kind: string): PixelSprite {
  const art = pixelCanvas(64, 64, colors), { rect, line, shape, dot } = art;
  const base = serviceBuildings[kind === 'blacksmith-building' ? 'tavern' : kind === 'observatory' ? 'church' : 'inn-building'];
  base.pixels.forEach((row, y) => [...row].forEach((code, x) => { if (code !== '.') dot(x, y, code); }));
  if (kind === 'blacksmith-building') {
    rect(46, 0, 9, 21, '0'); rect(47, 1, 6, 18, '6');
    rect(9, 36, 13, 22, '0'); shape([[11,55],[13,40],[16,48],[19,43],[21,55]], 'd');
    rect(43, 49, 13, 3, '6'); rect(47, 52, 5, 5, 'a'); rect(45, 57, 10, 1, '5');
  } else if (kind === 'teleport-shrine') {
    rect(22, 36, 20, 25, '0'); rect(24, 38, 16, 21, '8');
    shape([[32,40],[40,49],[32,58],[24,49]], 'a'); shape([[32,44],[36,49],[32,54],[28,49]], '7');
    for (const [x,y] of [[16,36],[47,36],[20,55],[44,55]]) { dot(x,y,'7'); dot(x+1,y,'a'); }
  } else if (kind === 'casino-building') {
    rect(1, 0, 62, 34, '.'); shape([[32,3],[62,32],[2,32]], 'e', true);
    for (const x of [16,28,40]) shape([[32,4],[x,31],[x+6,31]], 'd');
    rect(42,48,15,11,'8'); for (const x of [45,49,53]) { rect(x,50,2,7,'d'); dot(x,52,'4'); }
    rect(29,0,6,3,'d');
  } else if (kind === 'observatory') {
    rect(20,0,27,28,'.'); shape([[32,1],[45,13],[43,29],[20,29],[18,13]], '8', true);
    shape([[32,3],[41,13],[40,23],[24,23],[22,13]], '9');
    for (const [x,y] of [[26,11],[34,7],[38,16]]) dot(x,y,'d');
    rect(44,52,11,4,'3'); shape([[49,48],[54,52],[49,57],[44,52]],'7',true); dot(48,50,'4');
  } else if (kind === 'port-building') {
    rect(43,48,13,11,'8'); line([49,49],[49,57],'c'); line([45,54],[49,58],'c'); line([53,54],[49,58],'c'); rect(46,51,7,1,'c');
    rect(10,3,2,23,'1'); shape([[12,4],[28,9],[12,14]],'7',true);
  } else if (kind === 'monster-corral') {
    for (const x of [4,12,20,44,52,60]) rect(x,47,2,14,'3'); line([4,51],[24,51],'2'); line([42,51],[61,51],'2'); line([4,57],[24,57],'2'); line([42,57],[61,57],'2');
    rect(43,48,14,11,'f'); shape([[49,50],[54,54],[53,57],[45,57],[44,54]],'a',true); dot(47,54,'0'); dot(51,54,'0');
  }
  return art.finish();
}
export const facilityBuildings = Object.fromEntries(['blacksmith-building', 'teleport-shrine', 'casino-building', 'observatory', 'port-building', 'monster-corral'].map(kind => [kind, facility(kind)]));
const boat = pixelCanvas(64,64,colors);
boat.shape([[3,43],[60,43],[54,55],[18,59],[8,52]],'2',true); boat.line([9,47],[56,47],'3'); boat.line([14,52],[51,52],'1');
boat.rect(31,2,3,44,'1'); boat.shape([[29,4],[9,32],[29,32]],'4',true); boat.shape([[35,5],[56,33],[35,33]],'c',true);
for (const y of [13,22]) boat.line([19,y],[28,y],'5'); boat.shape([[35,2],[47,6],[35,10]],'e'); boat.rect(18,38,28,4,'3');
export const ship = boat.finish();
const gate = pixelCanvas(16,32,colors); gate.rect(0,0,16,32,'0'); gate.rect(1,1,14,30,'8');
for (const x of [3,7,11]) { gate.rect(x,2,2,28,'5'); gate.rect(x,2,1,28,'a'); } gate.rect(1,7,14,2,'6'); gate.rect(1,24,14,2,'6'); gate.rect(6,14,5,6,'d'); gate.dot(8,17,'0');
export const ironGate = gate.finish();
