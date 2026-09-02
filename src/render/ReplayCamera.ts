import { PerspectiveCamera, Vector3 } from 'three';
import type { Track } from '../track/Track';
import { damp, wrapIndex } from '../core/math';

interface TvCamera {
  pos: Vector3;
  /** track index the camera watches */
  index: number;
}

/**
 * Trackside "TV" cameras placed outside the barriers. During a replay the
 * camera nearest ahead of the subject is used and pans to follow it, with the
 * classic zoom-in as the car recedes.
 */
export class ReplayCameraDirector {
  private readonly cams: TvCamera[] = [];
  private current = 0;
  private readonly look = new Vector3();
  private readonly tmp = new Vector3();
  private fov = 40;
  private lastHint = 0;

  constructor(
    readonly track: Track,
    private readonly camera: PerspectiveCamera,
  ) {
    const step = Math.round(220 / track.spacing);
    for (let i = 0; i < track.n; i += step) {
      // stand on the outside of the corner when there is one, otherwise alternate sides
      const k = track.curvatures[i];
      const side = Math.abs(k) > 0.003 ? -Math.sign(k) : i % (2 * step) === 0 ? 1 : -1;
      const p = track.points[i]
        .clone()
        .addScaledVector(track.rights[i], side * (track.barrierDistance(i) + 6));
      p.y += 5 + Math.random() * 3;
      this.cams.push({ pos: p, index: i });
    }
  }

  reset(): void {
    this.current = 0;
    this.lastHint = 0;
  }

  update(subject: Vector3, dt: number): void {
    const idx = this.track.nearestIndex(subject, this.lastHint);
    this.lastHint = idx;
    // pick the first camera whose watch index is ahead of the car by up to a segment
    let best = this.current;
    let bestAhead = Infinity;
    for (let c = 0; c < this.cams.length; c++) {
      const ahead = wrapIndex(this.cams[c].index - idx, this.track.n) * this.track.spacing;
      if (ahead < bestAhead && ahead < 260) {
        bestAhead = ahead;
        best = c;
      }
    }
    if (best !== this.current) {
      this.current = best;
      this.look.copy(subject);
    }
    const cam = this.cams[this.current];
    this.camera.position.copy(cam.pos);
    this.look.lerp(subject, 1 - Math.exp(-dt / 0.12));
    const dist = this.tmp.subVectors(subject, cam.pos).length();
    const targetFov = Math.max(14, Math.min(55, 1400 / Math.max(20, dist)));
    this.fov = damp(this.fov, targetFov, 0.4, dt);
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.look);
  }
}
