import { BoxGeometry, Color, Group, InstancedMesh, MeshStandardMaterial, Object3D } from 'three';
import { makeRng } from '../../../../core/math';
import type { Disposables } from '../../types';
import type { CitySkylineSpec, DressingContext } from '../types';
import { PALETTE } from './palette';
import { landmarkFrame, newGroup } from './shared';

/** A row of apartment/office towers on the horizon, e.g. Interlagos beyond the far side of the lake. */
export function buildCitySkyline(
  ctx: DressingContext,
  spec: CitySkylineSpec,
): { group: Group; disposables: Disposables } {
  const group = newGroup('dressing-city-skyline');
  const pf = landmarkFrame(ctx.track, spec.s, spec.side, spec.distance);
  const sign = spec.side === 'left' ? -1 : 1;
  const rng = makeRng(0x4c17 ^ Math.floor(spec.s));

  const geo = new BoxGeometry(1, 1, 1);
  const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.05 });
  const towers = new InstancedMesh(geo, mat, spec.towers);
  const dummy = new Object3D();
  for (let i = 0; i < spec.towers; i++) {
    const along = (rng() - 0.5) * spec.length;
    const across = sign * (rng() * spec.length * 0.25);
    const w = 12 + rng() * 14;
    const h = spec.maxHeight * (0.35 + rng() * 0.65);
    dummy.position
      .copy(pf.position)
      .addScaledVector(pf.forward, along)
      .addScaledVector(pf.right, across);
    dummy.position.y += h / 2;
    dummy.scale.set(w, h, w);
    dummy.rotation.y = rng() * Math.PI * 0.1;
    dummy.updateMatrix();
    towers.setMatrixAt(i, dummy.matrix);
    const tone = rng() < 0.5 ? PALETTE.cityConcrete : PALETTE.cityGlass;
    towers.setColorAt(i, new Color(tone).multiplyScalar(0.85 + rng() * 0.3));
  }
  towers.instanceMatrix.needsUpdate = true;
  if (towers.instanceColor) towers.instanceColor.needsUpdate = true;
  group.add(towers);

  return { group, disposables: { geometries: [geo], materials: [mat], textures: [] } };
}
