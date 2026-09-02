import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
} from 'three';
import type { Disposables } from '../../types';
import type { DressingContext, PitComplexSpec } from '../types';
import { PALETTE } from './palette';
import { landmarkFrame, lateralOffset, newGroup, placeFacing } from './shared';

const HEIGHT_M = 8;
const WIDTH_M = 15;

interface Built {
  group: Group;
  disposables: Disposables;
}

/** A long pit building: garages, a roof terrace and a race-control tower. `roof: 'wing'` gives Silverstone's curved-roof look. */
export function buildPitComplex(ctx: DressingContext, spec: PitComplexSpec): Built {
  const group = newGroup('dressing-pit-complex');
  const pf = landmarkFrame(ctx.track, spec.s, spec.side, spec.distance);
  const sign = spec.side === 'left' ? -1 : 1;
  const disposables: Disposables = { geometries: [], materials: [], textures: [] };
  const color = spec.color ?? PALETTE.concrete;

  const body = buildBody(spec, color, pf, sign, group, disposables);
  buildGarages(spec, pf, sign, group, disposables);
  if (spec.roof === 'wing') buildWingRoof(spec, pf, sign, group, disposables);
  else buildFlatRoofTerrace(spec, pf, sign, body.height, group, disposables);
  buildTower(spec, pf, sign, group, disposables);

  return { group, disposables };
}

function buildBody(
  spec: PitComplexSpec,
  color: number,
  pf: ReturnType<typeof landmarkFrame>,
  sign: number,
  group: Group,
  disposables: Disposables,
): { height: number } {
  const geo = new BoxGeometry(WIDTH_M, HEIGHT_M, spec.length);
  const mat = new MeshStandardMaterial({ color, roughness: 0.8 });
  const body = new Mesh(geo, mat);
  body.castShadow = true;
  body.receiveShadow = true;
  placeFacing(body, pf.position, pf.forward, HEIGHT_M / 2, spec.rotationDeg);
  group.add(body);

  const glassGeo = new BoxGeometry(0.4, HEIGHT_M * 0.55, spec.length * 0.92);
  const glassMat = new MeshStandardMaterial({
    color: PALETTE.glassBlue,
    roughness: 0.15,
    metalness: 0.4,
    emissive: PALETTE.glassEmissive,
  });
  const glass = new Mesh(glassGeo, glassMat);
  glass.receiveShadow = true;
  const glassPos = lateralOffset(pf, sign, -WIDTH_M / 2 - 0.25);
  placeFacing(glass, glassPos, pf.forward, HEIGHT_M * 0.5, spec.rotationDeg);
  group.add(glass);

  disposables.geometries.push(geo, glassGeo);
  disposables.materials.push(mat, glassMat);
  return { height: HEIGHT_M };
}

function buildGarages(
  spec: PitComplexSpec,
  pf: ReturnType<typeof landmarkFrame>,
  sign: number,
  group: Group,
  disposables: Disposables,
): void {
  const doorGeo = new BoxGeometry(0.15, HEIGHT_M * 0.6, spec.length / spec.garages - 0.6);
  const doorMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2 });
  const doors = new InstancedMesh(doorGeo, doorMat, spec.garages);
  const dummy = new Object3D();
  const doorPos = lateralOffset(pf, sign, WIDTH_M / 2 + 0.1);
  for (let i = 0; i < spec.garages; i++) {
    const along = -spec.length / 2 + (i + 0.5) * (spec.length / spec.garages);
    dummy.position.copy(doorPos).addScaledVector(pf.forward, along);
    dummy.position.y += HEIGHT_M * 0.3;
    dummy.lookAt(dummy.position.clone().add(pf.forward));
    dummy.updateMatrix();
    doors.setMatrixAt(i, dummy.matrix);
    doors.setColorAt(i, new Color(i % 2 === 0 ? 0xe8e8ea : 0xd0d0d4));
  }
  doors.instanceMatrix.needsUpdate = true;
  if (doors.instanceColor) doors.instanceColor.needsUpdate = true;
  group.add(doors);
  disposables.geometries.push(doorGeo);
  disposables.materials.push(doorMat);
}

