import {
  CanvasTexture,
  DataTexture,
  RGBAFormat,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
} from 'three';

/** True when a DOM canvas is available (a real browser or jsdom); false under plain Node (vitest). */
export function hasDom(): boolean {
  return typeof document !== 'undefined';
}

/**
 * Draws a size x size canvas texture, or (when no DOM exists, e.g. unit
 * tests) returns a flat 1x1 DataTexture of `fallback` so callers work in
 * both environments without branching.
 */
export function proceduralTexture(
  size: number,
  draw: (ctx: CanvasRenderingContext2D, size: number) => void,
  fallback: [number, number, number, number] = [120, 120, 120, 255],
): Texture {
  if (!hasDom()) {
    const data = new Uint8Array(fallback);
    const tex = new DataTexture(data, 1, 1, RGBAFormat);
    tex.needsUpdate = true;
    return tex;
  }
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  draw(ctx, size);
  return new CanvasTexture(canvas);
}

/** Applies standard tiling settings used by every ground/surface texture. */
export function tileTexture(tex: Texture, repeatX: number, repeatY: number, srgb: boolean): void {
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 8;
  if (srgb) tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
}

function hash2(x: number, y: number, seed: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Fractal value noise in [0, 1]. */
export function fbm(x: number, y: number, seed: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(x * freq, y * freq, seed + o * 17.13) * amp;
    total += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / total;
}

/** Builds a texture with `text` centred on a solid background, for signs/boards. */
export function canvasTextTexture(
  text: string,
  opts: { width?: number; height?: number; bg?: string; fg?: string; fontPx?: number } = {},
): Texture {
  const width = opts.width ?? 256;
  const height = opts.height ?? 128;
  const bg = opts.bg ?? '#123a1f';
  const fg = opts.fg ?? '#ffffff';
  const fontPx = opts.fontPx ?? 64;
  return proceduralTexture(
    Math.max(width, height),
    (ctx) => {
      ctx.canvas.width = width;
      ctx.canvas.height = height;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = fg;
      ctx.font = `bold ${fontPx}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, width / 2, height / 2);
    },
    [255, 255, 255, 255],
  );
}
