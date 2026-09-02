import { BoxGeometry, Color, InstancedMesh, Mesh, MeshStandardMaterial, Object3D } from 'three';
import { makeRng } from '../../../../core/math';
import type { Disposables } from '../../types';
import type { DressingContext, GrandstandSpec } from '../types';
import { SEAT_COLORS, pick } from './palette';
import { landmarkFrame, lateralOffset, newGroup, placeFacing } from './shared';

const ROW_DEPTH = 1.1;
const ROW_HEIGHT = 0.55;
const SEAT_SPACING = 0.9;

interface Built {
  group: import('three').Group;
  disposables: Disposables;
}

/** Tiered, roofed grandstand with coloured seat rows; length/height/roof style are spec-driven. */
export function buildGrandstand(ctx: DressingContext, spec: GrandstandSpec): Built {
  const group = newGroup('dressing-grandstand');
  const pf = landmarkFrame(ctx.track, spec.s, spec.side, spec.distance);
  const rows = spec.rows;
  const colors = spec.seatColors ?? SEAT_COLORS;

  const seatGeo = new BoxGeometry(0.7, 0.4, 0.7);
  const seatMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const seatsPerRow = Math.max(1, Math.floor(spec.length / SEAT_SPACING));
  const seats = new InstancedMesh(seatGeo, seatMat, rows * seatsPerRow);
  seats.castShadow = true;
  seats.receiveShadow = true;
  fillSeats(pf, spec, rows, seatsPerRow, colors, seats);
  group.add(seats);

  const sign = spec.side === 'left' ? -1 : 1;
  const structureGeo = new BoxGeometry(rows * ROW_DEPTH + 1, rows * ROW_HEIGHT, spec.length);
  const structureMat = new MeshStandardMaterial({ color: 0x8c8c90, roughness: 0.95 });
  const structure = new Mesh(structureGeo, structureMat);
  structure.receiveShadow = true;
  structure.castShadow = true;
  const structurePos = lateralOffset(pf, sign, rows * ROW_DEPTH * 0.35);
  placeFacing(structure, structurePos, pf.forward, (rows * ROW_HEIGHT) / 2 - 0.5, spec.rotationDeg);
  group.add(structure);

  const roof = buildRoof(spec, rows);
  const roofPos = lateralOffset(pf, sign, rows * ROW_DEPTH * 0.4);
  placeFacing(roof.mesh, roofPos, pf.forward, rows * ROW_HEIGHT + 1.6, spec.rotationDeg);
  group.add(roof.mesh);

  return {
    group,
    disposables: {
      geometries: [seatGeo, structureGeo, roof.geometry],
      materials: [seatMat, structureMat, roof.material],
      textures: [],
    },
  };
}

function buildRoof(
  spec: GrandstandSpec,
  rows: number,
): { mesh: Mesh; geometry: BoxGeometry; material: MeshStandardMaterial } {
  const depth = rows * ROW_DEPTH + 3;
  const width = spec.length + 2;
  const geometry = new BoxGeometry(depth, spec.roof === 'tiered' ? 0.3 : 0.35, width);
  const material = new MeshStandardMaterial({ color: 0x3a3a3f, roughness: 0.6, metalness: 0.1 });
  const mesh = new Mesh(geometry, material);
  mesh.castShadow = true;
  if (spec.roof === 'pitched') mesh.rotateZ(-0.05);
  return { mesh, geometry, material };
}

function fillSeats(
  pf: ReturnType<typeof landmarkFrame>,
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
    const stepBack = row * ROW_DEPTH;
    const height = 0.6 + row * ROW_HEIGHT;
    for (let s = 0; s < seatsPerRow; s++) {
      const along = -spec.length / 2 + s * SEAT_SPACING;
      dummy.position
        .copy(pf.position)
        .addScaledVector(pf.forward, along)
        .addScaledVector(pf.right, sign * stepBack);
      dummy.position.y += height;
      dummy.updateMatrix();
      seats.setMatrixAt(i, dummy.matrix);
      seats.setColorAt(i, new Color(pick(colors, Math.floor(rng() * colors.length))));
      i++;
    }
  }
  seats.instanceMatrix.needsUpdate = true;
  if (seats.instanceColor) seats.instanceColor.needsUpdate = true;
}
