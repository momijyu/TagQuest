const saveKey = 'tagquest.play-save.v1';

/** 既存の世界別撃破フラグから読むため、セーブ形式・URLの追加領域は不要。 */
export function hasTrueClear(storage: Pick<Storage, 'getItem'>): boolean {
  try {
    const raw = storage.getItem(saveKey);
    if (!raw || raw.length > 4000000) return false;
    const saved = JSON.parse(raw);
    if (saved.version !== 1 || !saved.worlds || typeof saved.worlds !== 'object' || Array.isArray(saved.worlds)) return false;
    return Object.values(saved.worlds).some(value => {
      const progress = value as { cleared?: boolean; defeatCounts?: unknown } | null;
      return progress?.cleared === true && Array.isArray(progress.defeatCounts)
        && progress.defeatCounts.some(pair => Array.isArray(pair) && pair[0] === 11 && Number.isSafeInteger(pair[1]) && pair[1] > 0);
    });
  } catch { return false; }
}

export function mountClearRecord(element: HTMLElement): () => void {
  function refresh(): void {
    try { element.hidden = !hasTrueClear(window.localStorage); } catch { element.hidden = true; }
  }
  refresh();
  window.addEventListener('hashchange', refresh);
  window.addEventListener('storage', refresh);
  return () => { window.removeEventListener('hashchange', refresh); window.removeEventListener('storage', refresh); };
}
