type Stop = () => void;
export const savedSessionLock = 'tagquest.play-save.v1.session';

/** 保存を読む前に排他権を取り、画面を閉じるまで保持する。 */
export function startSavedSession(start: (saving: boolean) => Stop, current: () => boolean,
  locks: Pick<LockManager, 'request'> | undefined): Promise<Stop> {
  if (!locks) return Promise.resolve(current() ? start(false) : () => {});
  return new Promise<Stop>((resolve, reject) => {
    let stopped = false;
    let stop: Stop | undefined, release: (() => void) | undefined;
    const dispose = () => {
      if (stopped) return;
      stopped = true;
      try { stop?.(); } finally { release?.(); }
    };
    try {
      void locks.request(savedSessionLock, { mode: 'exclusive', ifAvailable: true }, async lock => {
        if (!current()) { resolve(() => {}); return; }
        if (!lock) throw new Error('別の画面で冒険が開かれています。そちらを閉じて、この画面を再読み込みしてください。');
        const finished = new Promise<void>(done => { release = done; });
        stop = start(true);
        resolve(dispose);
        // コールバックが終わると排他権が解放される。
        await finished;
      }).catch(error => { dispose(); reject(error); });
    } catch (error) { dispose(); reject(error); }
  });
}
