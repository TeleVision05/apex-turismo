import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import type { Disposables } from '../../types';
import type { BullStatueSpec, DressingContext } from '../types';
import { PALETTE } from './palette';
import { landmarkFrame, newGroup, orientAt } from './shared';

/** A simple low-poly bull silhouette on a plinth atop a small hill, as at the Red Bull Ring. */
export function buildBullStatue(
  ctx: DressingContext,
  spec: BullStatueSpec,
): { group: Group; disposables: Disposables } {
  const group = newGroup('dressing-bull-statue');
  const pf = landmarkFrame(ctx.track, spec.s, spec.side, spec.distance);
  const disposables: Disposables = { geometries: [], materials: [], textures: [] };

  const mound = new Mesh(
    new CylinderGeometry(10, 14, spec.hillHeight, 10),
    new MeshStandardMaterial({ color: PALETTE.hillGreenLush, roughness: 1, flatShading: true }),
  );
  orientAt(mound, pf, spec.hillHeight / 2, spec.rotationDeg);
  group.add(mound);
  disposables.geometries.push(mound.geometry as CylinderGeometry);
  disposables.materials.push(mound.material as MeshStandardMaterial);

  const plinthMat = new MeshStandardMaterial({ color: PALETTE.plinthGrey, roughness: 0.8 });
  const plinth = new Mesh(new BoxGeometry(4, 1.4, 4), plinthMat);
  orientAt(plinth, pf, spec.hillHeight + 0.7, spec.rotationDeg);
  group.add(plinth);
  disposables.geometries.push(plinth.geometry as BoxGeometry);

  const bullMat = new MeshStandardMaterial({ color: PALETTE.bullBlack, roughness: 0.85 });
  const bull = buildBullSilhouette(bullMat);
  orientAt(bull.group, pf, spec.hillHeight + 1.4, spec.rotationDeg);
  group.add(bull.group);
  disposables.materials.push(plinthMat, bullMat);
  disposables.geometries.push(...bull.geometries);

  return { group, disposables };
}

function buildBullSilhouette(mat: MeshStandardMaterial): {
  group: Group;
  geometries: BoxGeometry[];
} {
  const g = new Group();
  const bodyGeo = new BoxGeometry(3.6, 1.8, 1.4);
  const body = new Mesh(bodyGeo, mat);
  body.position.y = 1.4;
  const headGeo = new BoxGeometry(1.1, 1, 1.1);
  const head = new Mesh(headGeo, mat);
  head.position.set(2, 1.9, 0);
  const hornsGeo = new BoxGeometry(1.8, 0.18, 0.18);
  const horns = new Mesh(hornsGeo, mat);
  horns.position.set(2.5, 2.5, 0);
  const legGeo = new BoxGeometry(0.3, 1.4, 0.3);
  for (const [dx, dz] of [
    [-1.3, 0.5],
    [-1.3, -0.5],
    [1.2, 0.5],
    [1.2, -0.5],
  ]) {
    const leg = new Mesh(legGeo, mat);
    leg.position.set(dx, 0.7, dz);
    g.add(leg);
  }
  g.add(body, head, horns);
  g.traverse((o) => {
    if (o instanceof Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return { group: g, geometries: [bodyGeo, headGeo, hornsGeo, legGeo] };
}