function buildFlatRoofTerrace(
  spec: PitComplexSpec,
  pf: ReturnType<typeof landmarkFrame>,
  sign: number,
  bodyHeight: number,
  group: Group,
  disposables: Disposables,
): void {
  const geo = new BoxGeometry(WIDTH_M + 1.5, 0.4, spec.length + 1);
  const mat = new MeshStandardMaterial({ color: PALETTE.roofDark, roughness: 0.6 });
  const roof = new Mesh(geo, mat);
  roof.castShadow = true;
  placeFacing(roof, pf.position, pf.forward, bodyHeight, spec.rotationDeg);
  group.add(roof);

  const railGeo = new BoxGeometry(WIDTH_M + 1.5, 1, 0.1);
  const rail = new Mesh(railGeo, mat);
  const railPos = lateralOffset(pf, sign, -WIDTH_M / 2);
  placeFacing(rail, railPos, pf.forward, bodyHeight + 0.7, spec.rotationDeg);
  group.add(rail);

  disposables.geometries.push(geo, railGeo);
  disposables.materials.push(mat);
}

/** The Silverstone "Wing": a long, shallow-curved roof made from a fan of tilted panels. */
function buildWingRoof(
  spec: PitComplexSpec,
  pf: ReturnType<typeof landmarkFrame>,
  sign: number,
  group: Group,
  disposables: Disposables,
): void {
  const segments = 9;
  const panelGeo = new BoxGeometry(4.5, 0.25, spec.length / segments + 0.4);
  const mat = new MeshStandardMaterial({ color: 0xe4e6ea, roughness: 0.35, metalness: 0.2 });
  for (let i = 0; i < segments; i++) {
    const t = (i + 0.5) / segments - 0.5;
    const panel = new Mesh(panelGeo, mat);
    panel.castShadow = true;
    const arc = Math.cos(t * Math.PI * 0.9);
    const pos = lateralOffset(pf, sign, WIDTH_M * 0.5 + arc * 3.5);
    placeFacing(panel, pos, pf.forward, HEIGHT_M + 1.2 + arc * 2.2, spec.rotationDeg);
    panel.rotateZ(sign * t * 0.5);
    group.add(panel);
  }
  disposables.geometries.push(panelGeo);
  disposables.materials.push(mat);
}

/** A slender race-control tower: a narrow shaft, a glazed cabin band, and a roof cap — not a plain wide pillar. */
function buildTower(
  spec: PitComplexSpec,
  pf: ReturnType<typeof landmarkFrame>,
  sign: number,
  group: Group,
  disposables: Disposables,
): void {
  const pos = lateralOffset(pf, sign, -WIDTH_M * 0.1);
  const along = spec.length * 0.42;
  pos.addScaledVector(pf.forward, along);

  const shaftHeight = spec.towerHeight * 0.78;
  const shaftGeo = new CylinderGeometry(1.0, 1.3, shaftHeight, 12);
  const shaftMat = new MeshStandardMaterial({ color: 0xc7cad0, roughness: 0.6, metalness: 0.1 });
  const shaft = new Mesh(shaftGeo, shaftMat);
  shaft.castShadow = true;
  shaft.receiveShadow = true;
  placeFacing(shaft, pos, pf.forward, shaftHeight / 2, spec.rotationDeg);
  group.add(shaft);

  const cabinHeight = spec.towerHeight - shaftHeight;
  const cabinGeo = new BoxGeometry(4.2, cabinHeight, 4.2);
  const cabinMat = new MeshStandardMaterial({
    color: PALETTE.glassBlue,
    roughness: 0.2,
    metalness: 0.3,
    emissive: PALETTE.glassEmissive,
  });
  const cabin = new Mesh(cabinGeo, cabinMat);
  cabin.castShadow = true;
  placeFacing(cabin, pos, pf.forward, shaftHeight + cabinHeight / 2, spec.rotationDeg);
  group.add(cabin);

  const capGeo = new CylinderGeometry(2.6, 2.6, 0.25, 12);
  const capMat = new MeshStandardMaterial({ color: 0x3a3a3f, roughness: 0.6 });
  const cap = new Mesh(capGeo, capMat);
  cap.castShadow = true;
  placeFacing(cap, pos, pf.forward, spec.towerHeight + 0.15, spec.rotationDeg);
  group.add(cap);

  disposables.geometries.push(shaftGeo, cabinGeo, capGeo);
  disposables.materials.push(shaftMat, cabinMat, capMat);
}
