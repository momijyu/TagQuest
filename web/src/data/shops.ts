import definitions from './shop-catalog.json';
import { findItem } from './items';
import { record, whole, label } from './catalog-validation';
import { findExchangeRecipe } from './exchanges';
export interface ShopDefinition { readonly merchant: string; readonly name: string; readonly items: readonly number[]; readonly recipes?: readonly number[] }
export function parseShopCatalog(value: unknown): readonly ShopDefinition[] {
  if (!Array.isArray(value)) throw new Error('お店一覧の形式が違います。');
  const seen = new Set<string>();
  return value.map(entry => {
    const data = record(entry), merchant = label(data.merchant);
    if (!['weapon-merchant', 'armor-merchant', 'item-merchant'].includes(merchant) || seen.has(merchant)) throw new Error('お店の店員が不明か重複しています。');
    seen.add(merchant);
    if (!Array.isArray(data.items)) throw new Error('商品をIDの配列で設定してください。');
    const items = data.items.map(id => whole(id, 0, 255));
    if (new Set(items).size !== items.length || items.some(id => !findItem(id))) throw new Error('商品IDが不明か重複しています。');
    let recipes: number[] | undefined;
    if (data.recipes !== undefined) {
      if (!Array.isArray(data.recipes)) throw new Error('交換レシピをIDの配列で設定してください。');
      recipes = data.recipes.map(id => whole(id, 0, 255));
      if (new Set(recipes).size !== recipes.length || recipes.some(id => !findExchangeRecipe(id))) throw new Error('交換レシピIDが不明か重複しています。');
    }
    return { merchant, name: label(data.name), items, ...(recipes === undefined ? {} : { recipes }) };
  });
}
export const shopCatalog = parseShopCatalog(definitions);
export const findShop = (merchant: string) => shopCatalog.find(shop => shop.merchant === merchant);
