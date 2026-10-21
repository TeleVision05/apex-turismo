import { BoxGeometry, Color, InstancedMesh, Mesh, MeshStandardMaterial, Object3D } from 'three';
import { makeRng } from '../../../../core/math';
import { frameAtS } from '../../furniture/common';
import { terrainHeightAt } from '../../terrain';
import type { Disposables } from '../../types';
import type { DressingContext, GrandstandSpec } from '../types';
import { SEAT_COLORS, pick } from './palette';
import { landmarkFrame, newGroup, placeFacing } from './shared';

const ROW_DEPTH = 1.1;
const ROW_HEIGHT = 0.55;
const SEAT_SPACING = 0.9;
const SEGMENT_M = 12;

interface Built {
  group: import('three').Group;
  disposables: Disposables;
}

/** Tiered, roofed grandstand with coloured seat rows; follows the track arc in short segments. */
export function buildGrandstand(ctx: DressingContext, spec: GrandstandSpec): Built {
  const group = newGroup('dressing-grandstand');
  const rows = spec.rows;
  const colors = spec.seatColors ?? SEAT_COLORS;
  const sign = spec.side === 'left' ? -1 : 1;
  const disposables: Disposables = { geometries: [], materials: [], textures: [] };

  const seatGeo = new BoxGeometry(0.7, 0.4, 0.7);
  const seatMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const seatsPerRow = Math.max(1, Math.floor(spec.length / SEAT_SPACING));
  const seats = new InstancedMesh(seatGeo, seatMat, rows * seatsPerRow);
  seats.castShadow = true;
  seats.receiveShadow = true;
  fillSeats(ctx, spec, rows, seatsPerRow, colors, seats);
  group.add(seats);
  disposables.geometries.push(seatGeo);
  disposables.materials.push(seatMat);

  const structureGeo = new BoxGeometry(rows * ROW_DEPTH + 1, rows * ROW_HEIGHT, SEGMENT_M);
  const structureMat = new MeshStandardMaterial({ color: 0x8c8c90, roughness: 0.95 });
  const roofParts = buildRoof(spec, rows);
  disposables.geometries.push(structureGeo, roofParts.geometry);
  disposables.materials.push(structureMat, roofParts.material);

  const segments = Math.max(1, Math.round(spec.length / SEGMENT_M));
  for (let s = 0; s < segments; s++) {
    const along = -spec.length / 2 + (s + 0.5) * (spec.length / segments);
    const pf = landmarkFrame(ctx.track, spec.s + along, spec.side, spec.distance);

    const structure = new Mesh(structureGeo, structureMat);
    structure.receiveShadow = true;
    structure.castShadow = true;
    const structurePos = pf.position
      .clone()
      .addScaledVector(pf.right, sign * rows * ROW_DEPTH * 0.35);
    placeFacing(
      structure,
      structurePos,
      pf.forward,
      (rows * ROW_HEIGHT) / 2 - 0.5,
      spec.rotationDeg,
    );
    group.add(structure);

    const roof = new Mesh(roofParts.geometry, roofParts.material);
    roof.castShadow = true;
    if (spec.roof === 'pitched') roof.rotateZ(-0.05);
    const roofPos = pf.position.clone().addScaledVector(pf.right, sign * rows * ROW_DEPTH * 0.4);
    placeFacing(roof, roofPos, pf.forward, rows * ROW_HEIGHT + 1.6, spec.rotationDeg);
    group.add(roof);
  }

  return { group, disposables };
}

function buildRoof(
  spec: GrandstandSpec,
  rows: number,
): { geometry: BoxGeometry; material: MeshStandardMaterial } {
  const depth = rows * ROW_DEPTH + 3;
  const geometry = new BoxGeometry(depth, spec.roof === 'tiered' ? 0.3 : 0.35, SEGMENT_M + 0.4);
  const material = new MeshStandardMaterial({ color: 0x3a3a3f, roughness: 0.6, metalness: 0.1 });
  return { geometry, material };
}

function fillSeats(
  ctx: DressingContext,
  spec: GrandstandSpec,
  rows: number,
  seatsPerRow: number,
  colors: number[],
  seats: InstancedMesh,
): void {
  const dummy = new Object3D();
  const rng = makeRng(0x5eed1 ^ Math.floor(spec.s));
  const sign = spec.side === 'left' ? -1 : 1;
  let i = 0;
  for (let row = 0; row < rows; row++) {
    const height = 0.6 + row * ROW_HEIGHT;
    for (let s = 0; s < seatsPerRow; s++) {
      const along = -spec.length / 2 + s * SEAT_SPACING;
      const frame = frameAtS(ctx.track, spec.s + along);
      const clearance = Math.max(4, spec.distance);
      const lateral = sign * (ctx.track.barrierDistance(frame.index) + clearance + row * ROW_DEPTH);
      const x = frame.point.x + frame.right.x * lateral;
      const z = frame.point.z + frame.right.z * lateral;
      dummy.position.set(x, terrainHeightAt(ctx.track, x, z, frame.index).y + height, z);
      dummy.updateMatrix();
      seats.setMatrixAt(i, dummy.matrix);
      seats.setColorAt(i, new Color(pick(colors, Math.floor(rng() * colors.length))));
      i++;
    }
  }
  seats.instanceMatrix.needsUpdate = true;
  if (seats.instanceColor) seats.instanceColor.needsUpdate = true;
}
