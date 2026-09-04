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
/** Tightest plan-view radius the centreline may carry; see relaxTightCorners. */
export const MIN_CORNER_RADIUS = 10;

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
    this.relaxTightCorners();
    this.raiseCrossovers();
    this.forwards = [];
    this.rights = [];
    this.normals = [];
    this.curvatures = new Float32Array(this.n);
    this.computeFrames();
    this.buildCoarse();
  }

  /**
   * OSM traces resampled at 4 m carry kinks far tighter than any real corner
   * (Remus at the Red Bull Ring came out at a 6.6 m radius, Suzuka's chicane
   * at 4.8 m). Where the local radius drops below the road half width plus
   * run-off, the inside edge of the road ribbon folds over itself and the
   * nearest-centreline lookup jumps whole samples on a grade: the "step in
   * the road" that launched cars. Laplacian-relax the plan-view polyline at
   * such kinks until every sample keeps a realistic minimum radius; heights
   * are left alone because they are already smooth against the index.
   */
  private relaxTightCorners(): void {
    const n = this.n;
    const minRadius = Math.max(MIN_CORNER_RADIUS, this.widths[0] * 0.5 + RUNOFF_WIDTH);
    const marked = new Uint8Array(n);
    const xs = new Float64Array(n);
    const zs = new Float64Array(n);
    for (let iter = 0; iter < 200; iter++) {
      marked.fill(0);
      let any = false;
      for (let i = 0; i < n; i++) {
        if (localRadius(this.points, i) >= minRadius) continue;
        marked[wrapIndex(i - 1, n)] = marked[i] = marked[wrapIndex(i + 1, n)] = 1;
        any = true;
      }
      if (!any) return;
      for (let i = 0; i < n; i++) {
        xs[i] = this.points[i].x;
        zs[i] = this.points[i].z;
      }
      for (let i = 0; i < n; i++) {
        if (!marked[i]) continue;
        const a = wrapIndex(i - 1, n);
        const b = wrapIndex(i + 1, n);
        this.points[i].x = 0.5 * xs[i] + 0.25 * (xs[a] + xs[b]);
        this.points[i].z = 0.5 * zs[i] + 0.25 * (zs[a] + zs[b]);
      }
    }
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
    let bestD = distXZ2(this.points[guess], pos);
    const window = 12;
    for (let k = -window; k <= window; k++) {
      const i = wrapIndex(guess + k, this.n);
      const d = distXZ2(this.points[i], pos);
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
    let bestD = distXZ2(this.points[hint], pos);
    for (let k = -window; k <= window; k++) {
      const i = wrapIndex(hint + k, this.n);
      const d = distXZ2(this.points[i], pos);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (bestD > 60 * 60) return this.nearestIndexGlobal(pos);
    return best;
  }

  /**
   * Projects a position onto the road and returns local track information.
   * The road ribbon is ruled between consecutive cross-sections (the line
   * through each sample along its right vector), so the point is located on
   * the bilinear quad between two sections: a section parameter u and a
   * lateral offset d along the interpolated section. Both quads meeting at the
   * nearest sample share that sample's section, so height and lateral stay
   * continuous no matter which sample the nearest-index search settles on,
   * even on the inside of tight corners where the sections converge.
   */
  query(pos: Vector3, hint: number | null, out?: TrackQuery): TrackQuery {
    const i = this.nearestIndex(pos, hint);
    const n = this.n;
    const prev = wrapIndex(i - 1, n);
    const next = wrapIndex(i + 1, n);
    const pts = this.points;
    const rts = this.rights;
    const uA = sectionParam(pts[prev], pts[i], rts[prev], rts[i], pos);
    const dA = sectionScratch.d;
    const uB = sectionParam(pts[i], pts[next], rts[i], rts[next], pos);
    const dB = sectionScratch.d;
    // prefer the quad that contains the point; otherwise the one it overshoots least
    const missA = uA < 0 ? -uA : uA > 1 ? uA - 1 : 0;
    const missB = uB < 0 ? -uB : uB > 1 ? uB - 1 : 0;
    const useA = missA < missB;
    const a = useA ? prev : i;
    const b = useA ? i : next;
    const u = clampInt(useA ? uA : uB, 0, 1);
    const lateral = useA ? dA : dB;
    const height = pts[a].y + (pts[b].y - pts[a].y) * u;
    const halfWidth = (this.widths[a] + (this.widths[b] - this.widths[a]) * u) * 0.5;
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
    res.s = wrapS((a + u) * this.spacing, this.length);
    res.lateral = lateral;
    res.halfWidth = halfWidth;
    res.height = height;
    res.forward.copy(this.forwards[i]);
    res.right.copy(this.rights[i]);
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
const distXZ2 = (p: Vector3, q: Vector3): number => (p.x - q.x) ** 2 + (p.z - q.z) ** 2;
const sectionScratch = { d: 0 };

/**
 * Locates `pos` on the ruled quad between cross-sections a and b in plan view:
 * solves pos = lerp(pa, pb, u) + d * lerp(ra, rb, u) for u (returned,
 * unclamped) and d (left in sectionScratch.d, measured along the section at
 * the clamped u). The parallel condition is a quadratic in u; the root nearest
 * [0, 1] is taken.
 */
function sectionParam(pa: Vector3, pb: Vector3, ra: Vector3, rb: Vector3, pos: Vector3): number {
  const ax = pos.x - pa.x;
  const az = pos.z - pa.z;
  const bx = pb.x - pa.x;
  const bz = pb.z - pa.z;
  const dx = rb.x - ra.x;
  const dz = rb.z - ra.z;
  const c0 = ax * ra.z - az * ra.x;
  const c1 = ax * dz - az * dx - (bx * ra.z - bz * ra.x);
  const c2 = -(bx * dz - bz * dx);
  let u: number;
  if (Math.abs(c2) < 1e-9) {
    u = Math.abs(c1) < 1e-12 ? 0 : -c0 / c1;
  } else {
    const disc = c1 * c1 - 4 * c2 * c0;
    if (disc <= 0) {
      u = -c1 / (2 * c2);
    } else {
      const sq = Math.sqrt(disc);
      const u1 = (-c1 + sq) / (2 * c2);
      const u2 = (-c1 - sq) / (2 * c2);
      u = missFromUnit(u1) <= missFromUnit(u2) ? u1 : u2;
    }
  }
  const uc = clampInt(u, 0, 1);
  const ex = ra.x + uc * dx;
  const ez = ra.z + uc * dz;
  const el2 = ex * ex + ez * ez || 1;
  sectionScratch.d = ((ax - uc * bx) * ex + (az - uc * bz) * ez) / el2;
  return u;
}
const missFromUnit = (u: number): number => (u < 0 ? -u : u > 1 ? u - 1 : 0);

/** Plan-view radius of the turn at sample i: mean segment length over the turning angle. */
export function localRadius(points: Vector3[], i: number): number {
  const n = points.length;
  const a = points[wrapIndex(i - 1, n)];
  const b = points[i];
  const c = points[wrapIndex(i + 1, n)];
  const d1x = b.x - a.x;
  const d1z = b.z - a.z;
  const d2x = c.x - b.x;
  const d2z = c.z - b.z;
  const angle = Math.abs(Math.atan2(d1x * d2z - d1z * d2x, d1x * d2x + d1z * d2z));
  if (angle < 1e-6) return Infinity;
  return (0.5 * (Math.hypot(d1x, d1z) + Math.hypot(d2x, d2z))) / angle;
}

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
