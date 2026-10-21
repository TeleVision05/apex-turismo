import {
  BoxGeometry,
  Color,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  type Group,
} from 'three';
import type { Track } from '../../../track/Track';
import { makeRng } from '../../../core/math';
import type { Disposables } from '../types';
import { frameAtS, newFurnitureGroup, pitSide, placeAt } from './common';
import { groupIntrudesDriveVolume } from './clearance';

const CENTER_S = -70;
const ROWS = 7;
const ROW_DEPTH = 1.1;
const ROW_HEIGHT = 0.55;
const SEAT_SPACING = 0.9;
const SEAT_COLORS = [0x1f5fa8, 0x1f8f4f, 0xc23b3b, 0xd9b32c];
const CLEARANCE_M = 10;
const SEGMENT_M = 12;

/** Cap stand length so it cannot reach the opposite side of a short circuit. */
function standLength(track: Track): number {
  return Math.min(90, Math.max(24, track.length * 0.035));
}

/** Stepped seating tiers opposite the pit building, following the pit-straight arc. */
export function buildGrandstand(track: Track): { group: Group; disposables: Disposables } {
  const group = newFurnitureGroup('grandstand');
  const side = -pitSide(track);
  const lengthM = standLength(track);
  const disposables: Disposables = { geometries: [], materials: [], textures: [] };

  const seatGeo = new BoxGeometry(0.7, 0.4, 0.7);
  const seatMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const seatsPerRow = Math.max(1, Math.floor(lengthM / SEAT_SPACING));
  const seats = new InstancedMesh(seatGeo, seatMat, ROWS * seatsPerRow);
  seats.castShadow = true;
  seats.receiveShadow = true;
  fillSeats(track, side, lengthM, seatsPerRow, seats);
  group.add(seats);
  disposables.geometries.push(seatGeo);
  disposables.materials.push(seatMat);

  const structureGeo = new BoxGeometry(ROWS * ROW_DEPTH + 1, ROWS * ROW_HEIGHT, SEGMENT_M);
  const structureMat = new MeshStandardMaterial({ color: 0x8c8c90, roughness: 0.95 });
  const roofGeo = new BoxGeometry(ROWS * ROW_DEPTH + 3, 0.3, SEGMENT_M + 0.4);
  const roofMat = new MeshStandardMaterial({ color: 0x3a3a3f, roughness: 0.6 });
  disposables.geometries.push(structureGeo, roofGeo);
  disposables.materials.push(structureMat, roofMat);

  const segments = Math.max(1, Math.round(lengthM / SEGMENT_M));
  for (let s = 0; s < segments; s++) {
    const along = -lengthM / 2 + (s + 0.5) * (lengthM / segments);
    const frame = frameAtS(track, CENTER_S + along);
    const baseLateral = side * (track.barrierDistance(frame.index) + CLEARANCE_M);

    const structure = new Mesh(structureGeo, structureMat);
    structure.receiveShadow = true;
    placeAt(
      structure,
      frame,
      baseLateral + side * (ROWS * ROW_DEPTH) * 0.35,
      (ROWS * ROW_HEIGHT) / 2 - 0.5,
    );
    group.add(structure);

    const roof = new Mesh(roofGeo, roofMat);
    roof.castShadow = true;
    placeAt(roof, frame, baseLateral + side * (ROWS * ROW_DEPTH) * 0.4, ROWS * ROW_HEIGHT + 1.6);
    group.add(roof);
  }

  if (groupIntrudesDriveVolume(track, group)) {
    group.clear();
  }

  return { group, disposables };
}

function fillSeats(
  track: Track,
  side: number,
  lengthM: number,
  seatsPerRow: number,
  seats: InstancedMesh,
): void {
  const dummy = new Object3D();
  const rng = makeRng(0x5eed1);
  let i = 0;
  for (let row = 0; row < ROWS; row++) {
    const height = 0.6 + row * ROW_HEIGHT;
    for (let s = 0; s < seatsPerRow; s++) {
      const along = -lengthM / 2 + s * SEAT_SPACING;
      const frame = frameAtS(track, CENTER_S + along);
      const lateral = side * (track.barrierDistance(frame.index) + CLEARANCE_M + row * ROW_DEPTH);
      const pos = frame.point.clone().addScaledVector(frame.right, lateral);
      pos.y += height;
      dummy.position.copy(pos);
      dummy.updateMatrix();
      seats.setMatrixAt(i, dummy.matrix);
      seats.setColorAt(i, new Color(SEAT_COLORS[Math.floor(rng() * SEAT_COLORS.length)]));
      i++;
    }
  }
  seats.count = i;
  seats.instanceMatrix.needsUpdate = true;
  if (seats.instanceColor) seats.instanceColor.needsUpdate = true;
}
