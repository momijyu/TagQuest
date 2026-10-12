import { pillar } from './pillar';
import { throne } from './throne';
import type { PixelSprite } from './types';

export const demonPillar = {
  ...pillar, palette: ['#343241', '#aba4be', '#777187', '#555263', '#434052'],
} as const satisfies PixelSprite;

export const demonThrone = {
  ...throne, palette: ['#282338', '#9f8045', '#e5cb85', '#49235d', '#704481', '#9568a4', '#675438'],
} as const satisfies PixelSprite;
