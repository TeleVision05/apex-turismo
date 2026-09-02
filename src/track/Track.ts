import { Vector3 } from 'three';
import type { TrackJson, TrackCorner } from '../core/types';
import { wrapIndex } from '../core/math';

/** Result of projecting a world position onto the track centreline. */
export interface TrackQuery {
  /** nearest sample index */
  index: number;
  /** arc length along the track in metres (0 at start/finish) */
  s: number;
  /** signed lateral offset, positive to the right of the driving direction */
  lateral: number;
  /** road half width at this point */
  halfWidth: number;
  /** surface height at the query position */
  height: number;
  /** unit forward direction of the track here */
  forward: Vector3;
  /** unit right direction */
  right: Vector3;
  /** surface normal */
  normal: Vector3;
  /** unsigned curvature 1/m (positive = turns right) */
  curvature: number;
}

export type Surface = 'asphalt' | 'curb' | 'grass' | 'gravel';

/** Distance beyond the road edge where the run-off ends and the barrier stands. */
export const RUNOFF_WIDTH = 7;
export const CURB_WIDTH = 1.2;
/** Height added to the upper road at a crossover (Suzuka's bridge). */
export const BRIDGE_HEIGHT = 7;

/**
 * Runtime representation of a circuit: a closed ring of samples with
 * cached tangents, normals and a spatial hash for nearest-point lookups.
 */
export class Track {
  readonly id: string;
  readonly name: string;
  readonly country: string;
  readonly n: number;
  readonly spacing: number;
  readonly length: number;
  readonly points: Vector3[];
  readonly forwards: Vector3[];
  readonly rights: Vector3[];
  readonly normals: Vector3[];
  readonly widths: Float32Array;
  readonly curvatures: Float32Array;
  readonly corners: TrackCorner[];
  /** true where the sample sits on a bridge over another part of the track */
  readonly bridge: Uint8Array;
  private readonly coarseCell = 24;
  private coarse = new Int32Array(0);
  private coarseCols = 0;
  private coarseRows = 0;
  private coarseMinX = 0;
  private coarseMinZ = 0;

  constructor(json: TrackJson) {
    this.id = json.id;
    this.name = json.name;
    this.country = json.country;
    this.n = json.points.length;
    this.spacing = json.sampleSpacingM;
    this.length = this.n * this.spacing;
    this.corners = json.corners;
    this.points = json.points.map((p) => new Vector3(p[0], p[1], p[2]));
    this.widths = Float32Array.from(
      json.widths.length === this.n ? json.widths : this.points.map(() => 12),
    );
    this.bridge = new Uint8Array(this.n);
    this.raiseCrossovers();
    this.forwards = [];
    this.rights = [];
    this.normals = [];
    this.curvatures = new Float32Array(this.n);
    this.computeFrames();
    this.buildCoarse();
  }

