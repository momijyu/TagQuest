/** 床のマス寸法に収まる必要のない、重ね描き用の素材。 */
export interface PixelSprite {
  readonly width: number;
  readonly height: number;
  readonly palette: readonly string[];
  /** 0–9、a–zは色番号（0–35）、ドット（.）は透過部分。 */
  readonly pixels: readonly string[];
}
