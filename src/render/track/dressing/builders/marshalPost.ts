import {
  BoxGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
} from 'three';
import type { Disposables } from '../../types';
import type { DressingContext, MarshalPostSpec } from '../types';
import { landmarkFrame, newGroup, orientAt } from './shared';

/** A small marshal post: an orange-roofed hut with a flag pole, set well back from the barrier. */
export function buildMarshalPost(
  ctx: DressingContext,
  spec: MarshalPostSpec,
): { group: Group; disposables: Disposables } {
  const group = newGroup('dressing-marshal-post');
  const pf = landmarkFrame(ctx.track, spec.s, spec.side, spec.distance);

  const wallGeo = new BoxGeometry(2.6, 2.2, 2);
  const wallMat = new MeshStandardMaterial({ color: 0xe4ddb0, roughness: 0.85 });
  const wall = new Mesh(wallGeo, wallMat);
  wall.castShadow = true;
  wall.receiveShadow = true;
  orientAt(wall, pf, 1.1, spec.rotationDeg);
  group.add(wall);

  const roofGeo = new BoxGeometry(3, 0.2, 2.4);
  const roofMat = new MeshStandardMaterial({ color: 0xd8641f, roughness: 0.7 });
  const roof = new Mesh(roofGeo, roofMat);
  roof.castShadow = true;
  orientAt(roof, pf, 2.3, spec.rotationDeg);
  group.add(roof);

  const poleGeo = new CylinderGeometry(0.04, 0.04, 3.2, 5);
  const poleMat = new MeshStandardMaterial({ color: 0xcfcfcf, roughness: 0.6 });
  const pole = new Mesh(poleGeo, poleMat);
  orientAt(pole, pf, 1.6, spec.rotationDeg);
  pole.position.addScaledVector(pf.right, 1.6);
  group.add(pole);

  const flagGeo = new PlaneGeometry(0.7, 0.5);
  const flagMat = new MeshStandardMaterial({ color: 0xd9b32c, side: DoubleSide, roughness: 0.8 });
  const flag = new Mesh(flagGeo, flagMat);
  orientAt(flag, pf, 3, spec.rotationDeg);
  flag.position.addScaledVector(pf.right, 1.6);
  group.add(flag);

  return {
    group,
    disposables: {
      geometries: [wallGeo, roofGeo, poleGeo, flagGeo],
      materials: [wallMat, roofMat, poleMat, flagMat],
      textures: [],
    },
  };
}