  /** Detects 2D self-intersections and lifts the later segment onto a bridge. */
  private raiseCrossovers(): void {
    const n = this.n;
    const crossings: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = this.points[i];
      const b = this.points[wrapIndex(i + 1, n)];
      for (let j = i + 20; j < n; j++) {
        if (i === 0 && j >= n - 20) continue;
        const c = this.points[j];
        const d = this.points[wrapIndex(j + 1, n)];
        if (segmentsCross(a, b, c, d)) crossings.push(j);
      }
    }
    const halfSpan = Math.round(140 / this.spacing);
    for (const j of crossings) {
      for (let k = -halfSpan; k <= halfSpan; k++) {
        const t = 1 - Math.abs(k) / halfSpan;
        const h = BRIDGE_HEIGHT * (t * t * (3 - 2 * t));
        const idx = wrapIndex(j + k, n);
        this.points[idx].y += h;
        if (Math.abs(k) < halfSpan * 0.55) this.bridge[idx] = 1;
      }
    }
  }

  private computeFrames(): void {
    const n = this.n;
    const up = new Vector3(0, 1, 0);
    for (let i = 0; i < n; i++) {
      const prev = this.points[wrapIndex(i - 1, n)];
      const next = this.points[wrapIndex(i + 1, n)];
      const f = new Vector3().subVectors(next, prev).normalize();
      const r = new Vector3().crossVectors(f, up).normalize();
      const nrm = new Vector3().crossVectors(r, f).normalize();
      this.forwards.push(f);
      this.rights.push(r);
      this.normals.push(nrm);
    }
    for (let i = 0; i < n; i++) {
      const f0 = this.forwards[wrapIndex(i - 2, n)];
      const f1 = this.forwards[wrapIndex(i + 2, n)];
      const cross = f0.x * f1.z - f0.z * f1.x; // positive when turning right (y-up)
      const angle = Math.atan2(cross, f0.x * f1.x + f0.z * f1.z);
      this.curvatures[i] = angle / (4 * this.spacing);
    }
  }

  /**
   * Global nearest sample: a coarse lookup table (built once) gives a good
   * candidate anywhere near the circuit, refined by a local window search.
   */
  nearestIndexGlobal(pos: Vector3): number {
    const cx = clampInt(
      Math.floor((pos.x - this.coarseMinX) / this.coarseCell),
      0,
      this.coarseCols - 1,
    );
    const cz = clampInt(
      Math.floor((pos.z - this.coarseMinZ) / this.coarseCell),
      0,
      this.coarseRows - 1,
    );
    const guess = this.coarse[cz * this.coarseCols + cx];
    let best = guess;
    let bestD = this.points[guess].distanceToSquared(pos);
    const window = 12;
    for (let k = -window; k <= window; k++) {
      const i = wrapIndex(guess + k, this.n);
      const d = this.points[i].distanceToSquared(pos);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  private buildCoarse(): void {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of this.points) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
    const margin = 700;
    this.coarseMinX = minX - margin;
    this.coarseMinZ = minZ - margin;
    this.coarseCols = Math.ceil((maxX - minX + 2 * margin) / this.coarseCell);
    this.coarseRows = Math.ceil((maxZ - minZ + 2 * margin) / this.coarseCell);
    this.coarse = new Int32Array(this.coarseCols * this.coarseRows);
    // sub-sample the centreline for the brute-force pass; the window search refines the rest
    const stride = Math.max(1, Math.floor(20 / this.spacing));
    for (let r = 0; r < this.coarseRows; r++) {
      const z = this.coarseMinZ + (r + 0.5) * this.coarseCell;
      for (let c = 0; c < this.coarseCols; c++) {
        const x = this.coarseMinX + (c + 0.5) * this.coarseCell;
        let best = 0;
        let bestD = Infinity;
        for (let i = 0; i < this.n; i += stride) {
          const p = this.points[i];
          const dx = p.x - x;
          const dz = p.z - z;
          const d = dx * dx + dz * dz;
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
        this.coarse[r * this.coarseCols + c] = best;
      }
    }
  }

  /** Nearest sample near a previous index (temporal coherence), falling back to a global search. */
  nearestIndex(pos: Vector3, hint: number | null): number {
    if (hint === null) return this.nearestIndexGlobal(pos);
    const window = 30;
    let best = hint;
    let bestD = this.points[hint].distanceToSquared(pos);
    for (let k = -window; k <= window; k++) {
      const i = wrapIndex(hint + k, this.n);
      const d = this.points[i].distanceToSquared(pos);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (bestD > 60 * 60) return this.nearestIndexGlobal(pos);
    return best;
  }

  /** Projects a position onto the centreline and returns local track information. */
  query(pos: Vector3, hint: number | null, out?: TrackQuery): TrackQuery {
    const i = this.nearestIndex(pos, hint);
    const p = this.points[i];
    const f = this.forwards[i];
    const dx = pos.x - p.x;
    const dz = pos.z - p.z;
    const along = dx * f.x + dz * f.z; // metres ahead of the sample
    const t = Math.max(-1, Math.min(1, along / this.spacing));
    const j = wrapIndex(i + (t >= 0 ? 1 : -1), this.n);
    const q = this.points[j];
    const at = Math.abs(t);
    const height = p.y + (q.y - p.y) * at;
    const r = this.rights[i];
    const lateral = dx * r.x + dz * r.z;
    const halfWidth = (this.widths[i] + (this.widths[j] - this.widths[i]) * at) * 0.5;
    const res = out ?? {
      index: 0,
      s: 0,
      lateral: 0,
      halfWidth: 0,
      height: 0,
      forward: new Vector3(),
      right: new Vector3(),
      normal: new Vector3(),
      curvature: 0,
    };
    res.index = i;
    res.s = wrapS(i * this.spacing + along, this.length);
    res.lateral = lateral;
    res.halfWidth = halfWidth;
    res.height = height;
    res.forward.copy(f);
    res.right.copy(r);
    res.normal.copy(this.normals[i]);
    res.curvature = this.curvatures[i];
    return res;
  }

  /** Surface type at a signed lateral offset. */
  surfaceAt(lateral: number, halfWidth: number, index: number): Surface {
    const a = Math.abs(lateral);
    if (a <= halfWidth) return 'asphalt';
    if (a <= halfWidth + CURB_WIDTH && Math.abs(this.curvatures[index]) > 0.004) return 'curb';
    if (a <= halfWidth + 3) return 'grass';
    return 'gravel';
  }

  /** Lateral distance from the centreline to the barrier at a sample. */
  barrierDistance(index: number): number {
    return this.widths[index] * 0.5 + RUNOFF_WIDTH;
  }

  /** Interpolated point at arc length s (metres). */
  pointAt(s: number, out = new Vector3()): Vector3 {
    const u = wrapS(s, this.length) / this.spacing;
    const i = Math.floor(u);
    const t = u - i;
    return out
      .copy(this.points[wrapIndex(i, this.n)])
      .lerp(this.points[wrapIndex(i + 1, this.n)], t);
  }

  indexAt(s: number): number {
    return wrapIndex(Math.round(wrapS(s, this.length) / this.spacing), this.n);
  }

  /** Signed distance along the track from a to b, in (-length/2, length/2]. */
  deltaS(a: number, b: number): number {
    let d = b - a;
    const L = this.length;
    d = ((d % L) + L) % L;
    if (d > L / 2) d -= L;
    return d;
  }
}

export const wrapS = (s: number, length: number): number => ((s % length) + length) % length;
const clampInt = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

function segmentsCross(a: Vector3, b: Vector3, c: Vector3, d: Vector3): boolean {
  const d1 = orient(c, d, a);
  const d2 = orient(c, d, b);
  const d3 = orient(a, b, c);
  const d4 = orient(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
function orient(p: Vector3, q: Vector3, r: Vector3): number {
  return (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
}

export async function loadTrackJson(id: string): Promise<TrackJson> {
  const res = await fetch(`${import.meta.env.BASE_URL}tracks/${id}.json`);
  if (!res.ok) throw new Error(`Track ${id} could not be loaded (${res.status})`);
  return (await res.json()) as TrackJson;
}
