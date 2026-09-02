import { Group, Object3D, Vector3 } from 'three';
import type { Track } from '../../../track/Track';
import { frameAtS, type TrackFrame } from '../geometryUtils';
import { wrapIndex } from '../../../core/math';

/** Orients an object so local -Z faces the track's forward direction at that frame, offset laterally + vertically. */
export function placeAt(object: Object3D, frame: TrackFrame, lateral: number, vertical = 0): void {
  const pos = frame.point.clone().addScaledVector(frame.right, lateral);
  pos.y += vertical;
  object.position.copy(pos);
  object.up.set(0, 1, 0);
  object.lookAt(pos.clone().add(frame.forward));
}

/** Average curvature sign near a sample index, to tell which way a corner turns. */
export function cornerTurnSign(track: Track, index: number): number {
  let sum = 0;
  for (let d = -3; d <= 3; d++) sum += track.curvatures[wrapIndex(index + d, track.n)];
  return sum;
}

/** The side (-1 left, +1 right) opposite the first corner's turn direction, for pit/grandstand placement. */
export function pitSide(track: Track): 1 | -1 {
  const corner = track.corners[0];
  const index = corner ? corner.index : Math.floor(track.n * 0.05);
  const turn = cornerTurnSign(track, index);
  return turn > 0 ? -1 : 1; // turning right => inside is right => pit building on the left
}

export function newFurnitureGroup(name: string): Group {
  const g = new Group();
  g.name = name;
  return g;
}

export { frameAtS };
export type { TrackFrame };
export { Vector3 };
