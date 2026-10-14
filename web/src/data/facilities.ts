import config from './facility-config.json';
import { findEnemy } from './encounters/combat-config';
import { findItem } from './items';
import { whole } from './catalog-validation';

export const facilityConfig = config;
export const facilityServices = ['blacksmith', 'shrine-keeper', 'casino-dealer', 'black-market-dealer', 'fortune-teller', 'captain', 'corral-keeper', 'well-entrance'] as const;
export const facilityNames: Record<string, string> = {
  blacksmith: '鍛冶屋', 'shrine-keeper': '旅の扉の祠', 'casino-dealer': '遊技場',
  'black-market-dealer': '地下の闇市', 'fortune-teller': '占いの館', captain: '船長',
  'corral-keeper': 'モンスター牧場', 'well-entrance': '古井戸', 'locked-house': '古い民家',
};
export const facilityGreetings: Record<string, string> = {
  blacksmith: '素材とゴールドで、この種類の武器や防具を＋1・＋2に強化できます。',
  'shrine-keeper': '一度訪れた拠点へ、旅の扉で送りましょう。',
  'casino-dealer': 'コインでスライムレースとハイ＆ローを遊べます。',
  'black-market-dealer': '合鍵があれば、古い家や鉄格子を開けられるぜ。',
  'fortune-teller': '旅の行く先と、巣窟の主の居場所を占いましょう。',
  captain: '外海の沈没神殿へ渡るかい？ 帰りの船も待っているよ。',
  'corral-keeper': '仲間の魔物は1匹連れていける。戦闘で1回だけ、助けを呼べるよ。',
  'well-entrance': '古井戸の中に、地下水路へ続くはしごがある。',
  'locked-house': '合鍵で扉を開けた。地下蔵へ入りますか？',
};
export const enhancementBonus = (slot: string, level: number, stat: string) => stat === 'attack' && slot === 'weapon' ? level * 3 : stat === 'defense' && slot !== 'weapon' ? level * 2 : 0;
export function monsterSupport(enemyId: number) {
  const enemy = findEnemy(enemyId);
  if (!enemy || !config.recruitableEnemies.includes(enemyId)) return undefined;
  return { enemyId, name: enemy.name, kind: [1, 2, 13, 23].includes(enemyId) ? 'heal' as const : 'attack' as const,
    amount: [1, 2, 13, 23].includes(enemyId) ? Math.max(15, Math.floor(enemy.stats.hp * .4)) : Math.max(8, enemy.stats.attack * 2) };
}
whole(config.coinGoldRate,1,100);
for (const prize of config.casinoPrizes) { if (!findItem(prize.itemId)) throw new Error('遊技場の景品IDが不明です。'); whole(prize.coins, 1); if (findItem(prize.itemId)!.sellPrice > prize.coins * config.coinGoldRate) throw new Error('カジノ景品の売値が交換費用を超えています。'); }
for (const step of config.enhancements) { whole(step.level, 1, 2); whole(step.gold); for (const item of step.ingredients) { if (!findItem(item.itemId)) throw new Error('強化素材が不明です。'); whole(item.quantity, 1); } }
if (!Number.isFinite(config.recruitChance) || config.recruitChance < 0 || config.recruitChance > 1 || config.recruitableEnemies.some(id => !findEnemy(id))) throw new Error('仲間になる魔物の設定が不正です。');

for(const value of [config.raceBet,config.racePayout,config.cardBet,config.cardPayout]) whole(value,1,10000);
if(new Set(config.casinoPrizes.map(prize=>prize.itemId)).size!==config.casinoPrizes.length || new Set(config.recruitableEnemies).size!==config.recruitableEnemies.length) throw new Error('施設のIDが重複しています。');
