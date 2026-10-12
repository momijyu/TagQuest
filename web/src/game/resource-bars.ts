/** progressを使い、色だけに依存せず数値と読み上げ名も残す。 */
export function updateResourceBar(bar: HTMLProgressElement, value: number, max: number, name: string): void {
  bar.max = Math.max(1, max); // MP上限0でも不定状態にしない。
  bar.value = value;
  bar.setAttribute('aria-label', name);
  bar.setAttribute('aria-valuetext', `${value} / ${max}`);
  bar.dataset.level = max > 0 && value / max <= 0.25 ? 'danger' : max > 0 && value / max <= 0.5 ? 'warning' : 'normal';
}
