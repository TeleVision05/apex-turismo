import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import type { Track } from '../../../track/Track';
import type { Disposables } from '../types';
import { frameAtS, newFurnitureGroup, pitSide, placeAt } from './common';

const LENGTH_M = 120;
const WIDTH_M = 14;
const HEIGHT_M = 8;
const CENTER_S = -70;

/** A long low pit building with a glazed front, on the side opposite the first corner's turn. */
export function buildPitBuilding(track: Track): { group: Group; disposables: Disposables } {
  const group = newFurnitureGroup('pit-building');
  const side = pitSide(track);
  const frame = frameAtS(track, CENTER_S);
  const lateral = side * (track.barrierDistance(frame.index) + 9);

  const bodyGeo = new BoxGeometry(WIDTH_M, HEIGHT_M, LENGTH_M);
  const bodyMat = new MeshStandardMaterial({ color: 0xd8d8dc, roughness: 0.8 });
  const body = new Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  placeAt(body, frame, lateral, HEIGHT_M / 2);

  const glassGeo = new BoxGeometry(0.4, HEIGHT_M * 0.55, LENGTH_M * 0.9);
  const glassMat = new MeshStandardMaterial({
    color: 0x1c3a52,
    roughness: 0.15,
    metalness: 0.4,
    emissive: 0x0a1622,
  });
  const glass = new Mesh(glassGeo, glassMat);
  const glassFrame = frameAtS(track, CENTER_S);
  placeAt(glass, glassFrame, lateral - side * (WIDTH_M / 2 + 0.25), HEIGHT_M * 0.5);
  glass.castShadow = false;
  glass.receiveShadow = true;

  group.add(body, glass);
  return {
    group,
    disposables: { geometries: [bodyGeo, glassGeo], materials: [bodyMat, glassMat], textures: [] },
  };
}
