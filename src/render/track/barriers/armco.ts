import { DoubleSide, Mesh, MeshStandardMaterial } from 'three';
import type { Track } from '../../../track/Track';
import { buildRibbon, computeArcLengths, edgePoint, type RibbonVertex } from '../geometryUtils';
import type { TextureSet } from '../textures';
import type { Disposables } from '../types';

const HEIGHT = 0.75;
const TILE_M = 2;

/** One continuous 0.75m Armco band, following barrierDistance(i), for a single side. */
function buildArmcoSide(
  track: Track,
  textures: TextureSet,
  sign: 1 | -1,
): { mesh: Mesh; disposables: Disposables } {
  const arcLen = computeArcLengths(track);
  const bottoms: RibbonVertex[] = [];
  const tops: RibbonVertex[] = [];
  for (let i = 0; i < track.n; i++) {
    const lateral = sign * track.barrierDistance(i);
    const v = arcLen[i] / TILE_M;
    bottoms.push({ pos: edgePoint(track, i, lateral, 0.15), v });
    tops.push({ pos: edgePoint(track, i, lateral, 0.15 + HEIGHT), v });
  }
  const geometry = buildRibbon(bottoms, tops, true, false);
  const normalMap = textures.armcoNormal;
  normalMap.repeat.set(1, track.length / TILE_M);
  normalMap.needsUpdate = true;
  const material = new MeshStandardMaterial({
    color: 0x9a9aa0,
    normalMap,
    roughness: 0.55,
    metalness: 0.35,
    side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = sign === 1 ? 'armco-right' : 'armco-left';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return { mesh, disposables: { geometries: [geometry], materials: [material], textures: [] } };
}

export function buildArmco(
  track: Track,
  textures: TextureSet,
): { meshes: Mesh[]; disposables: Disposables } {
  const left = buildArmcoSide(track, textures, -1);
  const right = buildArmcoSide(track, textures, 1);
  return {
    meshes: [left.mesh, right.mesh],
    disposables: {
      geometries: [...left.disposables.geometries, ...right.disposables.geometries],
      materials: [...left.disposables.materials, ...right.disposables.materials],
      textures: [],
    },
  };
}
