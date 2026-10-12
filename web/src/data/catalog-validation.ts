export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('一覧の設定形式が違います。');
  return value as Record<string, unknown>;
}
export function whole(value: unknown, min = 0, max = 999999): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw new Error(`数値は${min}〜${max}の整数にしてください。`);
  return value;
}
export function label(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || new TextEncoder().encode(value).length > 1024 || /[\u0000-\u001f\u007f\ud800-\udfff]/u.test(value)) throw new Error('名前は空でないUTF-8 1024バイト以内の文字列にしてください。');
  return value;
}
