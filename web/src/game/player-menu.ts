import { skillMpCost, skillMpLabel } from './skill-cost';
import { enemyPixelSprites } from '../data/encounters/enemy-pixels';
import { drawSprite } from '../renderer/sprite';
import { facilityTabs, facilityRows, runFacilityAction } from './facility-menu';
import { worldMapAnchor, paintWorldMap, mapLandmarks, mapBearing, isOverworld } from '../renderer/world-map';
import { inferLocationName } from './location-names';
import { findItem, isFieldItem, itemCatalog, equipmentSlots, slotNames } from '../data/items';
import type { EquipmentSlot } from '../data/items';
import type { createWorldGame } from './world';
import { escapeHtml as html } from './html';
import { updateResourceBar } from './resource-bars';
import { findSkill, isFieldSpell } from '../data/skills';
import { purificationOffer } from '../data/interactions';
import { findExchangeRecipe } from '../data/exchanges';

type World = ReturnType<typeof createWorldGame>;
/** プレイ画面内の所持品・装備・ステータスと店の売買。 */
export function mountPlayerMenus(inventoryRoot: HTMLElement, shopRoot: HTMLElement, getGame: () => World | undefined,
  active: () => boolean, changed: () => void, closeInventory: () => void, onPurified: () => void = () => {}) {
  function mount(root: HTMLElement, shop: boolean) {
    root.innerHTML = `<strong data-menu-title></strong><p class="player-stats" data-player-stats></p>
      <div class="resource-meter"><span data-menu-hp></span><progress class="resource-bar" data-menu-hp-bar></progress></div>
      <div class="resource-meter"><span data-menu-mp></span><progress class="resource-bar resource-mp" data-menu-mp-bar></progress></div>
      <div class="player-menu-tabs" data-player-tabs role="group" aria-label="メニュー"></div>
      <p data-play-items></p><div class="player-menu-list" data-player-list></div>
      <p class="player-feedback" data-player-feedback role="status" aria-live="polite"></p>
      <button class="btn btn-sm" ${shop ? 'data-shop-close' : 'data-play-close-items'}>とじる</button>`;
    let mapStageId: number | undefined;
    let page = shop ? 'buy' : 'items', snapshot = '', feedback = '', lastShop: unknown, selected = 0;
    const get = (selector: string) => root.querySelector<HTMLElement>(selector)!;
    const closeSelector = shop ? '[data-shop-close]' : '[data-play-close-items]';
    const navigationButtons = () => [...root.querySelectorAll<HTMLButtonElement>('[data-menu-action]'), root.querySelector<HTMLButtonElement>(closeSelector)!].filter(button => !button.disabled);
    const button = (action: string, label: string, itemId?: number, slot?: EquipmentSlot, disabled = false) => `<button data-menu-action="${action}"${itemId === undefined ? '' : ` data-menu-item="${itemId}"`}${slot ? ` data-menu-slot="${slot}"` : ''}${disabled ? ' disabled' : ''}>${html(label)}</button>`;
    function render(focus = false): void {
      const game = getGame(); if (!game) return;
      const store = game.shop;
      if (shop) {
        root.hidden = !store;
        if (!store) { lastShop = null; snapshot = ''; return; }
        if (store !== lastShop) { lastShop = store; page = facilityTabs(store.merchant)?.[0]?.[0] ?? (store.merchant === 'alchemist' ? 'exchange' : ['guild-master', 'bounty-board'].includes(store.merchant) ? 'bounties' : store.merchant === 'sister' ? 'pray' : 'buy'); feedback = ''; focus = true; }
      }
      root.dataset.page = page;
      const items = game.inventory, status = game.status, discovered = game.discoveredItems;
      const key = JSON.stringify({ items, status, discovered, story: game.story, bounties: game.bounties, page, store, feedback, saveStatus: game.saveStatus, position: game.position, stageId: game.scene.id, card: game.casinoCard, mistSteps:game.mistSteps, returnPortal:game.returnPortal, mapStageId });
      if (key === snapshot && !focus) return;
      snapshot = key;
      get('[data-menu-title]').textContent = shop ? store!.name : page === 'map' ? 'ちず' : page === 'collection' ? 'アイテムずかん' : page === 'equipment' ? 'そうび' : page === 'status' ? 'つよさ' : page === 'spells' ? 'まほう' : 'どうぐ';
      get('[data-player-stats]').textContent = `${status.name}　Lv ${status.level}　${status.gold}G\n攻撃力 ${status.attack}　防御力 ${status.defense}　魔力 ${status.magic}\n経験値 ${status.experience}　${status.nextLevelExperience === null ? '最高レベル' : `次まで ${status.nextLevelExperience - status.experience}`}`;
      get('[data-menu-hp]').textContent = `HP ${status.hp} / ${status.maxHp}${status.poisoned ? '　毒' : ''}`;
      get('[data-menu-mp]').textContent = `MP ${status.mp} / ${status.maxMp}`;
      updateResourceBar(get('[data-menu-hp-bar]') as HTMLProgressElement, status.hp, status.maxHp, `${status.name}のHP`);
      updateResourceBar(get('[data-menu-mp-bar]') as HTMLProgressElement, status.mp, status.maxMp, `${status.name}のMP`);
      get(closeSelector).textContent = shop && store!.merchant === 'innkeeper' ? 'いいえ' : 'とじる';
      const tabs = shop && facilityTabs(store!.merchant) ? facilityTabs(store!.merchant)! : shop && ['guild-master','bounty-board'].includes(store!.merchant) ? [['bounties','賞金首']] : shop && store!.merchant==='sister' ? [['pray','お祈り']] : shop && store!.merchant === 'innkeeper' ? [['buy', '宿泊']] : shop ? [['buy', '買う'], ['sell', '売る'], ...(store!.recipes?.length ? [['exchange', '素材交換']] : [])] : [['items', 'どうぐ'], ['spells', 'まほう'], ['equipment', 'そうび'], ['status', 'つよさ'], ['collection', 'ずかん'], ...(game.facilitiesEnabled ? [['map', 'ちず']] : [])];
      get('[data-player-tabs]').innerHTML = tabs.map(([id, name]) => `<button data-player-tab="${id}" aria-pressed="${id === page}">${name}</button>`).join('');
      root.querySelectorAll<HTMLButtonElement>('[data-player-tab]').forEach(tab => tab.addEventListener('click', () => {
        if (!active()) return;
        page = tab.dataset.playerTab!; feedback = ''; selected = 0; render(true);
      }));
      const summary = get('[data-play-items]');
      summary.hidden = shop || page !== 'collection';
      summary.textContent = page === 'collection' ? `入手済み ${discovered.length} / ${itemCatalog.length}`
        : items.map(({ itemId, count }) => `${findItem(itemId)!.name} ×${count}`).join('\n') || 'なし';
      const comparison = (item: ReturnType<typeof findItem>): string => {
        if (!item?.equipment) return '';
        const gear = item.equipment;

        const currentGear = status.equipment[gear.slot] === null ? undefined : findItem(status.equipment[gear.slot]!)?.equipment;
        const reductionDelta = (gear.mpCostReduction ?? 0) - (currentGear?.mpCostReduction ?? 0);
        const values = ['hp', 'mp', 'attack', 'defense', 'magic'].map((key, i) => {
          const k = key as 'hp' | 'mp' | 'attack' | 'defense' | 'magic';
          const base = status.baseStats[k];
          const total = Math.max(0, Math.min(9999, base + Object.values(status.equipment).reduce<number>((sum, id) => sum + (id === null ? 0 : game.gearBonus(id,k)), 0)));
          const after = Math.max(0, Math.min(9999, base + Object.entries(status.equipment).reduce((sum, [slot, id]) => sum + (slot === gear.slot ? game.gearBonus(item.id,k) : id === null ? 0 : game.gearBonus(id,k)), 0)));
          const delta = after - total;
          return `${['最大HP', '最大MP', '攻撃', '防御', '魔力'][i]} ${delta >= 0 ? '+' : ''}${delta}`;
        });
        if (gear.mpCostReduction || currentGear?.mpCostReduction) values.push(`呪文MP軽減 ${reductionDelta >= 0 ? '+' : ''}${reductionDelta}`);
        return values.join(' / ');
      };
      let rows: string[] = [];
      const special = shop ? facilityRows(game, store!.merchant, page, button) : undefined;
      if (special) rows = special;
      else if (!shop && page === 'map') {
        const anchor = worldMapAnchor(game.stages, game.scene.id, game.position, mapStageId);
        const landmarks = mapLandmarks(anchor.scene, game.stages, game.visitedStageIds);
        rows = [`<p>現在：${html(inferLocationName(game.scene))}（${Math.floor(game.position.x/16)}, ${Math.floor(game.position.y/16)+1}）</p><div class="world-map-frame"><canvas data-world-map aria-label="${html(inferLocationName(anchor.scene))}の地図"></canvas><span class="world-map-pin" data-world-map-pin aria-label="現在地"></span></div><p>${html(inferLocationName(anchor.scene))}　北↑／東→　赤いピン：${anchor.exact ? '現在の座標' : '現在の地域の入口'}　番号：訪れた拠点</p>`, ...landmarks.map((place,index)=>`<p>${index+1}：${html(place.name)}（${place.x}, ${place.y}）　${html(mapBearing(place.x,place.y,anchor.x,anchor.y))}</p>`), button('map-stage','大陸の全景',-1), ...game.stages.filter(stage=>game.visitedStageIds.includes(stage.id)&&(isOverworld(stage)||stage.id===game.scene.id)).map(stage=>button('map-stage',`${stage.id===game.scene.id?'現在の場所：':'全景：'}${inferLocationName(stage)}`,stage.id))];
      }
      else if(shop && ['guild-master','bounty-board'].includes(store!.merchant)) rows=game.bounties.map(bounty=>`<div class="player-item-row"><span>${html(bounty.name)}<small>生息地：${html(bounty.location)}　推奨Lv ${bounty.recommendedLevel}<br>撃破報酬 ${bounty.gold}G　報告ボーナス ${bounty.bonus}G<br>${bounty.status==='claimed'?'報告済み':bounty.status==='defeated'?'討伐済み・未報告':'未討伐'}</small></span>${store!.merchant==='guild-master'?button('claim-bounty','討伐を報告',bounty.enemyId,undefined,bounty.status!=='defeated'):''}</div>`);
      else if(shop && store!.merchant==='sister' && status.cursedEquipment.length) rows=[`<p>${html(purificationOffer)}</p>`,button('purify','はい（100G）'),button('decline-purify','いいえ'),'<p>お祓いをしなくても、毒の治療を受けられます。</p>',button('pray','毒を治療する（無料）')];
      else if(shop && store!.merchant==='sister') rows=[`<p>旅の記録：${html(game.saveStatus || '公開URLから遊ぶと、進行は自動保存されます。')}<br>お祈りで毒を治療します。</p>`,button('pray','お祈りする')];
      else if (shop && store!.merchant === 'innkeeper') rows = ['<p>一泊 15G ですが、お泊まりになりますか？</p>', button('rest', 'はい（15G）')];
      else if (shop && page === 'buy') rows = store!.items.map(id => {
        const item = findItem(id)!;
        const count = items.find(entry => entry.itemId === id)?.count ?? 0;
        const equipped = Object.values(status.equipment).includes(id);
        return `<div class="player-item-row"><span>${html(game.itemName(item.id))}　${item.price}G　所持 ${count}個${equipped ? '（装備中）' : ''}<small>${html(item.description)} ${comparison(item)}${item.equipment ? `　装備Lv ${item.equipment.requiredLevel ?? 1}` : ''}</small></span>${button('buy', '買う', id)}</div>`;
      });
      else if (shop && page === 'exchange') rows = (store!.recipes ?? []).map(id => {
        const recipe = findExchangeRecipe(id)!, item = findItem(recipe.result.itemId)!;
        const materials = recipe.ingredients.map(({ itemId, quantity }) => {
          const count = items.find(entry => entry.itemId === itemId)?.count ?? 0;
          return `${findItem(itemId)!.name} ${count}/${quantity}個${Object.values(status.equipment).includes(itemId) ? '（装備中の1個は使えません）' : ''}`;
        }).join('・');
        return `<div class="player-item-row"><span>${html(game.itemName(item.id))} ×${recipe.result.quantity}<small>${html(item.description)} ${comparison(item)}</small><small>必要素材（所持/必要）：${html(materials)}${recipe.gold ? `　＋${recipe.gold}G` : '　手数料なし'}</small></span>${button('exchange', '交換する', id)}</div>`;
      });
      else if (shop) rows = items.map(({ itemId, count }) => {
        const item = findItem(itemId)!, equipped = Object.values(status.equipment).includes(itemId);
        return `<div class="player-item-row"><span>${html(game.itemName(item.id))} ×${count}　${item.sellable === false ? '売却不可' : `${item.sellPrice}G`}${equipped ? '（装備中）' : ''}</span>${button('sell', item.sellable === false ? '売却不可' : '売る', itemId, undefined, item.sellable === false)}</div>`;
      });
      else if (page === 'items') rows = items.map(({ itemId, count }) => {
        const item = findItem(itemId)!;
        const equipped = Object.values(status.equipment).includes(itemId);
        return `<div class="player-item-row"><span>${html(game.itemName(item.id))} ×${count}${equipped ? '（装備中）' : ''}<small>${html(item.description)} ${comparison(item)}${item.equipment ? `　装備Lv ${item.equipment.requiredLevel ?? 1}` : !item.effect ? `　素材・売値 ${item.sellPrice}G` : ''}</small></span>${item.equipment ? button('equip', equipped ? '装備中' : '装備する', itemId, undefined, equipped) : isFieldItem(item) ? button('use', '使う', itemId) : ''}</div>`;
      });
      else if (page === 'collection') rows = itemCatalog.map(item => discovered.includes(item.id)
        ? `<div class="player-item-row"><span>${html(game.itemName(item.id))}<small>${html(item.description)}　所持 ${items.find(entry => entry.itemId === item.id)?.count ?? 0}個</small></span></div>`
        : '<div class="player-item-row"><span>？？？<small>未入手</small></span></div>');
      else if (page === 'spells') {
        rows = status.skills.flatMap(id => {
          const skill = findSkill(id)!;
          if (!isFieldSpell(skill)) return [];
          return [`<div class="player-item-row"><span>${html(skill.name)}　${skillMpLabel(skill, status.totalMpReduction)}<small>${html(skill.description)}</small></span>${button('spell', '使う', id, undefined, status.mp < skillMpCost(skill, status.totalMpReduction))}</div>`];
        });
        if (game.returnPortal) rows.push(button('return-portal','ゲートへ戻る'));
        if (game.mistSteps) rows.push(`<p>ステルス：あと${game.mistSteps}歩</p>`);
      } else if (page === 'equipment') {
        rows = equipmentSlots.map(slot => {
          const id = status.equipment[slot];
          return `<div class="player-item-row"><span>${slotNames[slot]}：${id === null ? 'なし' : html(game.itemName(id))}</span>${id === null ? '' : button('unequip', '外す', undefined, slot)}</div>`;
        });
        rows.push(...items.filter(({ itemId }) => findItem(itemId)!.equipment).map(({ itemId }) => {
          const item = findItem(itemId)!;
          const equipped = Object.values(status.equipment).includes(itemId);
          return `<div class="player-item-row"><span>${html(game.itemName(item.id))}${equipped ? '（装備中）' : ''}<small>${html(item.description)} ${comparison(item)}　装備Lv ${item.equipment!.requiredLevel ?? 1}</small></span>${button('equip', equipped ? '装備中' : '装備する', itemId, undefined, equipped)}</div>`;
        }));
      } else rows = [`<p>基礎最大HP ${status.baseStats.hp} ＋ 装備 ${status.maxHp - status.baseStats.hp}<br>基礎最大MP ${status.baseStats.mp} ＋ 装備 ${status.maxMp - status.baseStats.mp}<br>基礎攻撃力 ${status.baseStats.attack} ＋ 装備 ${status.attack - status.baseStats.attack}<br>基礎防御力 ${status.baseStats.defense} ＋ 装備 ${status.defense - status.baseStats.defense}<br>基礎魔力 ${status.baseStats.magic} ＋ 装備 ${status.magic - status.baseStats.magic}<br>呪文MP軽減 ${status.totalMpReduction}（最低1MP）<br>会心率 ${Math.round(status.criticalChance * 100)}%　物理回避率 ${Math.round(status.evasionChance * 100)}%</p>`,
        ...status.skillSchedule.map(({ id, learned }) => {
          const skill = findSkill(id)!, kind = skill.kind === 'technique' ? '特技' : '魔法';
          return learned ? `<p>${kind}：${html(skill.name)}　${skillMpLabel(skill, status.totalMpReduction)}　習得済み<small>${html(skill.description)}</small></p>`
            : `<p>${kind}：???</p>`;
        }),
        ...((status.experienceMultiplier > 1 || status.walkExperience || status.walkRegen || status.victoryMpRecovery || status.goldMultiplier > 1) ? [`<p>装備の特殊効果：${[
          status.experienceMultiplier > 1 ? `戦闘経験値＋${Math.round((status.experienceMultiplier-1)*100)}%` : '',
          status.walkExperience ? `1歩ごとにEXP＋${status.walkExperience}` : '',
          status.walkRegen ? `${status.walkRegen.steps}歩ごとにHP＋${status.walkRegen.hp}・MP＋${status.walkRegen.mp}（あと${status.walkRegen.steps-status.regenSteps}歩）` : '',
          status.victoryMpRecovery ? `勝利時にMP＋${status.victoryMpRecovery}` : '',
          status.goldMultiplier > 1 ? `戦闘ゴールド${status.goldMultiplier}倍` : '',
        ].filter(Boolean).join('／')}</p>`] : []),
        ...(game.story ? [`<p data-story-objective>冒険：${html(game.story.title)}<br>${html(game.story.objective)}</p>`] : [])];
      get('[data-player-list]').innerHTML = rows.join('') || '<p>なし</p>';
      if (shop && store!.merchant === 'casino-dealer' && page === 'race') {
        const sprite = enemyPixelSprites['leaf-gel'];
        root.querySelectorAll<HTMLCanvasElement>('[data-casino-racer]').forEach(canvas => { const context=canvas.getContext('2d'); if(context) drawSprite(context,sprite,Math.floor((64-sprite.width)/2),Math.floor((64-sprite.height)/2)); });
      }
      if (!shop && page === 'map') {
        const anchor = worldMapAnchor(game.stages, game.scene.id, game.position, mapStageId), canvas = root.querySelector<HTMLCanvasElement>('[data-world-map]')!;
        paintWorldMap(canvas, anchor.scene, mapLandmarks(anchor.scene, game.stages, game.visitedStageIds));
        const pin = root.querySelector<HTMLElement>('[data-world-map-pin]')!; pin.hidden = anchor.x === null;
        pin.style.left = `${(anchor.x ?? 0)/anchor.scene.width*100}%`; pin.style.top = `${(anchor.y ?? 0)/anchor.scene.height*100}%`;
      }
      if (!shop && page === 'status') get('[data-player-list]').innerHTML += `<p>主人公：${html(status.name)} ${button('rename', '名前変更')}</p><p>${html(game.saveStatus)}</p><p>称号：${html(status.titles.join('、') || 'なし')}</p>${button('reset-save', 'はじめから（セーブ初期化）')}`;
      get('[data-player-feedback]').textContent = feedback;
      get('[data-player-feedback]').dataset.purified = 'false';
      root.querySelectorAll<HTMLButtonElement>('[data-menu-action]').forEach(action => action.addEventListener('click', () => {
        if (!active() || action.disabled) return;
        const game = getGame()!;
        if (shop && !game.shop || !shop && (game.encounter || game.shop || game.message)) return;
        selected = navigationButtons().indexOf(action);
        if (action.dataset.menuAction === 'rename') {
          const name = window.prompt('主人公の名前（1〜20文字）', game.status.name);
          if (name !== null) feedback = game.rename(name).message;
          render(true); changed(); return;
        }
        if (action.dataset.menuAction === 'reset-save') {
          if (!window.confirm('保存した主人公と全世界の進行を消して、最初から始めますか？')) return;
          game.reset(); closeInventory(); feedback = ''; changed(); return;
        }
        if (action.dataset.menuAction === 'decline-purify') { game.closeShop(); feedback = ''; changed(); return; }
        const id = Number(action.dataset.menuItem);
        if(action.dataset.menuAction === 'map-stage') { mapStageId = id === -1 ? undefined : id; render(true); return; }
        const result = action.dataset.menuAction === 'purify' ? game.purify() : action.dataset.menuAction === 'return-portal' ? game.returnToPortal() : runFacilityAction(game, action.dataset.menuAction!, id) ?? (action.dataset.menuAction==='claim-bounty' ? game.claimBounty(id) : action.dataset.menuAction==='pray' ? game.pray() : action.dataset.menuAction === 'buy' ? game.buy(id) : action.dataset.menuAction === 'sell' ? game.sell(id) : action.dataset.menuAction === 'exchange' ? game.exchange(id)
          : action.dataset.menuAction === 'rest' ? game.rest() : action.dataset.menuAction === 'equip' ? game.equip(id) : action.dataset.menuAction === 'unequip' ? game.unequip(action.dataset.menuSlot as EquipmentSlot) : action.dataset.menuAction === 'spell' ? game.useFieldSkill(id) : game.useItem(id));
        feedback = result.message;
        if (result.ok && (action.dataset.menuAction === 'return-portal' || action.dataset.menuAction === 'spell' && findSkill(id)?.effect.type === 'dungeon-escape')) closeInventory();
        render(true); changed();
        if (result.ok && action.dataset.menuAction === 'purify') { get('[data-player-feedback]').dataset.purified = 'true'; onPurified(); }
      }));
      const buttons = navigationButtons();
      selected = Math.min(selected, buttons.length - 1);
      if (focus) buttons[selected].focus({ preventScroll: true });
    }
    get(shop ? '[data-shop-close]' : '[data-play-close-items]').addEventListener('click', () => {
      if (!active()) return;
      if (shop) { getGame()?.closeShop(); changed(); } else closeInventory();
      feedback = ''; snapshot = '';
    });
    return {
      render,
      reset(): void { mapStageId = undefined; snapshot = ''; feedback = ''; page = shop ? 'buy' : 'items'; selected = 0; lastShop = null; if (shop) root.hidden = true; },
      keydown(event: KeyboardEvent): void {
        if (!active()) return;
        const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
        if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'e', 'Enter', ' ', 'Escape'].includes(key)) return;
        event.preventDefault(); if (event.repeat) return;
        const buttons = navigationButtons();
        const focusedIndex = buttons.indexOf(event.target as HTMLButtonElement);
        if (focusedIndex >= 0) selected = focusedIndex;
        if (key === 'Escape') buttons.at(-1)!.click();
        else if (['ArrowLeft', 'ArrowRight', 'a', 'd'].includes(key)) {
          const tabs = [...root.querySelectorAll<HTMLButtonElement>('[data-player-tab]')];
          const index = tabs.findIndex(tab => tab.dataset.playerTab === page);
          tabs[(index + (['ArrowLeft', 'a'].includes(key) ? -1 : 1) + tabs.length) % tabs.length].click();
        } else if (['ArrowUp', 'ArrowDown', 'w', 's'].includes(key)) {
          selected = (selected + (['ArrowUp', 'w'].includes(key) ? -1 : 1) + buttons.length) % buttons.length;
          buttons[selected].focus({ preventScroll: true });
        } else {
          // Native Tab navigation and pointer focus must agree with the decision key.
          const focused = [...root.querySelectorAll<HTMLButtonElement>('[data-player-tab]'), ...buttons].find(button => button === event.target);
          (focused ?? buttons[selected % buttons.length]).click();
        }
      },
    };
  }
  const inventory = mount(inventoryRoot, false), shop = mount(shopRoot, true);
  return {
    sync(): void { inventory.render(); shop.render(); },
    reset(): void { inventory.reset(); shop.reset(); },
    keydown(event: KeyboardEvent): void {
      (getGame()?.shop ? shop : inventory).keydown(event);
    },
  };
}
