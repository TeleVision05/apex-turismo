import { BoxGeometry, Mesh, MeshStandardMaterial, type Group } from 'three';
import type { Track } from '../../../track/Track';
import type { Disposables } from '../types';
import { frameAtS, newFurnitureGroup, pitSide, placeAt } from './common';
import { groupIntrudesDriveVolume } from './clearance';

const HEIGHT_M = 8;
const WIDTH_M = 14;
const CENTER_S = -70;
const CLEARANCE_M = 12;
const SEGMENT_M = 15;

function pitLength(track: Track): number {
  return Math.min(120, Math.max(30, track.length * 0.045));
}

/** A long low pit building with a glazed front, following the pit-straight arc. */
export function buildPitBuilding(track: Track): { group: Group; disposables: Disposables } {
  const group = newFurnitureGroup('pit-building');
  const side = pitSide(track);
  const lengthM = pitLength(track);
  const disposables: Disposables = { geometries: [], materials: [], textures: [] };

  const bodyGeo = new BoxGeometry(WIDTH_M, HEIGHT_M, SEGMENT_M);
  const bodyMat = new MeshStandardMaterial({ color: 0xd8d8dc, roughness: 0.8 });
  const glassGeo = new BoxGeometry(0.4, HEIGHT_M * 0.55, SEGMENT_M * 0.9);
  const glassMat = new MeshStandardMaterial({
    color: 0x1c3a52,
    roughness: 0.15,
    metalness: 0.4,
    emissive: 0x0a1622,
  });
  disposables.geometries.push(bodyGeo, glassGeo);
  disposables.materials.push(bodyMat, glassMat);

  const segments = Math.max(1, Math.round(lengthM / SEGMENT_M));
  for (let s = 0; s < segments; s++) {
    const along = -lengthM / 2 + (s + 0.5) * (lengthM / segments);
    const frame = frameAtS(track, CENTER_S + along);
    const lateral = side * (track.barrierDistance(frame.index) + CLEARANCE_M);

    const body = new Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    placeAt(body, frame, lateral, HEIGHT_M / 2);
    group.add(body);

    const glass = new Mesh(glassGeo, glassMat);
    glass.castShadow = false;
    glass.receiveShadow = true;
    placeAt(glass, frame, lateral - side * (WIDTH_M / 2 + 0.25), HEIGHT_M * 0.5);
    group.add(glass);
  }

  if (groupIntrudesDriveVolume(track, group)) {
    group.clear();
  }

  return { group, disposables };
}
