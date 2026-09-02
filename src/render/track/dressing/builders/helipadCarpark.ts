import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
} from 'three';
import { makeRng } from '../../../../core/math';
import { canvasTextTexture } from '../../textures';
import type { Disposables } from '../../types';
import type { CarParkSpec, DressingContext, HelipadSpec } from '../types';
import { landmarkFrame, newGroup, orientAt } from './shared';

/** A circular helipad marked with a large "H". */
export function buildHelipad(
  ctx: DressingContext,
  spec: HelipadSpec,
): { group: Group; disposables: Disposables } {
  const group = newGroup('dressing-helipad');
  const pf = landmarkFrame(ctx.track, spec.s, spec.side, spec.distance);
  const geo = new CylinderGeometry(9, 9, 0.15, 24);
  const texture = canvasTextTexture('H', {
    width: 256,
    height: 256,
    bg: '#2b2f33',
    fg: '#ffd23f',
    fontPx: 190,
  });
  const mat = new MeshStandardMaterial({ map: texture, roughness: 0.8 });
  const pad = new Mesh(geo, mat);
  pad.receiveShadow = true;
  orientAt(pad, pf, 0.08, spec.rotationDeg);
  group.add(pad);
  return { group, disposables: { geometries: [geo], materials: [mat], textures: [texture] } };
}

/** A parking-lot block: painted tarmac plus a scatter of instanced parked cars. */
export function buildCarPark(
  ctx: DressingContext,
  spec: CarParkSpec,
): { group: Group; disposables: Disposables } {
  const group = newGroup('dressing-car-park');
  const pf = landmarkFrame(ctx.track, spec.s, spec.side, spec.distance);
  const w = spec.cols * 3;
  const d = spec.rows * 5.5;

  const padGeo = new BoxGeometry(w, 0.1, d);
  const padMat = new MeshStandardMaterial({ color: 0x494c50, roughness: 0.95 });
  const pad = new Mesh(padGeo, padMat);
  pad.receiveShadow = true;
  orientAt(pad, pf, 0.05, spec.rotationDeg);
  group.add(pad);

  const cars = buildCars(pf, spec, w, d);
  group.add(cars.mesh);

  return {
    group,
    disposables: {
      geometries: [padGeo, cars.geo],
      materials: [padMat, cars.mat],
      textures: [],
    },
  };
}

function buildCars(
  pf: ReturnType<typeof landmarkFrame>,
  spec: CarParkSpec,
  w: number,
  d: number,
): { mesh: InstancedMesh; geo: BoxGeometry; mat: MeshStandardMaterial } {
  const rng = makeRng(0x7c31 ^ Math.floor(spec.s));
  const geo = new BoxGeometry(1.8, 1.3, 4.2);
  const mat = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.4,
    metalness: 0.3,
    side: DoubleSide,
  });
  const count = spec.rows * spec.cols;
  const mesh = new InstancedMesh(geo, mat, count);
  mesh.castShadow = true;
  const dummy = new Object3D();
  let i = 0;
  for (let r = 0; r < spec.rows; r++) {
    for (let c = 0; c < spec.cols; c++) {
      if (rng() < 0.25) continue;
      const along = -d / 2 + (r + 0.5) * (d / spec.rows);
      const across = -w / 2 + (c + 0.5) * (w / spec.cols);
      dummy.position
        .copy(pf.position)
        .addScaledVector(pf.forward, along)
        .addScaledVector(pf.right, across);
      dummy.position.y += 0.7;
      dummy.rotation.set(0, rng() * 0.2, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, new Color().setHSL(rng(), 0.2, 0.4 + rng() * 0.3));
      i++;
    }
  }
  mesh.count = i;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return { mesh, geo, mat };
}
