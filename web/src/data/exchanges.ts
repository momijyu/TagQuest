import definitions from './exchange-recipes.json';
import { findItem } from './items';
import { record, whole } from './catalog-validation';

export interface ExchangeRecipe {
  readonly id: number;
  readonly ingredients: readonly { readonly itemId: number; readonly quantity: number }[];
  readonly result: { readonly itemId: number; readonly quantity: number };
  readonly gold: number;
}
export function parseExchangeRecipes(value: unknown): readonly ExchangeRecipe[] {
  if (!Array.isArray(value)) throw new Error('素材交換のレシピ一覧を設定してください。');
  const seen = new Set<number>();
  const item = (value: unknown) => {
    const data = record(value), itemId = whole(data.itemId, 0, 255), quantity = whole(data.quantity, 1, 999999);
    if (!findItem(itemId)) throw new Error('レシピのアイテムIDが不明です。');
    return { itemId, quantity };
  };
  return value.map(value => {
    const data = record(value), id = whole(data.id, 0, 255);
    if (seen.has(id)) throw new Error('レシピIDが重複しています。');
    seen.add(id);
    if (!Array.isArray(data.ingredients) || !data.ingredients.length) throw new Error('必要素材を1種類以上設定してください。');
    const ingredients = data.ingredients.map(item);
    if (new Set(ingredients.map(entry => entry.itemId)).size !== ingredients.length) throw new Error('必要素材のIDが重複しています。');
    return { id, ingredients, result: item(data.result), gold: whole(data.gold ?? 0) };
  });
}
export const exchangeRecipes = parseExchangeRecipes(definitions);
export const findExchangeRecipe = (id: number) => exchangeRecipes.find(recipe => recipe.id === id);
