export const residentKinds = ['traveler', 'resident', 'elder'] as const;
export const npcKinds = ['king', 'weapon-merchant', 'armor-merchant', 'item-merchant', ...residentKinds, 'cave-witch', 'forest-fairy', 'demon-lord', 'demon-guard', 'innkeeper', 'guild-master', 'sister', 'alchemist', 'unique-monster', 'blacksmith', 'shrine-keeper', 'casino-dealer', 'black-market-dealer', 'fortune-teller', 'captain', 'corral-keeper'] as const;
export const npcPlacement = { width: 16, height: 32 } as const;

export function isNpc(kind: string): boolean {
  return npcKinds.some(name => name === kind);
}

export function isTownResident(kind: string): boolean {
  return residentKinds.some(name => name === kind);
}

// 32pxの絵を16px幅の枠の中央に描く。JSON/バイナリは枠の左上を保存する。
export function npcDrawingPosition(position: { readonly x: number; readonly y: number }) {
  return { x: position.x - 8, y: position.y };
}

export function legacyNpcPosition(position: { readonly x: number; readonly y: number }) {
  return { x: position.x + 8, y: position.y };
}
