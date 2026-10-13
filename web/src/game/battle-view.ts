import { createBattleSound } from './battle-sound';
import type { ImageSprite } from '../data/characters/types';
import { findItem } from '../data/items';
import { drawImageSprite } from '../renderer/image-sprite';
import type { EncounterEvent, EncounterOutcome } from './world';
import { findEnemy } from '../data/encounters/combat-config';
import { createBattle } from './battle';
import type { Battle } from './battle';
import { escapeHtml } from './html';
import { findSkill } from '../data/skills';
import { updateResourceBar } from './resource-bars';
import type { EnemyIllustrations } from '../data/encounters/enemy-illustrations';
import { drawBattleOutdoors } from '../renderer/battle-outdoors';
import { enemyPixelSprites } from '../data/encounters/enemy-pixels';
import { drawSprite } from '../renderer/sprite';

/** 戦闘状態の表示と操作。ターンの計算はbattle.tsが担当する。 */
export function mountBattleView(root: HTMLElement, king: ImageSprite, isActive: () => boolean, onExit: (outcome: EncounterOutcome) => void,
  supplies: { inventory?: () => readonly { itemId: number; count: number }[]; gold?: () => number; illustrations?: EnemyIllustrations } = {}) {
  root.innerHTML = `<div class="battle-field">
    <div class="battle-speech-slot"><div class="battle-speech game-window" data-battle-speech hidden aria-hidden="true"><p data-battle-speech-text></p></div></div>
    <div class="battle-scene">
    <div class="battle-art" data-battle-art>
      <span class="battle-damage battle-damage-enemy" data-battle-damage-enemy hidden aria-hidden="true"></span>
      <canvas width="320" height="192" data-battle-canvas aria-label="遭遇した敵"></canvas>
      <div class="battle-enemy" data-battle-enemy><span class="game-window battle-enemy-name"><span data-battle-enemy-name></span><small data-battle-enemy-hp></small></span></div>
    </div>
    </div>
  </div>
  <div class="battle-footer game-window">
    <div class="battle-party" data-battle-party-status role="group" aria-label="主人公の状態">
      <span class="battle-damage battle-damage-player" data-battle-damage-player hidden aria-hidden="true"></span>
      <div class="battle-party-heading"><button data-battle-sound class="btn btn-sm" aria-pressed="false">音: OFF</button><strong data-battle-player-name></strong><span class="battle-resources" data-battle-resources></span></div>
      <div class="battle-player-health" data-battle-player-health><span data-battle-player-hp></span><progress class="resource-bar" data-battle-player-hp-bar></progress></div>
      <div class="battle-player-mana"><span data-battle-player-mp></span><progress class="resource-bar resource-mp" data-battle-player-mp-bar></progress></div>
    </div>
    <div class="battle-selection">
      <p class="battle-turn" data-battle-party>コマンド</p>
      <p class="battle-log" data-battle-log role="status" aria-live="polite"></p>
      <div class="battle-commands" data-battle-commands role="group" aria-label="戦闘コマンド">
        <button data-battle-command="attack">たたかう</button>
        <button data-battle-command="items">どうぐ</button>
        <button data-battle-command="guard">ぼうぎょ</button>
        <button data-battle-command="escape">にげる</button>
        <button data-battle-command="techniques">とくぎ</button>
        <button data-battle-command="spells">まほう</button>
      </div>
      <div class="battle-panel" data-battle-panel hidden>
        <div class="battle-item-list" data-battle-item-list hidden></div>
        <div class="battle-skill-list" data-battle-skill-list hidden></div>
        <button data-battle-next hidden>つづける</button>
        <button data-battle-back>もどる</button>
      </div>
    </div>
  </div>`;
  const get = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const canvas = get<HTMLCanvasElement>('[data-battle-canvas]');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2Dを利用できません。');
  const commands = [...root.querySelectorAll<HTMLButtonElement>('[data-battle-command]')];
  const enemy = get('[data-battle-enemy]');
  const next = get<HTMLButtonElement>('[data-battle-next]');
  const back = get<HTMLButtonElement>('[data-battle-back]');
  let encounter: EncounterEvent | null = null;
  let inventory: readonly { itemId: number; count: number }[] = [];
  let battle: Battle | null = null;
  let menu: 'commands' | 'items' | 'techniques' | 'spells' = 'commands';
  let selected = 0;
  let selectedItem = 0;
  let notice = '';
  let selectedSkill = 0;
  const sound = createBattleSound();
  const soundButton = get<HTMLButtonElement>('[data-battle-sound]');
  let lastFeedback = 0;
  function showSound(): void {
    soundButton.textContent = sound.enabled ? '音: ON' : '音: OFF';
    soundButton.setAttribute('aria-pressed', String(sound.enabled));
  }
  soundButton.addEventListener('click', () => { if (isActive()) { sound.toggle(); showSound(); } });
  showSound();
  function clearFeedback(): void {
    for (const key of ['art', 'party-status']) get(`[data-battle-${key}]`).classList.remove('battle-impact');
    for (const key of ['enemy', 'player']) { const number = get(`[data-battle-damage-${key}]`); number.hidden = true; number.classList.remove('battle-number'); }
  }
  function showFeedback(): void {
    const feedback = battle?.feedback;
    if (!feedback || feedback.id === lastFeedback) return;
    lastFeedback = feedback.id; clearFeedback();
    const number = get(`[data-battle-damage-${feedback.target === 'enemy' ? 'enemy' : 'player'}]`);
    number.textContent = feedback.target === 'heal' ? feedback.amount ? `+${feedback.amount}` : '回復' : String(feedback.amount);
    number.dataset.heal = String(feedback.target === 'heal'); number.hidden = false;
    void number.offsetWidth; number.classList.add('battle-number');
    if (feedback.target !== 'heal') {
      const hit = get(`[data-battle-${feedback.target === 'enemy' ? 'art' : 'party-status'}]`);
      void hit.offsetWidth; hit.classList.add('battle-impact');
    }
    sound.play(feedback.target);
  }

  function drawEnemy(): void {
    if (!context) return;
    const pixels = battle?.enemy.battleImage ? enemyPixelSprites[battle.enemy.battleImage] : undefined;
    const illustrated = !pixels && Boolean(battle?.enemy.battleImage);
    const resolution = illustrated ? 3 : 1;
    if (canvas.width !== 320 * resolution) { canvas.width = 320 * resolution; canvas.height = 192 * resolution; }
    context.setTransform(resolution, 0, 0, resolution, 0, 0);
    get('[data-battle-art]').dataset.illustrated = String(illustrated);
    get('[data-battle-art]').dataset.monster = String(Boolean(battle?.enemy.battleImage));
    context.imageSmoothingEnabled = false;
    const rect = (color: string, x: number, y: number, w: number, h: number) => {
      context.fillStyle = color; context.fillRect(x, y, w, h);
    };
    if (!battle?.enemy.background || battle.enemy.background === 'castle') {
      // 共通素材としての城内背景。床配置やNFCデータには追加しない。
      rect('#50596a', 0, 0, 320, 192);
      rect('#84909d', 0, 0, 320, 76);
      for (let y = 0; y < 76; y += 16) for (let x = -(y % 32 ? 16 : 0); x < 320; x += 32) {
        rect('#c4c8c8', x + 1, y + 1, 30, 14);
        rect('#e0dfd6', x + 1, y + 1, 30, 2);
      }
      rect('#5a6371', 0, 74, 320, 8);
      rect('#eeece4', 0, 82, 320, 110);
      for (let y = 82; y < 192; y += 22) {
        rect('#c7cdd1', 0, y, 320, 1);
        for (let x = y % 44 ? 20 : 0; x < 320; x += 40) rect('#c7cdd1', x, y, 1, 22);
      }
      for (let y = 82; y < 192; y++) {
        const half = 26 + Math.floor((y - 82) * 0.55);
        rect('#d9b65f', 160 - half - 2, y, half * 2 + 4, 1);
        rect('#962540', 160 - half, y, half * 2, 1);
      }
      for (const x of [38, 262]) {
        rect('#657181', x - 12, 22, 29, 93);
        rect('#f2eee2', x - 10, 20, 24, 10);
        rect('#bcc9ce', x - 7, 30, 18, 72);
        rect('#f3f1e6', x - 5, 30, 6, 72);
        rect('#e5e8de', x + 3, 30, 4, 72);
        rect('#f2eee2', x - 12, 102, 28, 10);
        rect('#c2c8c7', x - 14, 112, 32, 4);
      }
    } else if (battle.enemy.background === 'cave') {
      rect('#171b2b', 0, 0, 320, 192);
      for (let y = 0; y < 112; y += 16) for (let x = -(y % 32 ? 16 : 0); x < 320; x += 32) {
        rect('#303442', x + 1, y + 1, 30, 14);
        rect('#414657', x + 2, y + 2, 27, 2);
      }
      rect('#44404d', 0, 112, 320, 80);
      for (let y = 120; y < 192; y += 16) for (let x = y % 32 ? 8 : 24; x < 320; x += 40) rect('#555161', x, y, 12, 2);
      for (const x of [25, 277]) {
        rect('#344554', x, 84, 12, 28); rect('#60969f', x + 3, 88, 6, 23); rect('#98c5c8', x + 3, 88, 2, 18);
      }
    } else drawBattleOutdoors(context, battle.enemy.background === 'forest');
    if (battle?.phase !== 'victory') {
      const image = battle?.enemy.battleImage ? supplies.illustrations?.[battle.enemy.battleImage] : undefined;
      if (pixels) {
        const scale = Math.max(1, Math.floor(Math.min(168 / pixels.width, 122 / pixels.height)));
        const width = pixels.width * scale;
        const shadowWidth = Math.max(2, Math.floor(width * 0.8));
        const lowerWidth = Math.max(2, Math.floor(width * 0.6));
        rect('#263f33', Math.floor((320 - shadowWidth) / 2), 172, shadowWidth, 4);
        rect('#263f33', Math.floor((320 - lowerWidth) / 2), 176, lowerWidth, 2);
        drawSprite(context, pixels, Math.floor((320 - pixels.width * scale) / 2), 176 - pixels.height * scale, scale);
      } else if (image) {
        const width = image.naturalWidth, height = image.naturalHeight;
        const scale = Math.min(168 / width, 122 / height);
        context.fillStyle = '#263f3366'; context.beginPath(); context.ellipse(160, 174, 44, 5, 0, 0, Math.PI * 2); context.fill();
        context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
        context.drawImage(image, 0, 0, width, height, 160 - width * scale / 2, 176 - height * scale, width * scale, height * scale);
      } else if (battle?.enemy.characterId === 'king') {
        rect('#612339', 120, 158, 80, 6);
        drawImageSprite(context, king, 112, 64, 1.5);
      } else {
        context.fillStyle = '#f8f8ed'; context.font = '14px sans-serif'; context.textAlign = 'center';
        context.fillText('画像未登録', 160, 128);
      }
    }
    if (battle?.phase === 'player-action' && battle.action === 'attack') {
      for (let i = 0; i < 11; i++) {
        rect('#d3a349', 136 + i * 4, 140 - i * 4, 5, 5);
        rect('#fff3bd', 135 + i * 4, 138 - i * 4, 3, 3);
      }
    }
  }
  function render(focus = false): void {
    if (!encounter || !battle) return;
    const phase = battle.phase;
    inventory = supplies.inventory?.() ?? inventory;
    const choosing = phase === 'commands', browsing = choosing && menu === 'items';
    const usableItems = inventory.filter(({ itemId, count }) => count > 0 && findItem(itemId)?.effect);
    const browsingSkills = choosing && (menu === 'techniques' || menu === 'spells');
    const skills = (battle.player.skills ?? []).map(findSkill).filter(skill => skill && (skill.learnLevel ?? 1) <= (battle!.player.level ?? 1) && skill.kind === (menu === 'techniques' ? 'technique' : 'spell'));
    get('[data-battle-commands]').hidden = !choosing || menu !== 'commands';
    get('[data-battle-panel]').hidden = choosing && menu === 'commands';
    get('[data-battle-enemy-name]').textContent = encounter.name;
    get('[data-battle-enemy-hp]').textContent = `HP ${battle.enemyHp} / ${battle.enemy.stats.hp}`;
    get('[data-battle-player-name]').textContent = `${battle.player.name}　Lv ${battle.player.level ?? 1}${battle.poisoned ? '　毒' : ''}`;
    get('[data-battle-player-hp]').textContent = `HP ${battle.playerHp} / ${battle.player.stats.hp}`;
    get('[data-battle-player-mp]').textContent = `MP ${battle.playerMp} / ${battle.player.maxMp ?? 0}`;
    get('[data-battle-resources]').textContent = `${supplies.gold?.() ?? 0}G`;
    const hpBar = get<HTMLProgressElement>('[data-battle-player-hp-bar]');
    updateResourceBar(hpBar, battle.playerHp, battle.player.stats.hp, `${battle.player.name}のHP`);
    updateResourceBar(get<HTMLProgressElement>('[data-battle-player-mp-bar]'), battle.playerMp, battle.player.maxMp ?? 0, `${battle.player.name}のMP`);
    get('[data-battle-player-health]').dataset.health = battle.playerHp / battle.player.stats.hp <= 0.25 ? 'danger' : battle.playerHp / battle.player.stats.hp <= 0.5 ? 'warning' : 'normal';
    get('[data-battle-speech]').hidden = !battle.speech || menu !== 'commands';
    get('[data-battle-speech-text]').textContent = battle.speech ?? '';
    enemy.hidden = phase === 'victory';
    commands.forEach((button, index) => {
      button.dataset.selected = String(index === selected);
      button.setAttribute('aria-pressed', String(index === selected));
    });
    get('[data-battle-log]').textContent = browsingSkills ? notice || (skills.length ? '技を選んでください。' : 'まだ覚えていない。') : browsing ? notice || (usableItems.length ? 'どうぐを選んでください。' : '使えるどうぐを持っていない。') : battle.text;
    get('[data-battle-party]').textContent = phase === 'enemy-action' || phase === 'defeat' ? '敵のターン' : browsingSkills ? menu === 'techniques' ? 'とくぎ' : 'まほう' : browsing || phase === 'player-action' && battle.action === 'item' ? 'どうぐ' : phase === 'player-action' && battle.action === 'guard' ? 'ぼうぎょ' : 'コマンド';
    const itemList = get('[data-battle-item-list]');
    itemList.hidden = !browsing || !usableItems.length;
    itemList.innerHTML = browsing ? usableItems.map(({ itemId, count }) => {
      const item = findItem(itemId)!;
      return `<button data-battle-item="${itemId}">${escapeHtml(item.name)} ×${count}<small>${escapeHtml(item.description)}</small></button>`;
    }).join('') : '';
    const itemButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-battle-item]')];
    selectedItem = Math.min(selectedItem, Math.max(0, itemButtons.length - 1));
    itemButtons.forEach(button => {
      button.addEventListener('click', () => useItem(Number(button.dataset.battleItem)));
    });
    const skillList = get('[data-battle-skill-list]');
    skillList.hidden = !browsingSkills;
    skillList.innerHTML = browsingSkills ? skills.map(skill => `<button data-battle-skill="${skill!.id}">${escapeHtml(skill!.name)}　MP ${skill!.mpCost}<small>${escapeHtml(skill!.description)}</small></button>`).join('') : '';
    const skillButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-battle-skill]')];
    skillButtons.forEach(button => {
      button.disabled = findSkill(Number(button.dataset.battleSkill))!.mpCost > battle!.playerMp;
      button.addEventListener('click', () => chooseSkill(Number(button.dataset.battleSkill)));
    });
    selectedSkill = Math.min(selectedSkill, Math.max(0, skillButtons.filter(button => !button.disabled).length - 1));
    next.hidden = choosing;
    next.textContent = phase === 'defeat' ? '復活する' : phase === 'escape' || phase === 'victory' ? 'フィールドに戻る' : 'つづける';
    back.hidden = !choosing || menu === 'commands';
    drawEnemy(); showFeedback();
    if (focus) (browsingSkills ? skillButtons.filter(button => !button.disabled)[selectedSkill] ?? back : browsing ? itemButtons[selectedItem] ?? back : choosing ? commands[selected] : next).focus({ preventScroll: true });
  }
  function chooseSkill(skillId: number): void {
    if (!isActive() || !battle || battle.phase !== 'commands' || !['techniques', 'spells'].includes(menu)) return;
    const skill = findSkill(skillId)!;
    if (skill.mpCost > battle.playerMp) { notice = 'MPが足りない。'; render(true); return; }
    notice = '';
    const result = battle.useSkill(skillId);
    if (result.ok) menu = 'commands'; else notice = result.message;
    render(true);
  }
  function useItem(itemId: number): void {
    if (!isActive() || !battle || battle.phase !== 'commands' || menu !== 'items') return;
    const result = battle.useItem(itemId);
    if (result.ok) { menu = 'commands'; notice = ''; } else notice = result.message;
    render(true);
  }
  function choose(index: number): void {
    if (!isActive() || !battle || battle.phase !== 'commands' || menu !== 'commands') return;
    selected = index;
    notice = ''; selectedItem = 0; selectedSkill = 0;
    const command = commands[index].dataset.battleCommand;
    if (command === 'attack') battle.attack();
    else if (command === 'items') menu = 'items';
    else if (command === 'techniques' || command === 'spells') menu = command;
    else if (command === 'guard') battle.guard();
    else battle.escape();
    render(true);
  }
  function returnToCommands(): void {
    if (!isActive() || !battle || !['commands', 'escape'].includes(battle.phase)) return;
    battle.cancelEscape(); menu = 'commands';
    notice = ''; render(true);
  }
  function advance(): void {
    if (!isActive() || !battle) return;
    if (battle.phase === 'escape' || battle.phase === 'victory' || battle.phase === 'defeat') onExit(battle.phase);
    else { battle.advance(); render(true); }
  }
  commands.forEach((button, index) => button.addEventListener('click', () => choose(index)));
  back.addEventListener('click', returnToCommands);
  next.addEventListener('click', advance);
  return {
    dispose(): void { clearFeedback(); sound.dispose(); },
    focus(): void { if (battle && isActive()) render(true); },
    sync(event: EncounterEvent | null, items: typeof inventory, session?: Battle): void {
      root.hidden = !event;
      if (event === encounter) return;
      clearFeedback(); lastFeedback = 0;
      encounter = event; inventory = items; menu = 'commands'; selected = 0; selectedItem = 0; notice = ''; selectedSkill = 0;
      battle = event ? session ?? createBattle(findEnemy(event.enemyId)!) : null;
      if (event) render(true);
    },
    keydown(event: KeyboardEvent): void {
      if (!battle || !isActive()) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'e', 'Enter', ' ', 'Escape'].includes(key)) return;
      event.preventDefault();
      if (event.repeat) return;
      if (key === 'Escape') { returnToCommands(); return; }
      if (['e', 'Enter', ' '].includes(key)) {
        if (battle.phase === 'commands' && menu === 'commands') choose(selected);
        else if (battle.phase === 'commands' && menu === 'items') {
          const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-battle-item]')].filter(button => !button.disabled);
          if (buttons.length) useItem(Number(buttons[selectedItem % buttons.length].dataset.battleItem)); else returnToCommands();
        }
        else if (battle.phase === 'commands' && (menu === 'techniques' || menu === 'spells')) {
          const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-battle-skill]')].filter(button => !button.disabled);
          if (buttons.length) chooseSkill(Number(buttons[selectedSkill % buttons.length].dataset.battleSkill)); else returnToCommands();
        }
        else advance();
      } else if (battle.phase === 'commands' && (menu === 'techniques' || menu === 'spells')) {
        const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-battle-skill]')].filter(button => !button.disabled);
        if (buttons.length) { selectedSkill = (selectedSkill + (['ArrowUp', 'ArrowLeft', 'w', 'a'].includes(key) ? -1 : 1) + buttons.length) % buttons.length; buttons[selectedSkill].focus({ preventScroll: true }); }
      } else if (battle.phase === 'commands' && menu === 'items') {
        const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-battle-item]')].filter(button => !button.disabled);
        if (buttons.length) { selectedItem = (selectedItem + (['ArrowUp', 'ArrowLeft', 'w', 'a'].includes(key) ? -1 : 1) + buttons.length) % buttons.length; buttons[selectedItem].focus({ preventScroll: true }); }
      } else if (battle.phase === 'commands' && menu === 'commands') {
        const delta = ['ArrowUp', 'w'].includes(key) ? -2 : ['ArrowDown', 's'].includes(key) ? 2 : ['ArrowLeft', 'a'].includes(key) ? -1 : 1;
        selected = (selected + delta + commands.length) % commands.length; render(true);
      }
    },
  };
}
