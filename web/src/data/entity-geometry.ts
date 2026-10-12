import frames from './entity-frames.json';
export function placementFrame(entity: { kind: string; x: number; y: number; parameters: readonly number[] }) {
  const frame = entity.kind.startsWith('moat-') ? { x: 0, y: 0, width: entity.parameters[0] * 2, height: entity.parameters[1] * 2 }
    : frames[entity.kind as keyof typeof frames];
  if (!frame) throw new Error(`配置枠が未登録です：${entity.kind}`);
  return { ...frame, x: entity.x + frame.x, y: entity.y + frame.y };
}
export function validatePlacement(entity: Parameters<typeof placementFrame>[0], width: number, height: number): void {
  const frame = placementFrame(entity);
  if (frame.x < 0 || frame.y < 0 || frame.x + frame.width > width * 16 || frame.y + frame.height > height * 16) throw new Error(`${entity.kind}の配置枠がマップからはみ出しています。`);
}
