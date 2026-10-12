import illustrationIds from './enemy-illustration-ids.json';

export type EnemyIllustrations = Readonly<Record<string, HTMLImageElement>>;
const urls = import.meta.glob<string>('../../assets/enemies/*.png', { eager: true, query: '?url', import: 'default' });

/** 原案のPNGは参考用に保持し、紹介画面の折りたたみ欄から表示する。 */
export function enemyReferenceUrl(id: string): string | undefined {
  return illustrationIds.includes(id) ? urls[`../../assets/enemies/${id}.png`] : undefined;
}

/** 参考PNGが登録された敵だけを読み込む。 */
export async function loadEnemyIllustrations(): Promise<EnemyIllustrations> {
  const entries = await Promise.all(illustrationIds.filter(id => enemyReferenceUrl(id)).map(async id => {
    const url = enemyReferenceUrl(id);
    if (!url) throw new Error(`敵の画像がありません：${id}`);
    const image = new Image(); image.src = url;
    await image.decode();
    return [id, image] as const;
  }));
  return Object.fromEntries(entries);
}
