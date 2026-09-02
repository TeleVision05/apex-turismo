import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
} from 'three';
import type { Disposables } from '../../types';
import type { CameraTowerSpec, DressingContext } from '../types';
import { landmarkFrame, newGroup, orientAt } from './shared';

/** A lattice TV camera tower with a platform and a camera dome on top. */
export function buildCameraTower(
  ctx: DressingContext,
  spec: CameraTowerSpec,
): { group: Group; disposables: Disposables } {
  const group = newGroup('dressing-camera-tower');
  const pf = landmarkFrame(ctx.track, spec.s, spec.side, spec.distance);

  const legGeo = new CylinderGeometry(0.18, 0.28, spec.height, 4);
  const legMat = new MeshStandardMaterial({ color: 0x33363b, roughness: 0.6, metalness: 0.4 });
  const tower = new Mesh(legGeo, legMat);
  tower.castShadow = true;
  orientAt(tower, pf, spec.height / 2, spec.rotationDeg);
  group.add(tower);

  const platGeo = new BoxGeometry(2.4, 0.2, 2.4);
  const platMat = new MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.7 });
  const platform = new Mesh(platGeo, platMat);
  platform.castShadow = true;
  orientAt(platform, pf, spec.height, spec.rotationDeg);
  group.add(platform);

  const domeGeo = new SphereGeometry(0.5, 10, 8);
  const domeMat = new MeshStandardMaterial({ color: 0x111214, roughness: 0.3, metalness: 0.5 });
  const dome = new Mesh(domeGeo, domeMat);
  dome.castShadow = true;
  orientAt(dome, pf, spec.height + 0.6, spec.rotationDeg);
  group.add(dome);

  return {
    group,
    disposables: {
      geometries: [legGeo, platGeo, domeGeo],
      materials: [legMat, platMat, domeMat],
      textures: [],
    },
  };
}
