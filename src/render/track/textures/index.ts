import type { Texture } from 'three';
import { buildAsphaltTextures } from './surfaces';
import { buildGrassTexture, buildGravelTexture, buildTerrainVariationTexture } from './surfaces';
import { buildCatchFenceTexture } from './fence';
import { corrugationNormalMap } from './normals';

export interface TextureSet {
  asphaltMap: Texture;
  asphaltNormal: Texture;
  grass: Texture;
  gravel: Texture;
  terrainVariation: Texture;
  catchFence: Texture;
  armcoNormal: Texture;
  all: Texture[];
}

export function buildTextureSet(size: number): TextureSet {
  const asphalt = buildAsphaltTextures(size);
  const grass = buildGrassTexture(size);
  const gravel = buildGravelTexture(size);
  const terrainVariation = buildTerrainVariationTexture(Math.max(size, 512));
  const catchFence = buildCatchFenceTexture(Math.min(size, 128));
  const armcoNormal = corrugationNormalMap(Math.min(size, 128));
  return {
    asphaltMap: asphalt.map,
    asphaltNormal: asphalt.normalMap,
    grass,
    gravel,
    terrainVariation,
    catchFence,
    armcoNormal,
    all: [asphalt.map, asphalt.normalMap, grass, gravel, terrainVariation, catchFence, armcoNormal],
  };
}

export * from './base';
