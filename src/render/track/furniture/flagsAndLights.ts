import {
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
} from 'three';
import type { Track } from '../../../track/Track';
import type { TimeOfDay } from '../../../core/types';
import type { Disposables } from '../types';
import { frameAtS, newFurnitureGroup, pitSide, placeAt } from './common';

const FLAG_COLORS = [0x1f5fa8, 0xc23b3b, 0xffffff, 0xd9b32c];
const FLAG_S_OFFSETS = [-40, -20, 0, 20];
const POLE_HEIGHT = 5;
const LIGHT_SPACING_M = 60;

export interface FlagPoles {
  group: Group;
  flags: Mesh[];
  disposables: Disposables;
}

/** A handful of flag poles with animated flags near the grandstand. */
export function buildFlagPoles(track: Track): FlagPoles {
  const group = newFurnitureGroup('flag-poles');
  const side = -pitSide(track); // same side as the grandstand
  const poleGeo = new CylinderGeometry(0.05, 0.05, POLE_HEIGHT, 6);
  const poleMat = new MeshStandardMaterial({ color: 0xcfcfcf, roughness: 0.6, metalness: 0.3 });
  const flagTemplate = new PlaneGeometry(1.4, 0.9, 8, 1);
  const flags: Mesh[] = [];
  const flagMats: MeshStandardMaterial[] = [];
  const flagGeos = [flagTemplate];

  FLAG_S_OFFSETS.forEach((s, i) => {
    const frame = frameAtS(track, -70 + s);
    const lateral = side * (track.barrierDistance(frame.index) + 3);
    const pole = new Mesh(poleGeo, poleMat);
    placeAt(pole, frame, lateral, POLE_HEIGHT / 2);
    group.add(pole);

    const mat = new MeshStandardMaterial({
      color: FLAG_COLORS[i % FLAG_COLORS.length],
      side: DoubleSide,
      roughness: 0.8,
    });
    flagMats.push(mat);
    const geo = i === 0 ? flagTemplate : flagTemplate.clone();
    if (i > 0) flagGeos.push(geo);
    const flag = new Mesh(geo, mat);
    placeAt(flag, frame, lateral, POLE_HEIGHT - 0.6);
    group.add(flag);
    flags.push(flag);
  });

  return {
    group,
    flags,
    disposables: {
      geometries: [poleGeo, ...flagGeos],
      materials: [poleMat, ...flagMats],
      textures: [],
    },
  };
}

/** Emissive lamp-head light poles every 60m, built only for a night race. */
export function buildLightPoles(
  track: Track,
  timeOfDay: TimeOfDay,
): { group: Group; disposables: Disposables } {
  const group = newFurnitureGroup('light-poles');
  const disposables: Disposables = { geometries: [], materials: [], textures: [] };
  if (timeOfDay !== 'night') return { group, disposables };

  const poleGeo = new CylinderGeometry(0.08, 0.1, 7, 6);
  const poleMat = new MeshStandardMaterial({ color: 0x555555, roughness: 0.7 });
  const lampGeo = new CylinderGeometry(0.25, 0.25, 0.25, 8);
  const lampMat = new MeshStandardMaterial({
    color: 0xfff2c0,
    emissive: 0xfff2c0,
    emissiveIntensity: 1.6,
  });
  disposables.geometries.push(poleGeo, lampGeo);
  disposables.materials.push(poleMat, lampMat);

  const steps = Math.floor(track.length / LIGHT_SPACING_M);
  for (let k = 0; k < steps; k++) {
    const s = k * LIGHT_SPACING_M;
    const frame = frameAtS(track, s);
    const sign = k % 2 === 0 ? 1 : -1;
    const lateral = sign * (track.barrierDistance(frame.index) + 2.5);
    const pole = new Mesh(poleGeo, poleMat);
    placeAt(pole, frame, lateral, 3.5);
    const lamp = new Mesh(lampGeo, lampMat);
    placeAt(lamp, frame, lateral, 7);
    group.add(pole, lamp);
  }
  return { group, disposables };
}
