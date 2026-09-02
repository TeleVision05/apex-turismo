import { BoxGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial } from 'three';
import type { Track } from '../../../track/Track';
import { findRuns } from '../geometryUtils';
import { canvasTextTexture } from '../textures';
import type { Disposables } from '../types';
import { cornerTurnSign, frameAtS, newFurnitureGroup, placeAt } from './common';

const THRESHOLD = 0.015;
const DISTANCES = [150, 100, 50];
const BOARD_W = 1;
const BOARD_H = 0.6;

/** A 150/100/50 countdown post on the approach to every corner with |curvature| > 0.015. */
export function buildDistanceBoards(track: Track): { group: Group; disposables: Disposables } {
  const group = newFurnitureGroup('distance-boards');
  const disposables: Disposables = { geometries: [], materials: [], textures: [] };
  const active = Array.from(track.curvatures, (k) => Math.abs(k) > THRESHOLD);
  const entries = findRuns(active)
    .filter((run) => run.length > 1)
    .map((run) => run[0]);

  const boardGeo = new BoxGeometry(BOARD_W, BOARD_H, 0.05);
  disposables.geometries.push(boardGeo);
  const postGeo = new BoxGeometry(0.1, 2.2, 0.1);
  const postMat = new MeshStandardMaterial({ color: 0x2f2f2f, roughness: 0.8 });
  disposables.geometries.push(postGeo);
  disposables.materials.push(postMat);

  for (const entryIndex of entries)
    addPost(track, entryIndex, group, boardGeo, postGeo, postMat, disposables);
  return { group, disposables };
}

function addPost(
  track: Track,
  entryIndex: number,
  group: Group,
  boardGeo: BoxGeometry,
  postGeo: BoxGeometry,
  postMat: MeshStandardMaterial,
  disposables: Disposables,
): void {
  const entryS = entryIndex * track.spacing;
  const sign = cornerTurnSign(track, entryIndex) > 0 ? -1 : 1;
  const frame150 = frameAtS(track, entryS - DISTANCES[0]);
  const lateral = sign * (track.barrierDistance(frame150.index) + 2);
  const post = new Mesh(postGeo, postMat);
  placeAt(post, frame150, lateral, 1.1);
  group.add(post);
  DISTANCES.forEach((d, row) => {
    const frame = frameAtS(track, entryS - DISTANCES[0]);
    const texture = canvasTextTexture(String(d), {
      width: 200,
      height: 120,
      bg: '#123a1f',
      fg: '#ffffff',
      fontPx: 72,
    });
    disposables.textures.push(texture);
    const mat = new MeshStandardMaterial({ map: texture, side: DoubleSide, roughness: 0.7 });
    disposables.materials.push(mat);
    const board = new Mesh(boardGeo, mat);
    placeAt(board, frame, lateral, 2.1 - row * (BOARD_H + 0.1));
    group.add(board);
  });
}
