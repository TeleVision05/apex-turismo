import { BoxGeometry, ConeGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import type { Track } from '../../../track/Track';
import type { Disposables } from '../types';
import { frameAtS, newFurnitureGroup, placeAt } from './common';

const SPACING_M = 800;
const HUT_WIDTH = 3;
const HUT_DEPTH = 2.4;
const HUT_HEIGHT = 2.4;

/** Small marshal huts with a pitched roof, evenly spaced around the lap. */
export function buildMarshalHuts(track: Track): { group: Group; disposables: Disposables } {
  const group = newFurnitureGroup('marshal-huts');
  const wallGeo = new BoxGeometry(HUT_WIDTH, HUT_HEIGHT, HUT_DEPTH);
  const wallMat = new MeshStandardMaterial({ color: 0xe0d9a0, roughness: 0.85 });
  const roofGeo = new ConeGeometry(2.6, 1.2, 4);
  const roofMat = new MeshStandardMaterial({ color: 0x8a3f3f, roughness: 0.8 });

  const count = Math.max(1, Math.floor(track.length / SPACING_M));
  for (let k = 0; k < count; k++) {
    const s = k * SPACING_M + SPACING_M * 0.5;
    const frame = frameAtS(track, s);
    const sign = k % 2 === 0 ? 1 : -1;
    const lateral = sign * (track.barrierDistance(frame.index) + 4);
    const wall = new Mesh(wallGeo, wallMat);
    wall.castShadow = true;
    wall.receiveShadow = true;
    placeAt(wall, frame, lateral, HUT_HEIGHT / 2);
    const roof = new Mesh(roofGeo, roofMat);
    roof.castShadow = true;
    placeAt(roof, frame, lateral, HUT_HEIGHT + 0.6);
    roof.rotateY(Math.PI / 4);
    group.add(wall, roof);
  }
  return {
    group,
    disposables: { geometries: [wallGeo, roofGeo], materials: [wallMat, roofMat], textures: [] },
  };
}
