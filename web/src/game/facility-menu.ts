import { facilityConfig, monsterSupport } from '../data/facilities';
import { findItem } from '../data/items';
import { escapeHtml as html } from './html';
import type { createWorldGame } from './world';
import type { ActionResult } from './player-state';
type Game = ReturnType<typeof createWorldGame>;
type Button = (action:string,label:string,id?:number,slot?:never,disabled?:boolean)=>string;
export function facilityTabs(merchant: string): string[][] | undefined {
  return ({ blacksmith:[['enhance','強化']], 'shrine-keeper':[['travel','旅の扉']], 'casino-dealer':[['race','レース'],['card','ハイ＆ロー'],['prizes','景品']], 'fortune-teller':[['fortune','占い']], 'corral-keeper':[['corral','仲間']], captain:[['travel','出港']], 'well-entrance':[['travel','地下へ']], 'locked-house':[['travel','入る']] } as Record<string,string[][]>)[merchant];
}
export function facilityRows(game: Game, merchant: string, page: string, button: Button): string[] | undefined {
  if(merchant==='blacksmith') return game.inventory.filter(item=>findItem(item.itemId)?.equipment).map(({itemId})=>{
    const next=(game.status.enhancements.find(([id])=>id===itemId)?.[1]??0)+1,step=facilityConfig.enhancements.find(step=>step.level===next);
    return `<div class="player-item-row"><span>${html(game.itemName(itemId))}<small>${step ? `次は＋${next}：${step.gold}G・${step.ingredients.map(item=>`${findItem(item.itemId)!.name} ${item.quantity}個`).join('・')}` : '最大まで強化済み'}<br>武器は＋1ごとに攻撃＋3、防具は防御＋2。同じ種類の装備に適用。</small></span>${button('enhance','強化する',itemId,undefined,!step)}</div>`;
  });
  if(merchant==='shrine-keeper') return game.travelDestinations.map(place=>`<div class="player-item-row"><span>${html(place.name)}</span>${button('fast-travel','移動',place.id)}</div>`);
  if(merchant==='fortune-teller') return game.fortune.map(text=>`<p>${html(text)}</p>`);
  if(merchant==='captain'||merchant==='well-entrance'||merchant==='locked-house') return [`<p>${merchant==='captain'?'船で出港しますか？（無料）':merchant==='well-entrance'?'地下水路へ下りますか？':'合鍵で地下蔵へ入りますか？'}</p>`,button('facility-travel','はい')];
  if(merchant==='corral-keeper') return [button('companion','魔物を休ませる',-1),...game.status.monsters.map(id=>{
    const monster=monsterSupport(id)!;return `<div class="player-item-row"><span>${html(monster.name)}<small>${monster.kind==='heal'?'HP回復':'援護攻撃'}・1戦1回${game.status.companion===id?'（連れ歩き中）':''}</small></span>${button('companion','連れていく',id,undefined,game.status.companion===id)}</div>`;
  }),...(!game.status.monsters.length?['<p>通常の魔物を倒すと、まれに仲間になりたそうに見てきます。</p>']:[])];
  if(merchant==='casino-dealer') {
    const coins=`<p>所持 ${game.status.coins}コイン　1G＝1コイン</p>${button('coins','10G → 10コイン',10,undefined,game.casinoCard!==null)}${button('coins','100G → 100コイン',100,undefined,game.casinoCard!==null)}`;
    if(page==='race') return [coins,'<p>1着を予想：10コイン。4匹は同じ勝率、当たると30コイン（3倍）。</p>',`<div class="casino-racers">${[0,1,2,3].map(id=>`<div><canvas width="64" height="64" data-casino-racer="${id}" aria-label="スライム${id+1}"></canvas>${button('race',`スライム${id+1}`,id,undefined,game.casinoCard!==null)}</div>`).join('')}</div>`];
    if(page==='card') return [coins,`<p>1〜9のカード。${facilityConfig.cardBet}コインで開始し、高い／低いを予想。当たり${facilityConfig.cardPayout}コイン、同数は外れ。閉じると賭けを放棄します。</p>`,...(game.casinoCard===null?[button('card-start','カードを引く')]:[`<strong class="casino-card">今の数字：${game.casinoCard}</strong>`,button('card-guess','高い',1),button('card-guess','低い',0)])];
    return [coins,...facilityConfig.casinoPrizes.map(prize=>`<div class="player-item-row"><span>${html(findItem(prize.itemId)!.name)}　${prize.coins}コイン<small>${html(findItem(prize.itemId)!.description)}</small></span>${button('redeem','交換',prize.itemId,undefined,game.casinoCard!==null)}</div>`)];
  }
  return undefined;
}
export function runFacilityAction(game: Game, action: string, id: number): ActionResult | undefined {
  switch(action) {
    case 'enhance':return game.enhance(id);
    case 'fast-travel':return game.fastTravel(id);
    case 'facility-travel':return game.travelFacility();
    case 'coins':return game.buyCoins(id);
    case 'race':return game.race(id);
    case 'card-start':return game.startCard();
    case 'card-guess':return game.guessCard(id===1);
    case 'redeem':return game.redeem(id);
    case 'companion':return game.setCompanion(id===-1?null:id);
  }
}
