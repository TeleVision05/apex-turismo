import { CylinderGeometry, InstancedMesh, MeshStandardMaterial, Object3D, Color } from 'three';
import type { Track } from '../../../track/Track';
import { findRuns, outsideCornerSides } from '../geometryUtils';
import type { Disposables } from '../types';

const THRESHOLD = 0.01;
const SPACING_M = 1.4;
const RADIUS = 0.35;
const HEIGHT = 1.2;
const SET_BACK_M = 0.7; // in front of the Armco, toward the track

/** A wall of stacked tyres (some painted white/red) in front of the barrier, outside fast corners. */
export function buildTyreWalls(track: Track): {
  mesh: InstancedMesh | null;
  disposables: Disposables;
} {
  const { left, right } = outsideCornerSides(track, THRESHOLD);
  const spots: { idx: number; sign: 1 | -1 }[] = [];
  collectSpots(track, left, -1, spots);
  collectSpots(track, right, 1, spots);
  if (spots.length === 0)
    return { mesh: null, disposables: { geometries: [], materials: [], textures: [] } };

  const geometry = new CylinderGeometry(RADIUS, RADIUS, HEIGHT, 12);
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const mesh = new InstancedMesh(geometry, material, spots.length);
  mesh.name = 'tyre-walls';
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const dummy = new Object3D();
  const black = new Color(0x1a1a1a);
  const white = new Color(0xe8e8e8);
  const red = new Color(0xa01818);
  spots.forEach((spot, i) => {
    const p = track.points[spot.idx];
    const r = track.rights[spot.idx];
    const lateral = spot.sign * (track.barrierDistance(spot.idx) - SET_BACK_M);
    dummy.position.set(p.x + r.x * lateral, p.y + HEIGHT / 2, p.z + r.z * lateral);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    const paint = i % 5;
    mesh.setColorAt(i, paint === 0 ? white : paint === 1 ? red : black);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return { mesh, disposables: { geometries: [geometry], materials: [material], textures: [] } };
}

function collectSpots(
  track: Track,
  active: boolean[],
  sign: 1 | -1,
  out: { idx: number; sign: 1 | -1 }[],
): void {
  for (const run of findRuns(active)) {
    let acc = 0;
    for (let k = 0; k < run.length; k++) {
      const idx = run[k];
      acc += track.spacing;
      if (acc >= SPACING_M) {
        out.push({ idx, sign });
        acc = 0;
      }
    }
  }
}
