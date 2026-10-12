import { escapeHtml } from '../game/html';
import { playerConfig, parsePlayerDefinition } from '../data/encounters/combat-config';
import { itemCatalog, equipmentSlots, slotNames, findItem } from '../data/items';
import { progressionConfig } from '../data/progression';
import { whole } from '../data/catalog-validation';
import type { WorldGameOptions } from '../game/world';
export const trialMarkup = `<details class="editor-panel"><summary>試遊時の主人公</summary>
  <label><input id="editor-trial-enabled" type="checkbox"> 試遊用の設定を使う</label>
  <p>エディタの「プレイ」だけに適用します。</p>
  <div class="editor-form">
    <label>開始レベル<input id="editor-trial-level" type="number" min="1" max="${progressionConfig.levelThresholds.length}" value="${playerConfig.level ?? 1}"></label>
    <label>所持金（G）<input id="editor-trial-gold" type="number" min="0" max="999999999" value="${playerConfig.initialGold ?? 0}"></label>
    ${equipmentSlots.map(slot => `<label>${slotNames[slot]}<select id="editor-trial-${slot}"><option value="">なし</option>${itemCatalog.filter(item => item.equipment?.slot === slot).map(item => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('')}</select></label>`).join('')}
    <details><summary>開始時の所持品</summary>${itemCatalog.map(item => `<label>${escapeHtml(item.name)}<input data-trial-item="${item.id}" type="number" min="0" max="9999" value="${playerConfig.initialItems?.find(entry => entry.itemId === item.id)?.quantity ?? 0}"></label>`).join('')}</details>
    <p>選んだ装備は所持品にも1個加えます。装備可能レベルに達している必要があります。HP・MPは全快で開始します。</p>
  </div>
</details>`;
export function readTrialOptions(root: HTMLElement): WorldGameOptions {
  const get = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#editor-trial-${id}`)!;
  if (!get<HTMLInputElement>('enabled').checked) return {};
  const level = whole(Number(get<HTMLInputElement>('level').value), 1, progressionConfig.levelThresholds.length);
  const gold = whole(Number(get<HTMLInputElement>('gold').value), 0, 999999999);
  const equipment = equipmentSlots.flatMap(slot => {
    const value = get<HTMLSelectElement>(slot).value;
    if (value === '') return [];
    const id = whole(Number(value), 0, 255), item = findItem(id);
    if (item?.equipment?.slot !== slot) throw new Error('試遊用の装備部位が違います。');
    if (level < (item.equipment.requiredLevel ?? 1)) throw new Error(`${item.name}はレベル${item.equipment.requiredLevel}から装備できます。`);
    return [id];
  });
  const items = [...root.querySelectorAll<HTMLInputElement>('[data-trial-item]')].map(input => ({ itemId: Number(input.dataset.trialItem), quantity: whole(Number(input.value), 0, 9999) })).filter(item => item.quantity > 0);
  for (const id of equipment) if (!items.some(item => item.itemId === id)) items.push({ itemId: id, quantity: 1 });
  return { player: parsePlayerDefinition({ ...playerConfig, initialExperience: progressionConfig.levelThresholds[level - 1], initialGold: gold, initialItems: items }), initialEquipment: equipment };
}
