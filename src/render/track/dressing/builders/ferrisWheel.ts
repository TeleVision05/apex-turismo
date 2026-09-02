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
  Vector3,
} from 'three';
import type { Disposables } from '../../types';
import type { DressingContext, FerrisWheelSpec } from '../types';
import { STRIPE_COLORS, pick } from './palette';
import { landmarkFrame, newGroup, orientAt } from './shared';

const GONDOLA_COUNT = 24;
const SPOKE_COUNT = 20;

interface Built {
  group: Group;
  disposables: Disposables;
}

/**
 * A big wheel behind the pits, in the style of Suzuka's landmark Ferris wheel:
 * a thin rim, many thin spokes, a small hub, gondola boxes, and a slender
 * A-frame support — every member stays well under 3m thick so it reads as a
 * wheel, not a solid drum.
 */
export function buildFerrisWheel(ctx: DressingContext, spec: FerrisWheelSpec): Built {
  const group = newGroup('dressing-ferris-wheel');
  const pf = landmarkFrame(ctx.track, spec.s, spec.side, spec.distance);
  const r = spec.radius;
  const hubHeight = r * 1.15;
  const disposables: Disposables = { geometries: [], materials: [], textures: [] };

  const supportMat = new MeshStandardMaterial({ color: 0x33363a, roughness: 0.6, metalness: 0.4 });
  const support = buildSupport(r, hubHeight, supportMat);
  orientAt(support.group, pf, 0, spec.rotationDeg);
  group.add(support.group);
  disposables.geometries.push(...support.geometries);
  disposables.materials.push(supportMat);

  const rim = buildWheelBody(r, hubHeight);
  orientAt(rim.group, pf, 0, spec.rotationDeg);
  group.add(rim.group);
  disposables.geometries.push(...rim.geometries);
  disposables.materials.push(...rim.materials);

  const { spokes, spokeGeo, spokeMat } = buildSpokes(pf, r, hubHeight, spec.rotationDeg);
  group.add(spokes);
  disposables.geometries.push(spokeGeo);
  disposables.materials.push(spokeMat);

  const { gondolas, gondolaGeo, gondolaMat } = buildGondolas(pf, r, hubHeight, spec.rotationDeg);
  group.add(gondolas);
  disposables.geometries.push(gondolaGeo);
  disposables.materials.push(gondolaMat);

  return { group, disposables };
}

/** The rim (torus) and a small central hub, in the wheel's own local XY plane. */
function buildWheelBody(
  r: number,
  hubHeight: number,
): {
  group: Group;
  geometries: (TorusGeometry | CylinderGeometry)[];
  materials: MeshStandardMaterial[];
} {
  const group = newGroup('wheel-body');

  const rimGeo = new TorusGeometry(r, Math.min(0.4, r * 0.015), 8, 40);
  const rimMat = new MeshStandardMaterial({ color: 0xd94f6a, roughness: 0.4, metalness: 0.3 });
  const rim = new Mesh(rimGeo, rimMat);
  rim.castShadow = true;
  rim.position.y = hubHeight;
  group.add(rim);

  const hubGeo = new CylinderGeometry(1.1, 1.1, 1.2, 12);
  const hubMat = new MeshStandardMaterial({ color: 0x4a4d52, roughness: 0.5, metalness: 0.5 });
  const hub = new Mesh(hubGeo, hubMat);
  hub.rotation.x = Math.PI / 2;
  hub.position.y = hubHeight;
  hub.castShadow = true;
  group.add(hub);

  return { group, geometries: [rimGeo, hubGeo], materials: [rimMat, hubMat] };
}

/** A slender A-frame support (angled struts + a cross-brace on each side) — no member over ~0.5m thick. */
function buildSupport(
  r: number,
  hubHeight: number,
  mat: MeshStandardMaterial,
): { group: Group; geometries: BoxGeometry[] } {
  const group = newGroup('wheel-support');
  const geometries: BoxGeometry[] = [];
  const thickness = 0.45;

  for (const side of [-1, 1]) {
    for (const depth of [-1.4, 1.4]) {
      const base = new Vector3(side * r * 0.62, 0, depth);
      const apex = new Vector3(side * r * 0.06, hubHeight * 0.94, depth * 0.25);
      const leg = strut(base, apex, thickness, mat);
      geometries.push(leg.geometry as BoxGeometry);
      group.add(leg.mesh);
    }
    const braceA = new Vector3(side * r * 0.62, 0, -1.4).lerp(
      new Vector3(side * r * 0.06, hubHeight * 0.94, -0.35),
      0.5,
    );
    const braceB = new Vector3(side * r * 0.62, 0, 1.4).lerp(
      new Vector3(side * r * 0.06, hubHeight * 0.94, 0.35),
      0.5,
    );
    const brace = strut(braceA, braceB, thickness * 0.8, mat);
    geometries.push(brace.geometry as BoxGeometry);
    group.add(brace.mesh);
  }

  return { group, geometries };
}

/** A thin box mesh spanning two local points (a support strut). */
function strut(
  a: Vector3,
  b: Vector3,
  thickness: number,
  mat: MeshStandardMaterial,
): { mesh: Mesh; geometry: BoxGeometry } {
  const delta = b.clone().sub(a);
  const length = delta.length();
  const geometry = new BoxGeometry(thickness, length, thickness);
  const mesh = new Mesh(geometry, mat);
  mesh.castShadow = true;
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), delta.normalize());
  return { mesh, geometry };
}

function buildSpokes(
  pf: ReturnType<typeof landmarkFrame>,
  r: number,
  hubHeight: number,
  rotationDeg?: number,
): { spokes: Group; spokeGeo: CylinderGeometry; spokeMat: MeshStandardMaterial } {
  const spokeGeo = new CylinderGeometry(0.05, 0.05, r * 0.94, 5);
  const spokeMat = new MeshStandardMaterial({ color: 0xb7bcc2, roughness: 0.5, metalness: 0.5 });
  const mesh = new InstancedMesh(spokeGeo, spokeMat, SPOKE_COUNT);
  const hub = newGroup('hub');
  orientAt(hub, pf, hubHeight, rotationDeg);
  const dummy = new Object3D();
  for (let i = 0; i < SPOKE_COUNT; i++) {
    const a = (i / SPOKE_COUNT) * Math.PI * 2;
    dummy.position.set((Math.cos(a) * r * 0.94) / 2, (Math.sin(a) * r * 0.94) / 2, 0);
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
  hubHeight: number,
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
  orientAt(hub, pf, hubHeight, rotationDeg);
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
