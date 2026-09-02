import { Group, Object3D, Vector3 } from 'three';
import type { Track } from '../../../../track/Track';
import { frameAtS, placeAt } from '../../furniture/common';
import { terrainHeightAt } from '../../terrain';
import type { PlacementFrame, Side } from '../types';

const MIN_CLEARANCE_M = 4;

/** Resolves an (s, side, distance) placement to a world position sitting on the terrain. */
export function landmarkFrame(
  track: Track,
  s: number,
  side: Side,
  distance: number,
): PlacementFrame {
  const frame = frameAtS(track, s);
  const sign = side === 'left' ? -1 : side === 'right' ? 1 : 0;
  const clearance = Math.max(MIN_CLEARANCE_M, distance);
  const lateral = sign * (track.barrierDistance(frame.index) + clearance);
  const x = frame.point.x + frame.right.x * lateral;
  const z = frame.point.z + frame.right.z * lateral;
  const { y } = terrainHeightAt(track, x, z, frame.index);
  return {
    position: new Vector3(x, y, z),
    forward: frame.forward,
    right: frame.right,
    index: frame.index,
  };
}

/** Places an object at a world position, facing `forward`, with an extra yaw in degrees. */
export function placeFacing(
  object: Object3D,
  position: Vector3,
  forward: Vector3,
  vertical: number,
  rotationDeg = 0,
): void {
  object.up.set(0, 1, 0);
  const p = position.clone();
  p.y += vertical;
  object.position.copy(p);
  object.lookAt(p.clone().add(forward));
  if (rotationDeg) object.rotateY((rotationDeg * Math.PI) / 180);
}

/** Orients an object3D at a resolved placement frame, facing along the track plus an extra yaw. */
export function orientAt(
  object: Object3D,
  pf: PlacementFrame,
  vertical: number,
  rotationDeg = 0,
): void {
  placeFacing(object, pf.position, pf.forward, vertical, rotationDeg);
}

/** A position shifted further sideways (away from / along the track's right axis) from a placement frame. */
export function lateralOffset(pf: PlacementFrame, sign: number, amount: number): Vector3 {
  return pf.position.clone().addScaledVector(pf.right, sign * amount);
}

/** Same as landmarkFrame but keeps the road's own height (for bridges spanning the track, not off to the side). */
export function overRoadFrame(track: Track, s: number): PlacementFrame {
  const frame = frameAtS(track, s);
  return {
    position: track.points[frame.index].clone(),
    forward: frame.forward,
    right: frame.right,
    index: frame.index,
  };
}

export function newGroup(name: string): Group {
  const g = new Group();
  g.name = name;
  return g;
}

export { placeAt };
export { Vector3 };
