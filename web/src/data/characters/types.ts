export interface ImageSprite {
  readonly image: HTMLImageElement;
  readonly sourceX: number;
  readonly sourceY: number;
  readonly width: number;
  readonly height: number;
  readonly pixelCorrections?: readonly {
    readonly x: number;
    readonly y: number;
    readonly color: string;
  }[];
}
