import { findEnemy } from './combat-config';
import type { VictoryReward } from './combat-config';

// 撃破後の再遭遇制限・消失と、共通configの戦闘報酬を定義する。
// 有効・無効はNFCから読み込むゲーム固有データで指定する。
// ここで城のエンカウントを常に有効にすることはしない。
export const kingEncounter: {
  readonly characterId: 'king';
  readonly maxDefeatsPerGame: 1;
  readonly removeFromStageAfterVictory: true;
  readonly victoryReward: VictoryReward | null;
} = {
  characterId: 'king',
  maxDefeatsPerGame: 1,
  removeFromStageAfterVictory: true,
  // 報酬の正本はenemies/king.json。G・経験値・ドロップを共通configから参照する。
  get victoryReward() { return findEnemy(0)?.reward ?? null; },
};
