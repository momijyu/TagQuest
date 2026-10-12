/** 戦闘背景だけの草原・森。マップの床やNFCの配置には追加しない。 */
export function drawBattleOutdoors(context: CanvasRenderingContext2D, forest: boolean): void {
  const rect = (color: string, x: number, y: number, width: number, height: number) => {
    context.fillStyle = color; context.fillRect(x, y, width, height);
  };
  const oval = (color: string, x: number, y: number, rx: number, ry: number) => {
    context.fillStyle = color; context.beginPath(); context.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); context.fill();
  };
  for (let y = 0; y < 104; y++) rect(forest ? `hsl(158 30% ${26 + y * 0.16}%)` : `hsl(199 64% ${61 + y * 0.16}%)`, 0, y, 320, 1);
  if (!forest) {
    oval('#e8f3e9', 58, 29, 29, 7); oval('#e8f3e9', 78, 24, 20, 10); oval('#e8f3e9', 246, 34, 34, 8);
  }
  oval(forest ? '#345945' : '#70a35b', 80, 101, 150, 33);
  oval(forest ? '#2e523d' : '#5e934d', 263, 105, 135, 37);
  for (let y = 103; y < 192; y++) rect(`hsl(${forest ? 115 : 95} ${forest ? 29 : 41}% ${forest ? 35 + (y - 103) * 0.16 : 45 + (y - 103) * 0.13}%)`, 0, y, 320, 1);
  if (forest) {
    for (const [x, width] of [[14, 16], [54, 9], [272, 12], [304, 18]]) {
      rect('#344034', x, 0, width, 119); rect('#4e5941', x + 2, 0, width / 3, 115);
      oval('#254c39', x + width / 2, 11, 41, 26); oval('#315d40', x + width / 2 + 15, 24, 31, 17);
      oval('#31533b', x + width / 2, 119, width + 10, 8);
    }
  }
  oval(forest ? '#668456' : '#97b567', 160, 165, 93, 17);
  for (let index = 0; index < 28; index++) {
    const x = (index * 73 + 17) % 320, y = 122 + (index * 29 % 66);
    if (x > 76 && x < 244 && y < 180) continue;
    context.strokeStyle = forest ? '#355a37' : '#54823f'; context.lineWidth = 1;
    context.beginPath(); context.moveTo(x - 3, y - 3); context.lineTo(x, y); context.lineTo(x + 2, y - 5); context.stroke();
  }
}
