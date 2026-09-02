import { BoxGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry } from 'three';
import type { Track } from '../../../track/Track';
import type { Disposables } from '../types';
import { frameAtS, newFurnitureGroup, placeAt } from './common';

const GANTRY_HEIGHT_M = 5.5;
const LAMP_COUNT = 5;
const RED_ON = 0xff2020;
const RED_OFF = 0x400a0a;
const GREEN_ON = 0x20ff40;
const GREEN_OFF = 0x0a3010;

export interface StartGantry {
  group: Group;
  redLamps: MeshStandardMaterial[];
  greenLamp: MeshStandardMaterial;
  disposables: Disposables;
}

/** An overhead gantry at the start line with 5 red lights and a green light. */
export function buildStartGantry(track: Track): StartGantry {
  const group = newFurnitureGroup('start-gantry');
  const half = track.widths[0] * 0.5 + 1;
  const frame = frameAtS(track, 0);

  const legGeo = new BoxGeometry(0.3, GANTRY_HEIGHT_M, 0.3);
  const legMat = new MeshStandardMaterial({ color: 0x30302f, roughness: 0.8, metalness: 0.3 });
  const legL = new Mesh(legGeo, legMat);
  const legR = new Mesh(legGeo, legMat);
  placeAt(legL, frame, -half, GANTRY_HEIGHT_M / 2);
  placeAt(legR, frame, half, GANTRY_HEIGHT_M / 2);

  const beamGeo = new BoxGeometry(half * 2 + 0.6, 0.4, 0.4);
  const beamMat = new MeshStandardMaterial({ color: 0x30302f, roughness: 0.8, metalness: 0.3 });
  const beam = new Mesh(beamGeo, beamMat);
  placeAt(beam, frame, 0, GANTRY_HEIGHT_M);

  const { lamps, redLamps, greenLamp } = buildLamps(frame, half);

  group.add(legL, legR, beam, ...lamps);
  return {
    group,
    redLamps,
    greenLamp,
    disposables: {
      geometries: [legGeo, beamGeo, ...lamps.map((l) => l.geometry)],
      materials: [legMat, beamMat, ...redLamps, greenLamp],
      textures: [],
    },
  };
}

function buildLamps(
  frame: ReturnType<typeof frameAtS>,
  half: number,
): { lamps: Mesh[]; redLamps: MeshStandardMaterial[]; greenLamp: MeshStandardMaterial } {
  const lampGeo = new SphereGeometry(0.22, 12, 12);
  const redLamps: MeshStandardMaterial[] = [];
  const lamps: Mesh[] = [];
  for (let i = 0; i < LAMP_COUNT; i++) {
    const mat = new MeshStandardMaterial({ color: RED_OFF, emissive: RED_OFF, roughness: 0.4 });
    redLamps.push(mat);
    const lamp = new Mesh(lampGeo, mat);
    const lateral = -half + ((i + 1) * (half * 2)) / (LAMP_COUNT + 1);
    placeAt(lamp, frame, lateral, GANTRY_HEIGHT_M - 0.6);
    lamps.push(lamp);
  }
  const greenMat = new MeshStandardMaterial({
    color: GREEN_OFF,
    emissive: GREEN_OFF,
    roughness: 0.4,
  });
  const greenLamp = new Mesh(lampGeo, greenMat);
  placeAt(greenLamp, frame, 0, GANTRY_HEIGHT_M - 1.15);
  lamps.push(greenLamp);
  return { lamps, redLamps, greenLamp: greenMat };
}

export { RED_ON, RED_OFF, GREEN_ON, GREEN_OFF };
