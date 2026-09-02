import { BoxGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial } from 'three';
import type { Track } from '../../../track/Track';
import { canvasTextTexture } from '../textures';
import type { Disposables } from '../types';
import { cornerTurnSign, newFurnitureGroup, placeAt } from './common';
import { frameAtS } from '../geometryUtils';

const BOARD_W = 1.6;
const BOARD_H = 0.7;

/** A named board at each track.corners entry, mounted outside the barrier. */
export function buildCornerSigns(track: Track): { group: Group; disposables: Disposables } {
  const group = newFurnitureGroup('corner-signs');
  const disposables: Disposables = { geometries: [], materials: [], textures: [] };
  const boardGeo = new BoxGeometry(BOARD_W, BOARD_H, 0.06);
  disposables.geometries.push(boardGeo);

  for (const corner of track.corners) {
    const frame = frameAtS(track, corner.index * track.spacing);
    const sign = cornerTurnSign(track, corner.index) > 0 ? -1 : 1;
    const lateral = sign * (track.barrierDistance(frame.index) + 2.5);
    const label = corner.number !== null ? `${corner.number} ${corner.name}` : corner.name;
    const texture = canvasTextTexture(label, {
      width: 512,
      height: 200,
      bg: '#0d3a1e',
      fg: '#ffffff',
      fontPx: 56,
    });
    disposables.textures.push(texture);
    const material = new MeshStandardMaterial({ map: texture, side: DoubleSide, roughness: 0.7 });
    disposables.materials.push(material);
    const board = new Mesh(boardGeo, material);
    placeAt(board, frame, lateral, 2.2);
    group.add(board);
  }
  return { group, disposables };
}
