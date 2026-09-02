import {
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
  Vector3,
} from 'three';
import { makeRng } from '../../../../core/math';
import { frameAtS } from '../../furniture/common';
import { terrainHeightAt } from '../../terrain';
import type { Disposables } from '../../types';
import type { DressingContext, ForestBeltRegion } from '../types';
import { newGroup } from './shared';

const MIN_CLEARANCE_M = 4;

/** A dense belt of instanced conifer/broadleaf trees hugging the barrier over an s-range, e.g. Monza's tree tunnel. */
export function buildForestBelt(
  ctx: DressingContext,
  region: ForestBeltRegion,
): { group: Group; disposables: Disposables } {
  const group = newGroup('dressing-forest-belt');
  const { track } = ctx;
  const rng = makeRng(0x3f0e ^ Math.floor(region.sStart));
  const sides: ('left' | 'right')[] = region.side === 'both' ? ['left', 'right'] : [region.side];
  const spanS = track.deltaS(region.sStart, region.sEnd);
  const runLength = spanS >= 0 ? spanS : spanS + track.length;
  const step = 6 / Math.max(0.2, region.density);
  const perSide = Math.max(1, Math.floor(runLength / step));
  const total = perSide * sides.length * 2; // 2 rows deep

  const trunkGeo = new CylinderGeometry(0.2, 0.28, 2.6, 6);
  const canopyGeo = new ConeGeometry(1.5, region.tall ? 6 : 3.4, 7);
  const trunkMat = new MeshStandardMaterial({ color: 0x4d3b2a, roughness: 1 });
  const canopyMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  const trunks = new InstancedMesh(trunkGeo, trunkMat, total);
  const canopies = new InstancedMesh(canopyGeo, canopyMat, total);
  trunks.castShadow = true;
  canopies.castShadow = true;

  let i = 0;
  const dummy = new Object3D();
  for (const side of sides) {
    for (let row = 0; row < 2; row++) {
      for (let k = 0; k < perSide; k++) {
        const s = region.sStart + (k / perSide) * runLength + rng() * step * 0.4;
        const frame = frameAtS(track, s);
        const sign = side === 'left' ? -1 : 1;
        const lateral =
          sign *
          (track.barrierDistance(frame.index) +
            Math.max(MIN_CLEARANCE_M, region.distance) +
            row * 5);
        const x = frame.point.x + frame.right.x * lateral;
        const z = frame.point.z + frame.right.z * lateral;
        const y = terrainHeightAt(track, x, z, frame.index).y;
        // the circuit may pass nearby again (parallel straights): never plant inside any corridor
        const probe = track.query(new Vector3(x, y, z), null);
        if (Math.abs(probe.lateral) < track.barrierDistance(probe.index) + 4) continue;
        const scale = 0.8 + rng() * 0.6;
        placeTree(trunks, canopies, dummy, i, x, y, z, scale, rng());
        i++;
      }
    }
  }
  trunks.count = i;
  canopies.count = i;
  trunks.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;
  if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
  group.add(trunks, canopies);

  return {
    group,
    disposables: {
      geometries: [trunkGeo, canopyGeo],
      materials: [trunkMat, canopyMat],
      textures: [],
    },
  };
}

function placeTree(
  trunks: InstancedMesh,
  canopies: InstancedMesh,
  dummy: Object3D,
  i: number,
  x: number,
  y: number,
  z: number,
  scale: number,
  huePick: number,
): void {
  dummy.position.set(x, y + 1.3 * scale, z);
  dummy.rotation.set(0, huePick * Math.PI * 2, 0);
  dummy.scale.setScalar(scale);
  dummy.updateMatrix();
  trunks.setMatrixAt(i, dummy.matrix);
  dummy.position.y = y + (2.6 + 1.7) * scale;
  dummy.updateMatrix();
  canopies.setMatrixAt(i, dummy.matrix);
  canopies.setColorAt(i, new Color().setHSL(0.3 + huePick * 0.06, 0.4, 0.22 + huePick * 0.1));
}
