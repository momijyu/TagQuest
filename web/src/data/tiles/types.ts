/** Web側に持つ描画素材。マップの配置データとは分離する。 */
export interface PixelTile {
  readonly size: number;
  readonly palette: readonly string[];
  /** 0–9、a–zは色番号（0–35）、ドット（.）は透過部分。 */
  readonly pixels: readonly string[];
}
