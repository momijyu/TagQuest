import { demonLord, demonLordBattle } from './demon-lord';

// 魔王と同じ整数ピクセルの造形を、虚無神の銀紫の鎧・青白い光に置き換える。
const palette = ['#10131f', '#262139', '#45355d', '#79699c', '#20324b', '#34566b', '#4c8b9e', '#8ddbe0', '#55455d', '#8b7596', '#b3a7d1', '#f1e8ff', '#66879c', '#94c3d0', '#def4f5', '#dd9cf4'];
export const voidGod = { ...demonLord, palette };
export const voidGodBattle = { ...demonLordBattle, palette };
