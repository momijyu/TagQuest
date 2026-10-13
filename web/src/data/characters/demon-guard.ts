import { demonLord, demonLordBattle } from './demon-lord';
import type { PixelSprite } from '../objects/types';

// 魔王と同じドットの輪郭を使う配下。青いマントと鉄の兜で見分ける。
const palette = [
  '#20272f', '#2d3944', '#45596a', '#7794a2',
  '#20364a', '#305a78', '#4884a0', '#7db6c5',
  '#48535c', '#788995', '#aebcc4', '#e0e7e8',
  '#767b8b', '#b5b8be', '#e4ddd1', '#ed8f70',
] as const;
const variant = (sprite: PixelSprite): PixelSprite => ({ ...sprite, palette });
export const demonGuard = variant(demonLord);
export const demonGuardBattle = variant(demonLordBattle);
