import { decodeScenes } from './scenes';
import publicConfig from '../data/public-config.json';
export function base64url(bytes: Uint8Array): string {
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function gameUrl(bytes: Uint8Array, base: string): string {
  const url = new URL(base);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('公開先のHTTP/HTTPS URLを入力してください。');
  url.hash = base64url(bytes); return url.href;
}
export function readGameHash(hash: string) {
  const value = hash.replace(/^#(?:game=)?/, '');
  if (!value || value.length > 400000 || !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) throw new Error('ゲームURLのデータが空か、途中で切れています。');
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  if (base64url(bytes) !== value) throw new Error('ゲームURLのデータが壊れています。');
  return decodeScenes(bytes);
}
/** 単一NDEF URIレコード + Type 2 Tag TLV + 終端。追加レコードは含めない。 */
export function ndefSize(url: string): number {
  const prefix = ['https://www.', 'http://www.', 'https://', 'http://'].find(p => url.startsWith(p)) ?? '';
  const payload = 1 + new TextEncoder().encode(url.slice(prefix.length)).length;
  const record = (payload <= 255 ? 4 : 7) + payload;
  return (record < 255 ? 2 : 4) + record + 1;
}

export const isGameHash = (hash: string): boolean => hash.startsWith('#game=') || /^#VF(?:[EFGH]|$)/.test(hash);

/** Default Capability Container limits, distinct from physical user-memory sizes. */
export const nfcTagPresets = [
  { id: 'ntag213', name: 'NTAG213', userBytes: 144, ndefBytes: 144 },
  { id: 'ntag215', name: 'NTAG215', userBytes: 504, ndefBytes: 496 },
  { id: 'ntag216', name: 'NTAG216', userBytes: 888, ndefBytes: 872 },
] as const;
export function defaultPublicBase(location?: { hostname: string; origin: string }): string {
  return location?.hostname.endsWith('.vercel.app') && location.origin.startsWith('https://')
    ? location.origin + '/' : publicConfig.baseUrl;
}
export function nfcBudget(bytes: Uint8Array, base: string, capacity: number, reserved = 0) {
  if (!Number.isInteger(capacity) || capacity < 1 || !Number.isInteger(reserved) || reserved < 0)
    throw new Error('容量上限・予約領域は正しい整数で入力してください。');
  const url = gameUrl(bytes, base), ndefBytes = ndefSize(url);
  return { url, urlBytes: new TextEncoder().encode(url).length, ndefBytes,
    usedBytes: ndefBytes + reserved, remainingBytes: capacity - ndefBytes - reserved };
}
