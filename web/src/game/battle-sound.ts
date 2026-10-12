/** 音はボタン操作で有効にする。外部音声ファイルを増やさず短いレトロ音を合成。 */
export function createBattleSound() {
  const key = 'tagquest.sound.enabled';
  let enabled = false, context: AudioContext | undefined;
  let resuming: Promise<void> | undefined;
  let revision = 0, disposed = false;
  try { enabled = localStorage.getItem(key) === 'true'; } catch { /* 保存できなくても切り替えられる。 */ }
  function prepare(): AudioContext | undefined {
    if (disposed) return undefined;
    try {
      if (!context) context = new AudioContext();
      // resumeは操作イベント内で呼び、同じ復帰処理を初回のplayとも共有する。
      if (context.state === 'suspended' && !resuming) {
        const pending = context.resume().catch(() => {});
        resuming = pending;
        void pending.then(() => { if (resuming === pending) resuming = undefined; });
      }
      return context;
    } catch { return undefined; }
  }
  function emit(audio: AudioContext, kind: 'enemy' | 'player' | 'heal'): void {
    try {
      const oscillator = audio.createOscillator(), gain = audio.createGain(), time = audio.currentTime;
      oscillator.type = kind === 'heal' ? 'triangle' : 'square';
      oscillator.frequency.setValueAtTime(kind === 'player' ? 160 : kind === 'heal' ? 440 : 660, time);
      oscillator.frequency.exponentialRampToValueAtTime(kind === 'heal' ? 880 : 70, time + 0.12);
      gain.gain.setValueAtTime(0.035, time); gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.14);
      oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(time); oscillator.stop(time + 0.15);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    } catch { /* 音の失敗は戦闘の進行を止めない。 */ }
  }
  return {
    get enabled() { return enabled; },
    toggle(): boolean {
      if (disposed) return false;
      revision++;
      enabled = !enabled;
      if (enabled && !prepare()) enabled = false;
      try { localStorage.setItem(key, String(enabled)); } catch { /* 任意の設定。 */ }
      return enabled;
    },
    play(kind: 'enemy' | 'player' | 'heal'): void {
      if (!enabled) return;
      const audio = prepare();
      if (!audio) return;
      if (audio.state === 'running') { emit(audio, kind); return; }
      const requestedRevision = revision;
      void resuming?.then(() => {
        // 待機中のOFF切替・画面終了後に遅れて鳴らさない。
        if (!disposed && enabled && revision === requestedRevision && context === audio && audio.state === 'running') emit(audio, kind);
      });
    },
    dispose(): void { disposed = true; revision++; if (context) void context.close().catch(() => {}); context = undefined; resuming = undefined; },
  };
}
