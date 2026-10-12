import names from './enemy-catalog.json';

// The same registry is used by the Python compiler. Only registered files become enemies.
const files = import.meta.glob<unknown>('./enemies/*.json', { eager: true, import: 'default' });
if (new Set(names).size !== names.length) throw new Error('敵configの登録名が重複しています。');
export default names.map(name => {
  if (typeof name !== 'string' || !/^[a-z0-9-]+$/.test(name)) throw new Error('敵configの登録名を確認してください。');
  const definition = files[`./enemies/${name}.json`];
  if (definition === undefined) throw new Error(`敵config「${name}.json」が見つかりません。`);
  return definition;
});
