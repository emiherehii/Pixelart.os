
import { DitherMode, FilterSettings } from '../types';

const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5]
].map(row => row.map(v => v / 16));

const hexToRgb = (hex: string) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
};

export const applyFiltersToCanvas = (
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  settings: FilterSettings,
  outputCanvas: HTMLCanvasElement
) => {
  const { pixelSize, contrast, brightness, threshold, mode, invert, dotScale, colorA, colorB } = settings;
  const ctx = outputCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const scale = 1 / pixelSize;
  const w = Math.floor(sourceWidth * scale);
  const h = Math.floor(sourceHeight * scale);

  // Temporary processing canvas
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = w;
  tempCanvas.height = h;
  const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
  if (!tempCtx) return;

  tempCtx.drawImage(source, 0, 0, w, h);
  const imageData = tempCtx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const rgbA = hexToRgb(colorA);
  const rgbB = hexToRgb(colorB);

  const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));

  for (let i = 0; i < data.length; i += 4) {
    const x = (i / 4) % w;
    const y = Math.floor((i / 4) / w);

    let r = data[i];
    let g = data[i+1];
    let b = data[i+2];

    r = contrastFactor * (r - 128) + 128 + brightness;
    g = contrastFactor * (g - 128) + 128 + brightness;
    b = contrastFactor * (b - 128) + 128 + brightness;

    let gray = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    gray = Math.min(1, Math.max(0, gray));

    let output = 0;
    switch (mode) {
      case DitherMode.BAYER:
        output = gray > (BAYER_4X4[y % 4][x % 4] * 0.8 + (threshold / 255) * 0.2) ? 1 : 0;
        break;
      case DitherMode.HALFTONE:
        const dx = (x % 2) / 2 - 0.5;
        const dy = (y % 2) / 2 - 0.5;
        output = gray > (Math.sqrt(dx * dx + dy * dy) * dotScale + (threshold / 255) * 0.2) ? 1 : 0;
        break;
      case DitherMode.STOCHASTIC:
        output = gray > (Math.random() * 0.6 + (threshold / 255) * 0.4) ? 1 : 0;
        break;
      case DitherMode.THRESHOLD:
      default:
        output = gray > (threshold / 255) ? 1 : 0;
        break;
    }

    if (invert) output = 1 - output;
    const finalColor = output === 1 ? rgbB : rgbA;
    data[i] = finalColor.r;
    data[i+1] = finalColor.g;
    data[i+2] = finalColor.b;
    data[i+3] = 255;
  }

  tempCtx.putImageData(imageData, 0, 0);

  outputCanvas.width = sourceWidth;
  outputCanvas.height = sourceHeight;
  const outCtx = outputCanvas.getContext('2d');
  if (outCtx) {
    outCtx.imageSmoothingEnabled = false;
    outCtx.drawImage(tempCanvas, 0, 0, sourceWidth, sourceHeight);
  }
};

export const processImage = async (
  image: HTMLImageElement,
  settings: FilterSettings
): Promise<string> => {
  const canvas = document.createElement('canvas');
  applyFiltersToCanvas(image, image.width, image.height, settings, canvas);
  return canvas.toDataURL('image/png');
};
