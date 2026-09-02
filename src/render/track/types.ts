import type * as THREE from 'three';
import type { RacingLine } from '../../track/RacingLine';
import type { TimeOfDay } from '../../core/types';

export interface TrackSceneOptions {
  quality: 'low' | 'medium' | 'high' | 'ultra';
  timeOfDay: TimeOfDay;
  /** null = do not build the racing line ribbon */
  racingLine: RacingLine | null;
}

export interface TrackScene {
  /** add to the scene; everything lives under it */
  group: THREE.Group;
  /** asphalt surfaces (used by the renderer for reflections/decals) */
  roadMeshes: THREE.Mesh[];
  setRacingLineVisible(v: boolean): void;
  /** recolours ribbon segments [from, from+count) (sample indices, wrapping) with colour(i) */
  recolorRacingLine(
    from: number,
    count: number,
    colour: (i: number) => [number, number, number],
  ): void;
  /** 0..5 red lights lit on the gantry, -1 = all off (green) */
  setStartLights(count: number): void;
  /** per-frame: flags waving, distant LOD toggles, etc. */
  update(dt: number, cameraPos: THREE.Vector3): void;
  minimap: { outline: [number, number][]; project(x: number, z: number): [number, number] };
  bounds: THREE.Box3;
  dispose(): void;
}

export interface QualityConfig {
  quality: TrackSceneOptions['quality'];
  /** side length in px of generated square canvas textures */
  textureSize: number;
  treeCount: number;
  catchFence: boolean;
  tyreWalls: boolean;
}

const TREE_COUNTS: Record<TrackSceneOptions['quality'], number> = {
  low: 1500,
  medium: 2200,
  high: 3000,
  ultra: 6000,
};

export function qualityConfig(quality: TrackSceneOptions['quality']): QualityConfig {
  return {
    quality,
    textureSize: quality === 'low' ? 256 : 512,
    treeCount: TREE_COUNTS[quality],
    catchFence: quality !== 'low',
    tyreWalls: quality !== 'low',
  };
}

/** Resources a builder created that must be freed in dispose(). */
export interface Disposables {
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
  textures: THREE.Texture[];
}

export function newDisposables(): Disposables {
  return { geometries: [], materials: [], textures: [] };
}

export function mergeDisposables(target: Disposables, ...sources: Disposables[]): Disposables {
  for (const s of sources) {
    target.geometries.push(...s.geometries);
    target.materials.push(...s.materials);
    target.textures.push(...s.textures);
  }
  return target;
}
