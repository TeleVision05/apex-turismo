import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { frameAtS } from '../../furniture/common';
import { terrainHeightAt } from '../../terrain';
import type { Disposables } from '../../types';
import type { DressingContext, GravelTrapRegion } from '../types';
import { PALETTE } from './palette';
import { newGroup } from './shared';

const MIN_CLEARANCE_M = 4;

/** A flat beige gravel-coloured patch beyond the barrier at a run-off area, e.g. Suzuka's 130R or Spa's Eau Rouge exit. */
export function buildGravelTrap(
  ctx: DressingContext,
  region: GravelTrapRegion,
): { group: Group; disposables: Disposables } {
  const group = newGroup('dressing-gravel-trap');
  const { track } = ctx;
  const sides: ('left' | 'right')[] = region.side === 'both' ? ['left', 'right'] : [region.side];
  const strips = sides.map((side) => stripGeometry(track, region, side));
  const geometry = strips.length > 1 ? mergeGeometries(strips) : strips[0];
  if (strips.length > 1) for (const s of strips) s.dispose();

  const material = new MeshStandardMaterial({ color: PALETTE.gravelBeige, roughness: 1 });
  const mesh = new Mesh(geometry, material);
  mesh.receiveShadow = true;
  group.add(mesh);

  return { group, disposables: { geometries: [geometry], materials: [material], textures: [] } };
}

function stripGeometry(
  track: DressingContext['track'],
  region: GravelTrapRegion,
  side: 'left' | 'right',
): BufferGeometry {
  const delta = track.deltaS(region.sStart, region.sEnd);
  const runLength = delta >= 0 ? delta : delta + track.length;
  const steps = Math.max(2, Math.floor(runLength / 8));
  const sign = side === 'right' ? 1 : -1;
  const near = Math.max(MIN_CLEARANCE_M, region.distance);
  const far = near + region.width;

  const positions: number[] = [];
  const uvs: number[] = [];
  for (let k = 0; k <= steps; k++) {
    const s = region.sStart + (k / steps) * runLength;
    const frame = frameAtS(track, s);
    for (const lat of [near, far]) {
      const lateral = sign * (track.barrierDistance(frame.index) + lat);
      const x = frame.point.x + frame.right.x * lateral;
      const z = frame.point.z + frame.right.z * lateral;
      const y = terrainHeightAt(track, x, z, frame.index).y + 0.02;
      positions.push(x, y, z);
      uvs.push(k / steps, lat === near ? 0 : 1);
    }
  }
  const indices: number[] = [];
  for (let k = 0; k < steps; k++) {
    const a = k * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, c, b, b, c, d);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}
