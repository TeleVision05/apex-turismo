import { DoubleSide, Mesh, MeshStandardMaterial } from 'three';
import type { Track } from '../../../track/Track';
import type { TextureSet } from '../textures';
import { buildRibbon, computeArcLengths, edgePoint, type RibbonVertex } from '../geometryUtils';
import type { Disposables } from '../types';

const CROWN_DROP = 0.02;

export interface RoadSurface {
  mesh: Mesh;
  disposables: Disposables;
}

/** The asphalt ribbon: points[i] +/- rights[i] * widths[i]/2, edges dropped 2cm for a subtle crown. */
export function buildRoadSurface(track: Track, textures: TextureSet): RoadSurface {
  const arcLen = computeArcLengths(track);
  const lefts: RibbonVertex[] = [];
  const rights: RibbonVertex[] = [];
  for (let i = 0; i < track.n; i++) {
    const v = arcLen[i] / 8;
    const half = track.widths[i] * 0.5;
    lefts.push({ pos: edgePoint(track, i, -half, -CROWN_DROP), v });
    rights.push({ pos: edgePoint(track, i, half, -CROWN_DROP), v });
  }
  const geometry = buildRibbon(lefts, rights, true, false);
  const material = new MeshStandardMaterial({
    map: textures.asphaltMap,
    normalMap: textures.asphaltNormal,
    roughness: 0.85,
    metalness: 0.0,
    side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'road-surface';
  mesh.receiveShadow = true;
  return { mesh, disposables: { geometries: [geometry], materials: [material], textures: [] } };
}
