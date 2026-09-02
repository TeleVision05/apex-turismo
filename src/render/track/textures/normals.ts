import { Texture } from 'three';
import { fbm, hasDom, proceduralTexture, tileTexture } from './base';

/** Builds a normal map by finite-differencing a scalar height field, so it stays consistent with a diffuse map built from the same field. */
export function normalMapFromHeight(
  size: number,
  heightAt: (u: number, v: number) => number,
  strength = 1.6,
): Texture {
  return proceduralTexture(
    size,
    (ctx) => {
      const img = ctx.createImageData(size, size);
      const step = 1 / size;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const u = x / size;
          const v = y / size;
          const h = heightAt(u, v);
          const hx = heightAt(u + step, v);
          const hy = heightAt(u, v + step);
          const nx = (h - hx) * strength;
          const ny = (h - hy) * strength;
          const nz = 1;
          const len = Math.hypot(nx, ny, nz);
          const idx = (y * size + x) * 4;
          img.data[idx] = ((nx / len) * 0.5 + 0.5) * 255;
          img.data[idx + 1] = ((ny / len) * 0.5 + 0.5) * 255;
          img.data[idx + 2] = ((nz / len) * 0.5 + 0.5) * 255;
          img.data[idx + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    },
    [128, 128, 255, 255],
  );
}

/** Corrugated-metal normal map: horizontal ridges across the band's height, tiled along its length. */
export function corrugationNormalMap(size: number): Texture {
  if (!hasDom()) return normalMapFromHeight(1, () => 0);
  const ridges = 3;
  const tex = normalMapFromHeight(size, (u) => Math.sin(u * ridges * Math.PI * 2) * 0.5 + 0.5, 3);
  tileTexture(tex, 1, 1, false);
  return tex;
}

/** Same fine noise field used by the asphalt diffuse map, exposed for its normal map. */
export function asphaltHeightAt(u: number, v: number): number {
  return fbm(u * 48, v * 48, 11, 3);
}
