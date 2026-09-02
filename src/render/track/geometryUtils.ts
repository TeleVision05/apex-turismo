import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import type { Track } from '../../track/Track';
import { wrapIndex } from '../../core/math';

/** World-space point at a lateral offset (metres, +right) from a track sample, with a vertical nudge. */
export function edgePoint(
  track: Track,
  i: number,
  lateral: number,
  dy = 0,
  out = new Vector3(),
): Vector3 {
  const p = track.points[i];
  const r = track.rights[i];
  return out.set(p.x + r.x * lateral, p.y + dy, p.z + r.z * lateral);
}

/** Cumulative 3D arc length at each sample, metres. */
export function computeArcLengths(track: Track): Float32Array {
  const out = new Float32Array(track.n);
  let acc = 0;
  for (let i = 1; i < track.n; i++) {
    acc += track.points[i].distanceTo(track.points[i - 1]);
    out[i] = acc;
  }
  return out;
}

export interface RibbonVertex {
  pos: Vector3;
  v: number;
  color?: [number, number, number];
}

/**
 * Builds a non-indexed two-triangle-per-step ribbon between paired left/right
 * samples. `closed` wraps the last step back to index 0.
 */
export function buildRibbon(
  lefts: RibbonVertex[],
  rights: RibbonVertex[],
  closed: boolean,
  withColor = false,
): BufferGeometry {
  const n = lefts.length;
  const steps = closed ? n : n - 1;
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  for (let s = 0; s < steps; s++) {
    const i0 = s;
    const i1 = (s + 1) % n;
    pushQuad(positions, uvs, colors, lefts[i0], rights[i0], rights[i1], lefts[i1], withColor);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  if (withColor) geo.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

function pushQuad(
  positions: number[],
  uvs: number[],
  colors: number[],
  l0: RibbonVertex,
  r0: RibbonVertex,
  r1: RibbonVertex,
  l1: RibbonVertex,
  withColor: boolean,
): void {
  const quad = [l0, r0, r1, l1];
  const us = [0, 1, 1, 0];
  const order = [0, 1, 2, 0, 2, 3];
  for (const idx of order) {
    const v = quad[idx];
    positions.push(v.pos.x, v.pos.y, v.pos.z);
    uvs.push(us[idx], v.v);
    if (withColor) {
      const c = v.color ?? [1, 1, 1];
      colors.push(c[0], c[1], c[2]);
    }
  }
}

/** Groups a boolean-per-sample array into contiguous runs (index lists), tolerant of wraparound. */
export function findRuns(active: boolean[]): number[][] {
  const n = active.length;
  if (n === 0) return [];
  if (active.every(Boolean)) return [Array.from({ length: n }, (_, i) => i)];
  const start = active.findIndex((a) => !a);
  const runs: number[][] = [];
  let current: number[] = [];
  for (let k = 0; k < n; k++) {
    const idx = (start + k) % n;
    if (active[idx]) {
      current.push(idx);
    } else if (current.length) {
      runs.push(current);
      current = [];
    }
  }
  if (current.length) runs.push(current);
  return runs;
}

export interface TrackFrame {
  point: Vector3;
  forward: Vector3;
  right: Vector3;
  index: number;
}

/** Sample position/orientation nearest an arc length s (metres). */
export function frameAtS(track: Track, s: number): TrackFrame {
  const index = track.indexAt(s);
  return {
    point: track.points[index],
    forward: track.forwards[index],
    right: track.rights[index],
    index,
  };
}

/** Which side is the OUTSIDE of a corner at each sample, for a given curvature threshold. */
export function outsideCornerSides(
  track: Track,
  threshold: number,
): { left: boolean[]; right: boolean[] } {
  const left: boolean[] = [];
  const right: boolean[] = [];
  for (let i = 0; i < track.n; i++) {
    const k = track.curvatures[i];
    left.push(k > threshold); // turning right => inside is right => outside is left
    right.push(k < -threshold); // turning left => inside is left => outside is right
  }
  return { left, right };
}

/** Extends a run by `count` samples off each end, following the track's index ring. */
export function extendRun(run: number[], count: number, n: number): number[] {
  if (run.length === 0) return run;
  const before: number[] = [];
  const after: number[] = [];
  for (let k = count; k >= 1; k--) before.push(wrapIndex(run[0] - k, n));
  for (let k = 1; k <= count; k++) after.push(wrapIndex(run[run.length - 1] + k, n));
  return [...before, ...run, ...after];
}
