import { Vector3 } from 'three';
import type { Track } from './Track';
import { wrapIndex, clamp } from '../core/math';

/**
 * A precomputed racing line for AI drivers: lateral offsets from the
 * centreline (metres, +right) and a target speed for every sample.
 */
export class RacingLine {
  readonly offsets: Float32Array;
  readonly points: Vector3[];
  readonly curvature: Float32Array;
  /** target speed (m/s) for a reference car; drivers scale it */
  readonly speed: Float32Array;

  constructor(
    readonly track: Track,
    margin = 1.8,
  ) {
    const n = track.n;
    this.offsets = new Float32Array(n);
    this.optimise(margin);
    this.points = [];
    for (let i = 0; i < n; i++) {
      this.points.push(track.points[i].clone().addScaledVector(track.rights[i], this.offsets[i]));
    }
    this.curvature = new Float32Array(n);
    this.computeCurvature();
    this.speed = new Float32Array(n);
    this.computeSpeeds(1.38, 8.5, 6, 100);
  }

  /**
   * Iteratively pulls each point toward the chord of its neighbours, which
   * straightens corners into the classic outside-inside-outside line, while
   * clamping the offset to the road width. Coarse windows first, then fine.
   */
  private optimise(margin: number): void {
    const t = this.track;
    const n = t.n;
    const pos = t.points.map((p) => new Vector3(p.x, 0, p.z));
    const base = pos.map((p) => p.clone());
    const windows = [40, 24, 14, 8, 5, 3];
    const tmp = new Vector3();
    for (const w of windows) {
      const iterations = 40;
      for (let it = 0; it < iterations; it++) {
        for (let i = 0; i < n; i++) {
          const a = pos[wrapIndex(i - w, n)];
          const b = pos[wrapIndex(i + w, n)];
          tmp.addVectors(a, b).multiplyScalar(0.5);
          const r = t.rights[i];
          const dx = tmp.x - base[i].x;
          const dz = tmp.z - base[i].z;
          const lateral = dx * r.x + dz * r.z;
          const lim = Math.max(0.5, t.widths[i] * 0.5 - margin);
          const target = clamp(lateral, -lim, lim);
          const current = this.offsets[i];
          this.offsets[i] = current + (target - current) * 0.35;
          pos[i].copy(base[i]).addScaledVector(r, this.offsets[i]);
        }
      }
    }
    // light smoothing pass to remove residual sawtooth
    for (let pass = 0; pass < 6; pass++) {
      const copy = Float32Array.from(this.offsets);
      for (let i = 0; i < n; i++) {
        this.offsets[i] =
          (copy[wrapIndex(i - 2, n)] +
            copy[wrapIndex(i - 1, n)] * 2 +
            copy[i] * 3 +
            copy[wrapIndex(i + 1, n)] * 2 +
            copy[wrapIndex(i + 2, n)]) /
          9;
      }
    }
  }

  private computeCurvature(): void {
    const n = this.points.length;
    for (let i = 0; i < n; i++) {
      const a = this.points[wrapIndex(i - 2, n)];
      const b = this.points[i];
      const c = this.points[wrapIndex(i + 2, n)];
      this.curvature[i] = mengerCurvature(a, b, c);
    }
    // conservative: take the tightest curvature in a small window so chicanes are not underestimated
    const copy = Float32Array.from(this.curvature);
    for (let i = 0; i < n; i++) {
      let m = 0;
      for (let k = -2; k <= 2; k++) m = Math.max(m, copy[wrapIndex(i + k, n)]);
      this.curvature[i] = m;
    }
  }

  /**
   * Speed profile: lateral-grip limit per point, then a backward pass for
   * braking and a forward pass for acceleration so the profile is drivable.
   */
  private computeSpeeds(latG: number, brakeDecel: number, accel: number, vMax: number): void {
    const n = this.points.length;
    const ds = this.track.spacing;
    const g = 9.81;
    for (let i = 0; i < n; i++) {
      const k = Math.max(this.curvature[i], 1e-4);
      this.speed[i] = Math.min(vMax, Math.sqrt((latG * g) / k));
    }
    for (let pass = 0; pass < 2; pass++) {
      for (let i = n - 1; i >= -n; i--) {
        const a = wrapIndex(i, n);
        const b = wrapIndex(i + 1, n);
        const seg = Math.max(ds, this.points[a].distanceTo(this.points[b]));
        const limit = Math.sqrt(this.speed[b] * this.speed[b] + 2 * brakeDecel * seg);
        if (this.speed[a] > limit) this.speed[a] = limit;
      }
      for (let i = 0; i < 2 * n; i++) {
        const a = wrapIndex(i, n);
        const b = wrapIndex(i + 1, n);
        const seg = Math.max(ds, this.points[a].distanceTo(this.points[b]));
        const accelHere = accel * Math.max(0.25, 1 - this.speed[a] / (vMax * 1.05));
        const limit = Math.sqrt(this.speed[a] * this.speed[a] + 2 * accelHere * seg);
        if (this.speed[b] > limit) this.speed[b] = limit;
      }
    }
  }

  /** Lowest target speed between two indices (looking ahead a distance). */
  minSpeedAhead(index: number, distanceM: number): number {
    const n = this.points.length;
    const count = Math.ceil(distanceM / this.track.spacing);
    let m = Infinity;
    for (let k = 0; k <= count; k++) m = Math.min(m, this.speed[wrapIndex(index + k, n)]);
    return m;
  }
}

function mengerCurvature(a: Vector3, b: Vector3, c: Vector3): number {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const bcx = c.x - b.x;
  const bcz = c.z - b.z;
  const acx = c.x - a.x;
  const acz = c.z - a.z;
  const cross = Math.abs(abx * bcz - abz * bcx);
  const ab = Math.hypot(abx, abz);
  const bc = Math.hypot(bcx, bcz);
  const ac = Math.hypot(acx, acz);
  if (ab * bc * ac < 1e-6) return 0;
  return (2 * cross) / (ab * bc * ac);
}
