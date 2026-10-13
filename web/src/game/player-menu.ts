import { findItem, itemCatalog, equipmentSlots, slotNames } from '../data/items';
import type { EquipmentSlot } from '../data/items';
import type { createWorldGame } from './world';
import { escapeHtml as html } from './html';
import { updateResourceBar } from './resource-bars';
import { findSkill } from '../data/skills';
import { findExchangeRecipe } from '../data/exchanges';

type World = ReturnType<typeof createWorldGame>;
/** プレイ画面内の所持品・装備・ステータスと店の売買。 */
export function mountPlayerMenus(inventoryRoot: HTMLElement, shopRoot: HTMLElement, getGame: () => World | undefined,
  active: () => boolean, changed: () => void, closeInventory: () => void) {
  function mount(root: HTMLElement, shop: boolean) {
    root.innerHTML = `<strong data-menu-title></strong><p class="player-stats" data-player-stats></p>
      <div class="resource-meter"><span data-menu-hp></span><progress class="resource-bar" data-menu-hp-bar></progress></div>
      <div class="resource-meter"><span data-menu-mp></span><progress class="resource-bar resource-mp" data-menu-mp-bar></progress></div>
      <div class="player-menu-tabs" data-player-tabs role="group" aria-label="メニュー"></div>
      <p data-play-items></p><div class="player-menu-list" data-player-list></div>
      <p class="player-feedback" data-player-feedback role="status" aria-live="polite"></p>
      <button class="btn btn-sm" ${shop ? 'data-shop-close' : 'data-play-close-items'}>とじる</button>`;
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
        if (store !== lastShop) { lastShop = store; page = 'buy'; feedback = ''; focus = true; }
      }
      const items = game.inventory, status = game.status, discovered = game.discoveredItems;
      const key = JSON.stringify({ items, status, discovered, story: game.story, page, store, feedback });
      if (key === snapshot && !focus) return;
      snapshot = key;
      get('[data-menu-title]').textContent = shop ? store!.name : page === 'collection' ? 'アイテムずかん' : page === 'equipment' ? 'そうび' : page === 'status' ? 'つよさ' : page === 'spells' ? 'まほう' : 'どうぐ';
      get('[data-player-stats]').textContent = `${status.name}　Lv ${status.level}　${status.gold}G\n攻撃力 ${status.attack}　防御力 ${status.defense}\n経験値 ${status.experience}　${status.nextLevelExperience === null ? '最高レベル' : `次まで ${status.nextLevelExperience - status.experience}`}`;
      get('[data-menu-hp]').textContent = `HP ${status.hp} / ${status.maxHp}${status.poisoned ? '　毒' : ''}`;
      get('[data-menu-mp]').textContent = `MP ${status.mp} / ${status.maxMp}`;
      updateResourceBar(get('[data-menu-hp-bar]') as HTMLProgressElement, status.hp, status.maxHp, `${status.name}のHP`);
      updateResourceBar(get('[data-menu-mp-bar]') as HTMLProgressElement, status.mp, status.maxMp, `${status.name}のMP`);
      const tabs = shop ? [['buy', '買う'], ['sell', '売る'], ...(store!.recipes?.length ? [['exchange', '素材交換']] : [])] : [['items', 'どうぐ'], ['spells', 'まほう'], ['equipment', 'そうび'], ['status', 'つよさ'], ['collection', 'ずかん']];
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

        return ['hp', 'mp', 'attack', 'defense'].map((key, i) => {
          const k = key as 'hp' | 'mp' | 'attack' | 'defense';
          const base = status.baseStats[k], total = Math.min(9999, base + Object.values(status.equipment).reduce<number>((sum, id) => sum + (id === null ? 0 : findItem(id)?.equipment?.[k] ?? 0), 0));
          const after = Math.min(9999, base + Object.entries(status.equipment).reduce((sum, [slot, id]) => sum + (slot === gear.slot ? gear[k] ?? 0 : id === null ? 0 : findItem(id)?.equipment?.[k] ?? 0), 0));
          const delta = after - total;
          return `${['最大HP', '最大MP', '攻撃', '防御'][i]} ${delta >= 0 ? '+' : ''}${delta}`;
        }).join(' / ');
      };
      let rows: string[] = [];
      if (shop && page === 'buy') rows = store!.items.map(id => {
        const item = findItem(id)!;
        const count = items.find(entry => entry.itemId === id)?.count ?? 0;
        const equipped = Object.values(status.equipment).includes(id);
        return `<div class="player-item-row"><span>${html(item.name)}　${item.price}G　所持 ${count}個${equipped ? '（装備中）' : ''}<small>${html(item.description)} ${comparison(item)}${item.equipment ? `　装備Lv ${item.equipment.requiredLevel ?? 1}` : ''}</small></span>${button('buy', '買う', id)}</div>`;
      });
      else if (shop && page === 'exchange') rows = (store!.recipes ?? []).map(id => {
        const recipe = findExchangeRecipe(id)!, item = findItem(recipe.result.itemId)!;
        const materials = recipe.ingredients.map(({ itemId, quantity }) => {
          const count = items.find(entry => entry.itemId === itemId)?.count ?? 0;
          return `${findItem(itemId)!.name} ${count}/${quantity}個${Object.values(status.equipment).includes(itemId) ? '（装備中の1個は使えません）' : ''}`;
        }).join('・');
        return `<div class="player-item-row"><span>${html(item.name)} ×${recipe.result.quantity}<small>${html(item.description)} ${comparison(item)}</small><small>必要素材（所持/必要）：${html(materials)}${recipe.gold ? `　＋${recipe.gold}G` : '　手数料なし'}</small></span>${button('exchange', '交換する', id)}</div>`;
      });
      else if (shop) rows = items.map(({ itemId, count }) => {
        const item = findItem(itemId)!, equipped = Object.values(status.equipment).includes(itemId);
        return `<div class="player-item-row"><span>${html(item.name)} ×${count}　${item.sellPrice}G${equipped ? '（装備中）' : ''}</span>${button('sell', '売る', itemId)}</div>`;
      });
      else if (page === 'items') rows = items.map(({ itemId, count }) => {
        const item = findItem(itemId)!;
        const equipped = Object.values(status.equipment).includes(itemId);
        return `<div class="player-item-row"><span>${html(item.name)} ×${count}${equipped ? '（装備中）' : ''}<small>${html(item.description)} ${comparison(item)}${item.equipment ? `　装備Lv ${item.equipment.requiredLevel ?? 1}` : !item.effect ? `　素材・売値 ${item.sellPrice}G` : ''}</small></span>${item.equipment ? button('equip', equipped ? '装備中' : '装備する', itemId, undefined, equipped) : item.effect ? button('use', '使う', itemId) : ''}</div>`;
      });
      else if (page === 'collection') rows = itemCatalog.map(item => discovered.includes(item.id)
        ? `<div class="player-item-row"><span>${html(item.name)}<small>${html(item.description)}　所持 ${items.find(entry => entry.itemId === item.id)?.count ?? 0}個</small></span></div>`
        : '<div class="player-item-row"><span>？？？<small>未入手</small></span></div>');
      else if (page === 'spells') {
        rows = status.skills.flatMap(id => {
          const skill = findSkill(id)!;
          if (skill.kind !== 'spell' || skill.effect.type !== 'heal-hp') return [];
          return [`<div class="player-item-row"><span>${html(skill.name)}　MP ${skill.mpCost}<small>HPを${skill.effect.amount}回復</small></span>${button('spell', '使う', id)}</div>`];
        });
      } else if (page === 'equipment') {
        rows = equipmentSlots.map(slot => {
          const id = status.equipment[slot];
          return `<div class="player-item-row"><span>${slotNames[slot]}：${id === null ? 'なし' : html(findItem(id)!.name)}</span>${id === null ? '' : button('unequip', '外す', undefined, slot)}</div>`;
        });
        rows.push(...items.filter(({ itemId }) => findItem(itemId)!.equipment).map(({ itemId }) => {
          const item = findItem(itemId)!;
          const equipped = Object.values(status.equipment).includes(itemId);
          return `<div class="player-item-row"><span>${html(item.name)}${equipped ? '（装備中）' : ''}<small>${html(item.description)} ${comparison(item)}　装備Lv ${item.equipment!.requiredLevel ?? 1}</small></span>${button('equip', equipped ? '装備中' : '装備する', itemId, undefined, equipped)}</div>`;
        }));
      } else rows = [`<p>基礎最大HP ${status.baseStats.hp} ＋ 装備 ${status.maxHp - status.baseStats.hp}<br>基礎最大MP ${status.baseStats.mp} ＋ 装備 ${status.maxMp - status.baseStats.mp}<br>基礎攻撃力 ${status.baseStats.attack} ＋ 装備 ${status.attack - status.baseStats.attack}<br>基礎防御力 ${status.baseStats.defense} ＋ 装備 ${status.defense - status.baseStats.defense}</p>`,
        ...status.skillSchedule.map(({ id, learned }) => {
          const skill = findSkill(id)!, kind = skill.kind === 'technique' ? '特技' : '魔法';
          return learned ? `<p>${kind}：${html(skill.name)}　MP ${skill.mpCost}　習得済み<small>${html(skill.description)}</small></p>`
            : `<p>${kind}：???</p>`;
        }),
        ...(game.story ? [`<p data-story-objective>冒険：${html(game.story.title)}<br>${html(game.story.objective)}</p>`] : [])];
      get('[data-player-list]').innerHTML = rows.join('') || '<p>なし</p>';
      get('[data-player-feedback]').textContent = feedback;
      root.querySelectorAll<HTMLButtonElement>('[data-menu-action]').forEach(action => action.addEventListener('click', () => {
        if (!active() || action.disabled) return;
        const game = getGame()!;
        if (shop && !game.shop || !shop && (game.encounter || game.shop || game.message)) return;
        selected = navigationButtons().indexOf(action);
        const id = Number(action.dataset.menuItem);
        const result = action.dataset.menuAction === 'buy' ? game.buy(id) : action.dataset.menuAction === 'sell' ? game.sell(id) : action.dataset.menuAction === 'exchange' ? game.exchange(id)
          : action.dataset.menuAction === 'equip' ? game.equip(id) : action.dataset.menuAction === 'unequip' ? game.unequip(action.dataset.menuSlot as EquipmentSlot) : action.dataset.menuAction === 'spell' ? game.useFieldSkill(id) : game.useItem(id);
        feedback = result.message; render(true); changed();
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
      reset(): void { snapshot = ''; feedback = ''; page = shop ? 'buy' : 'items'; selected = 0; lastShop = null; if (shop) root.hidden = true; },
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
