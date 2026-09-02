import { Texture } from 'three';
import { fbm, proceduralTexture, tileTexture } from './base';
import { asphaltHeightAt, normalMapFromHeight } from './normals';

export interface AsphaltTextures {
  map: Texture;
  normalMap: Texture;
}

/** Dark tarmac with fine speckle noise and faint darker patches, tiled across the road ribbon. */
export function buildAsphaltTextures(size: number): AsphaltTextures {
  const map = proceduralTexture(
    size,
    (ctx) => {
      ctx.fillStyle = '#3a3a3d';
      ctx.fillRect(0, 0, size, size);
      const img = ctx.getImageData(0, 0, size, size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const u = x / size;
          const v = y / size;
          const patch = fbm(u * 3, v * 3, 3, 3);
          const speckle = fbm(u * 48, v * 48, 11, 3);
          const grey = 46 + (speckle - 0.5) * 30 + (patch - 0.55) * 26;
          const idx = (y * size + x) * 4;
          img.data[idx] = grey;
          img.data[idx + 1] = grey;
          img.data[idx + 2] = grey + 1;
          img.data[idx + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    },
    [58, 58, 60, 255],
  );
  tileTexture(map, 1, 1, true);
  const normalMap = normalMapFromHeight(size, asphaltHeightAt, 1.4);
  tileTexture(normalMap, 1, 1, false);
  return { map, normalMap };
}

/** Green grass with noise and a few yellowish dry patches, for run-off. */
export function buildGrassTexture(size: number): Texture {
  const tex = proceduralTexture(
    size,
    (ctx) => {
      const img = ctx.createImageData(size, size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const u = x / size;
          const v = y / size;
          const blade = fbm(u * 60, v * 60, 21, 3);
          const dry = fbm(u * 4, v * 4, 5, 2);
          const dryness = Math.max(0, dry - 0.55) * 2;
          const g = 90 + blade * 55;
          const r = 40 + blade * 30 + dryness * 90;
          const b = 30 + blade * 20;
          const idx = (y * size + x) * 4;
          img.data[idx] = r;
          img.data[idx + 1] = g;
          img.data[idx + 2] = b;
          img.data[idx + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    },
    [50, 110, 40, 255],
  );
  tileTexture(tex, 1, 1, true);
  return tex;
}

/** Beige/grey gravel-trap noise. */
export function buildGravelTexture(size: number): Texture {
  const tex = proceduralTexture(
    size,
    (ctx) => {
      const img = ctx.createImageData(size, size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const u = x / size;
          const v = y / size;
          const n = fbm(u * 40, v * 40, 31, 4);
          const shade = 150 + (n - 0.5) * 60;
          const idx = (y * size + x) * 4;
          img.data[idx] = shade + 10;
          img.data[idx + 1] = shade;
          img.data[idx + 2] = shade - 20;
          img.data[idx + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    },
    [170, 160, 140, 255],
  );
  tileTexture(tex, 1, 1, true);
  return tex;
}

/** Large-scale (4km repeat) colour variation overlay for the terrain, so it isn't flat green everywhere. */
export function buildTerrainVariationTexture(size: number): Texture {
  const tex = proceduralTexture(
    size,
    (ctx) => {
      const img = ctx.createImageData(size, size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const u = x / size;
          const v = y / size;
          const n = fbm(u * 6, v * 6, 41, 4);
          const idx = (y * size + x) * 4;
          img.data[idx] = 70 + n * 60;
          img.data[idx + 1] = 95 + n * 70;
          img.data[idx + 2] = 55 + n * 40;
          img.data[idx + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    },
    [85, 120, 70, 255],
  );
  tileTexture(tex, 1, 1, true);
  return tex;
}
