import families from './wall-families.json';

export type WallKind = keyof typeof families;
const aliases = new Map<string, WallKind>();
for (const [kind, names] of Object.entries(families)) for (const name of names) aliases.set(name, kind as WallKind);

/** 旧JSONの向き別の名前も、保存時には素材ごとに1種類へまとめる。 */
export const canonicalTile = (name: string): string => aliases.get(name) ?? name;
export const wallKind = (name: string | undefined): WallKind | undefined => name === undefined ? undefined : aliases.get(name);
