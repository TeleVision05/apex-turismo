import {
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
} from 'three';
import type { Track } from '../../../track/Track';
import { makeRng } from '../../../core/math';
import type { Disposables } from '../types';
import { frameAtS, newFurnitureGroup, pitSide, placeAt } from './common';

const CENTER_S = -70;
const LENGTH_M = 90;
const ROWS = 7;
const ROW_DEPTH = 1.1;
const ROW_HEIGHT = 0.55;
const SEAT_SPACING = 0.9;
const SEAT_COLORS = [0x1f5fa8, 0x1f8f4f, 0xc23b3b, 0xd9b32c];

/** Stepped seating tiers opposite the pit building, with a roof. */
export function buildGrandstand(track: Track): { group: Group; disposables: Disposables } {
  const group = newFurnitureGroup('grandstand');
  const side = -pitSide(track);
  const frame = frameAtS(track, CENTER_S);
  const baseLateral = side * (track.barrierDistance(frame.index) + 6);

  const seatGeo = new BoxGeometry(0.7, 0.4, 0.7);
  const seatMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const seatsPerRow = Math.floor(LENGTH_M / SEAT_SPACING);
  const seats = new InstancedMesh(seatGeo, seatMat, ROWS * seatsPerRow);
  seats.castShadow = true;
  seats.receiveShadow = true;
  fillSeats(frame, baseLateral, side, seatsPerRow, seats);
  group.add(seats);

  const structureGeo = new BoxGeometry(ROWS * ROW_DEPTH + 1, ROWS * ROW_HEIGHT, LENGTH_M);
  const structureMat = new MeshStandardMaterial({ color: 0x8c8c90, roughness: 0.95 });
  const structure = new Mesh(structureGeo, structureMat);
  structure.receiveShadow = true;
  placeAt(
    structure,
    frame,
    baseLateral + side * (ROWS * ROW_DEPTH) * 0.35,
    (ROWS * ROW_HEIGHT) / 2 - 0.5,
  );
  group.add(structure);

  const roofGeo = new BoxGeometry(ROWS * ROW_DEPTH + 3, 0.3, LENGTH_M + 2);
  const roofMat = new MeshStandardMaterial({ color: 0x3a3a3f, roughness: 0.6 });
  const roof = new Mesh(roofGeo, roofMat);
  roof.castShadow = true;
  placeAt(roof, frame, baseLateral + side * (ROWS * ROW_DEPTH) * 0.4, ROWS * ROW_HEIGHT + 1.6);
  group.add(roof);

  return {
    group,
    disposables: {
      geometries: [seatGeo, structureGeo, roofGeo],
      materials: [seatMat, structureMat, roofMat],
      textures: [],
    },
  };
}

function fillSeats(
  frame: ReturnType<typeof frameAtS>,
  baseLateral: number,
  side: number,
  seatsPerRow: number,
  seats: InstancedMesh,
): void {
  const dummy = new Object3D();
  const rng = makeRng(0x5eed1);
  let i = 0;
  for (let row = 0; row < ROWS; row++) {
    const lateral = baseLateral + side * row * ROW_DEPTH;
    const height = 0.6 + row * ROW_HEIGHT;
    for (let s = 0; s < seatsPerRow; s++) {
      const along = -LENGTH_M / 2 + s * SEAT_SPACING;
      const pos = frame.point
        .clone()
        .addScaledVector(frame.forward, along)
        .addScaledVector(frame.right, lateral);
      pos.y += height;
      dummy.position.copy(pos);
      dummy.updateMatrix();
      seats.setMatrixAt(i, dummy.matrix);
      const c = new Color(SEAT_COLORS[Math.floor(rng() * SEAT_COLORS.length)]);
      seats.setColorAt(i, c);
      i++;
    }
  }
  seats.instanceMatrix.needsUpdate = true;
  if (seats.instanceColor) seats.instanceColor.needsUpdate = true;
}
