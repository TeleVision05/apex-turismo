import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  TorusGeometry,
} from 'three';
import type { Disposables } from '../../types';
import type { DressingContext, FerrisWheelSpec } from '../types';
import { STRIPE_COLORS, pick } from './palette';
import { landmarkFrame, newGroup, orientAt } from './shared';

const GONDOLA_COUNT = 24;
const SPOKE_COUNT = 12;

interface Built {
  group: Group;
  disposables: Disposables;
}

/** A big wheel behind the pits, in the style of Suzuka's landmark Ferris wheel. */
export function buildFerrisWheel(ctx: DressingContext, spec: FerrisWheelSpec): Built {
  const group = newGroup('dressing-ferris-wheel');
  const pf = landmarkFrame(ctx.track, spec.s, spec.side, spec.distance);
  const r = spec.radius;
  const disposables: Disposables = { geometries: [], materials: [], textures: [] };

  const legGeo = new BoxGeometry(0.8, r * 1.15, 0.8);
  const legMat = new MeshStandardMaterial({ color: 0x2f3236, roughness: 0.6, metalness: 0.4 });
  for (const dx of [-r * 0.55, r * 0.55]) {
    const leg = new Mesh(legGeo, legMat);
    leg.castShadow = true;
    orientAt(leg, pf, (r * 1.15) / 2, spec.rotationDeg);
    leg.position.addScaledVector(pf.right, dx);
    group.add(leg);
  }
  disposables.geometries.push(legGeo);
  disposables.materials.push(legMat);

  const rimGeo = new TorusGeometry(r, r * 0.03, 8, 32);
  const rimMat = new MeshStandardMaterial({ color: 0xd94f6a, roughness: 0.4, metalness: 0.3 });
  const rim = new Mesh(rimGeo, rimMat);
  rim.castShadow = true;
  orientAt(rim, pf, r * 1.15, spec.rotationDeg);
  group.add(rim);
  disposables.geometries.push(rimGeo);
  disposables.materials.push(rimMat);

  const { spokes, spokeGeo, spokeMat } = buildSpokes(pf, r, spec.rotationDeg);
  group.add(spokes);
  disposables.geometries.push(spokeGeo);
  disposables.materials.push(spokeMat);

  const { gondolas, gondolaGeo, gondolaMat } = buildGondolas(pf, r, spec.rotationDeg);
  group.add(gondolas);
  disposables.geometries.push(gondolaGeo);
  disposables.materials.push(gondolaMat);

  return { group, disposables };
}

function buildSpokes(
  pf: ReturnType<typeof landmarkFrame>,
  r: number,
  rotationDeg?: number,
): { spokes: Group; spokeGeo: CylinderGeometry; spokeMat: MeshStandardMaterial } {
  const spokeGeo = new CylinderGeometry(0.06, 0.06, r, 5);
  const spokeMat = new MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.5, metalness: 0.5 });
  const mesh = new InstancedMesh(spokeGeo, spokeMat, SPOKE_COUNT);
  const hub = newGroup('hub');
  orientAt(hub, pf, r * 1.15, rotationDeg);
  const dummy = new Object3D();
  for (let i = 0; i < SPOKE_COUNT; i++) {
    const a = (i / SPOKE_COUNT) * Math.PI * 2;
    dummy.position.set((Math.cos(a) * r) / 2, (Math.sin(a) * r) / 2, 0);
    dummy.rotation.set(0, 0, a - Math.PI / 2);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  hub.add(mesh);
  return { spokes: hub, spokeGeo, spokeMat };
}

function buildGondolas(
  pf: ReturnType<typeof landmarkFrame>,
  r: number,
  rotationDeg?: number,
): { gondolas: Group; gondolaGeo: BoxGeometry; gondolaMat: MeshStandardMaterial } {
  const gondolaGeo = new BoxGeometry(0.9, 1.1, 0.9);
  const gondolaMat = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.5,
    metalness: 0.1,
  });
  const mesh = new InstancedMesh(gondolaGeo, gondolaMat, GONDOLA_COUNT);
  const hub = newGroup('gondolas');
  orientAt(hub, pf, r * 1.15, rotationDeg);
  const dummy = new Object3D();
  for (let i = 0; i < GONDOLA_COUNT; i++) {
    const a = (i / GONDOLA_COUNT) * Math.PI * 2;
    dummy.position.set(Math.cos(a) * r, Math.sin(a) * r, 0.5);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, new Color(pick(STRIPE_COLORS, i)));
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  hub.add(mesh);
  return { gondolas: hub, gondolaGeo, gondolaMat };
}
