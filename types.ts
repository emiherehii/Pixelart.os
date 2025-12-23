
export enum DitherMode {
  BAYER = 'BAYER',
  THRESHOLD = 'THRESHOLD',
  HALFTONE = 'HALFTONE',
  STOCHASTIC = 'STOCHASTIC',
}

export interface FilterSettings {
  pixelSize: number;
  contrast: number;
  brightness: number;
  threshold: number;
  mode: DitherMode;
  invert: boolean;
  dotScale: number;
  colorA: string; // Dark/Background color (Hex)
  colorB: string; // Light/Foreground color (Hex)
}

export type SourceType = 'image' | 'video' | null;

export interface MediaState {
  sourceType: SourceType;
  originalUrl: string | null;
  processedUrl: string | null;
  isLoading: boolean;
  isExporting: boolean;
  exportProgress: number;
}
