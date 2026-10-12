import { weaponShop, armorShop, itemShop } from '../data/objects/town-shops';
import { weaponShopkeeper, armorShopkeeper, itemShopkeeper } from '../data/characters/shopkeepers';
import { drawSprite } from './sprite';

export const townShops = {
  weapon: { ...weaponShop, shopkeeper: weaponShopkeeper },
  armor: { ...armorShop, shopkeeper: armorShopkeeper },
  item: { ...itemShop, shopkeeper: itemShopkeeper },
} as const;

// 売り場 → 店員 → カウンターの順に重ね、カウンター越しに接客する。
// 素材プレビュー用。実際の会話・売買は歩行とプレイUIで扱う。
export function drawShopPreview(
  context: CanvasRenderingContext2D,
  shop: typeof townShops[keyof typeof townShops],
  x = 0,
  y = 0,
): void {
  drawSprite(context, shop.building, x, y);
  drawSprite(context, shop.shopkeeper, x + 24, y + 30);
  drawSprite(context, shop.counter, x, y);
}
