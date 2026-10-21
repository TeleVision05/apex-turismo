import { BufferGeometry, Float32BufferAttribute, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { BRIDGE_HEIGHT, type Track } from '../../track/Track';
import { wrapIndex } from '../../core/math';
import { fbm } from './textures';
import type { TextureSet } from './textures';
import type { Disposables } from './types';

const MARGIN_M = 500;
/** Grid step; kept uniform since even the largest track stays well under the ~600k vertex budget at this step. */
export const RESOLUTION_M = 5;
const HILL_AMPLITUDE = 25;
/** How far the flat, always-below-the-road corridor floor sits beneath the nearest road sample. */
const RUNOFF_DROP = 0.4;
/** Metres beyond the blend start where the terrain has fully reached the rolling-hill height. */
const HILL_BLEND_M = 40;
/** Extra clearance (beyond track.barrierDistance) that stays flat at road height minus RUNOFF_DROP. */
const CORRIDOR_MARGIN_M = 6;
/** Neighbouring centreline samples (each side) considered when hunting for the true nearest road height. */
const NEIGHBOR_WINDOW = 12;
/** Only neighbours within this 2D distance of the query point count toward the minimum road height. */
const NEIGHBOR_MAX_DIST_M = 30;
/** Gaussian falloff (metres) for the distance-weighted average road height used as the hill base. */
const AVERAGE_SIGMA_M = 20;
/**
 * Extra clearance beyond the corridor (CORRIDOR_MARGIN_M) before a vertex is eligible for the
 * post-build smoothing blur, so blurring never reads/writes a corridor vertex nor a vertex right
 * on its boundary.
 */
const BLUR_MARGIN_M = 2;
const BLUR_PASSES = 2;
/**
 * Extra radius when carving corridors into the finished heightfield so a grid triangle that
 * covers the road cannot interpolate above it from a high neighbour outside the corridor.
 */
const GRID_CARVE_PAD_M = RESOLUTION_M * Math.SQRT2;

interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function computeBounds(track: Track): Bounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of track.points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  return {
    minX: minX - MARGIN_M,
    maxX: maxX + MARGIN_M,
    minZ: minZ - MARGIN_M,
    maxZ: maxZ + MARGIN_M,
  };
}

/**
 * The height of the road itself at centreline sample `j`, in the sense the terrain must stay
 * below: for a sample on the raised, upper deck of a bridge crossing this is the height of the
 * LOWER road passing underneath (upper deck - BRIDGE_HEIGHT), never the deck itself, so the
 * terrain corridor always tracks the ground road and the upper deck is left to float.
 */
function roadHeightAt(track: Track, j: number): number {
  const y = track.points[j].y;
  return track.bridge[j] ? y - BRIDGE_HEIGHT : y;
}

/**
 * Minimum road height among centreline samples within NEIGHBOR_WINDOW of `centerIndex` and
 * within NEIGHBOR_MAX_DIST_M (2D) of (x, z). Using a window + minimum (rather than the single
 * nearest sample) keeps the terrain from poking through the road ribbon on slopes and near
 * corners, where linear interpolation between widely-spaced samples would otherwise cross above
 * the road surface. Used ONLY for the corridor rule (and as the fixed anchor the outside blend
 * starts from) - never as the base for the hillside beyond it, since the hard min jumps
 * discretely as the window slides and produces visible terraces.
 */
function minRoadHeightNear(track: Track, x: number, z: number, centerIndex: number): number {
  let min = Infinity;
  const maxDistSq = NEIGHBOR_MAX_DIST_M * NEIGHBOR_MAX_DIST_M;
  for (let k = -NEIGHBOR_WINDOW; k <= NEIGHBOR_WINDOW; k++) {
    const j = wrapIndex(centerIndex + k, track.n);
    const p = track.points[j];
    const dx = p.x - x;
    const dz = p.z - z;
    if (dx * dx + dz * dz > maxDistSq) continue;
    const y = roadHeightAt(track, j);
    if (y < min) min = y;
  }
  return Number.isFinite(min) ? min : roadHeightAt(track, centerIndex);
}

/**
 * Distance-weighted (Gaussian) average road height among the same neighbour window, used as the
 * hillside base beyond the corridor. Unlike the hard minimum, every neighbour's contribution
 * fades continuously with distance, so as the query point moves and the window slides by one
 * sample the result shifts smoothly instead of jumping - this is what removes the stepped
 * terraces/plateaus a hard min produces on open hillsides.
 */
function weightedAverageRoadHeightNear(
  track: Track,
  x: number,
  z: number,
  centerIndex: number,
): number {
  let sumWeight = 0;
  let sumWeightedY = 0;
  const twoSigmaSq = 2 * AVERAGE_SIGMA_M * AVERAGE_SIGMA_M;
  for (let k = -NEIGHBOR_WINDOW; k <= NEIGHBOR_WINDOW; k++) {
    const j = wrapIndex(centerIndex + k, track.n);
    const p = track.points[j];
    const dx = p.x - x;
    const dz = p.z - z;
    const distSq = dx * dx + dz * dz;
    const weight = Math.exp(-distSq / twoSigmaSq);
    sumWeight += weight;
    sumWeightedY += weight * roadHeightAt(track, j);
  }
  return sumWeight > 0 ? sumWeightedY / sumWeight : roadHeightAt(track, centerIndex);
}

export interface TerrainHeightSample {
  y: number;
  hint: number;
  /** signed lateral offset from the centreline at the resolved sample */
  lateral: number;
  /** lateral distance (barrierDistance + CORRIDOR_MARGIN_M) at which the flat corridor ends */
  corridorEdge: number;
}

/**
 * Lowest corridor floor among every centreline sample whose circular corridor (barrier +
 * margin + optional pad) covers (x, z). Returns null when the point sits outside every
 * corridor. Used for dressing/trees and as the source of truth for the heightfield carve so
 * a wrong nearest-loop pick cannot bury the road or buildings on a figure-8.
 */
export function corridorFloorAt(track: Track, x: number, z: number, padM = 0): number | null {
  let floor: number | null = null;
  for (let i = 0; i < track.n; i++) {
    const p = track.points[i];
    const edge = track.barrierDistance(i) + CORRIDOR_MARGIN_M + padM;
    const dx = x - p.x;
    if (dx > edge || dx < -edge) continue;
    const dz = z - p.z;
    if (dz > edge || dz < -edge) continue;
    if (dx * dx + dz * dz > edge * edge) continue;
    const f = roadHeightAt(track, i) - RUNOFF_DROP;
    floor = floor === null ? f : Math.min(floor, f);
  }
  return floor;
}

/** Height + local track-relative info at an arbitrary world (x,z), via Track's own spatial hash (not O(n^2)). */
export function terrainHeightAt(
  track: Track,
  x: number,
  z: number,
  hint: number,
): TerrainHeightSample {
  const probe = new Vector3(x, 0, z);
  const q = track.query(probe, hint);
  probe.y = q.height;
  // Re-query at the first-guess height: this biases the match toward the LOWER road at bridge
  // crossovers (whose deck sits ~BRIDGE_HEIGHT above the point (x, 0, z) would otherwise land near).
  const q2 = track.query(probe, q.index);
  const minRoad = minRoadHeightNear(track, x, z, q2.index);
  const corridorEdge = track.barrierDistance(q2.index) + CORRIDOR_MARGIN_M;
  const distBeyondCorridor = Math.max(0, Math.abs(q2.lateral) - corridorEdge);
  const avgRoad = weightedAverageRoadHeightNear(track, x, z, q2.index);
  const hillNoise = fbm(x / 400, z / 400, 91, 5) * 2 - 1;
  const hillY = avgRoad + hillNoise * HILL_AMPLITUDE;
  const t = smoothstep(0, HILL_BLEND_M, distBeyondCorridor);
  // At t=0 (the corridor boundary) this is exactly minRoad - RUNOFF_DROP, matching the corridor
  // rule with no seam; as t grows the smoothly-averaged hillY quickly takes over.
  let y = lerp(minRoad - RUNOFF_DROP, hillY, t);
  // Outside the primary corridor, another loop of a figure-8 / parallel may still claim this
  // point. Skip the O(n) scan when even the nearest sample is farther than any corridor.
  if (distBeyondCorridor > 0) {
    const near = track.points[q2.index];
    const nearDistSq = (x - near.x) * (x - near.x) + (z - near.z) * (z - near.z);
    if (nearDistSq < 40 * 40) {
      const multiFloor = corridorFloorAt(track, x, z);
      if (multiFloor !== null) y = Math.min(y, multiFloor);
    }
  }
  return { y, hint: q2.index, lateral: q2.lateral, corridorEdge };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export interface TerrainBuild {
  mesh: Mesh;
  disposables: Disposables;
}

/**
 * Two passes of a 3x3 box blur over vertex heights, restricted to vertices flagged in `mask`.
 * Reads each pass from a snapshot taken before it, so blurred vertices never see already-blurred
 * neighbours from the same pass (keeps the blur symmetric). Unmasked vertices - the whole
 * corridor plus its BLUR_MARGIN_M buffer - are never read into by the write and never written to.
 */
function blurHeights(positions: Float32Array, mask: Uint8Array, cols: number, rows: number): void {
  const stride = cols + 1;
  const count = mask.length;
  for (let pass = 0; pass < BLUR_PASSES; pass++) {
    const snapshot = new Float32Array(count);
    for (let i = 0; i < count; i++) snapshot[i] = positions[i * 3 + 1];
    for (let row = 0; row <= rows; row++) {
      for (let col = 0; col <= cols; col++) {
        const idx = row * stride + col;
        if (!mask[idx]) continue;
        let sum = 0;
        let n = 0;
        for (let dr = -1; dr <= 1; dr++) {
          const r2 = row + dr;
          if (r2 < 0 || r2 > rows) continue;
          for (let dc = -1; dc <= 1; dc++) {
            const c2 = col + dc;
            if (c2 < 0 || c2 > cols) continue;
            sum += snapshot[r2 * stride + c2];
            n++;
          }
        }
        positions[idx * 3 + 1] = sum / n;
      }
    }
  }
}

/**
 * Stamps every centreline sample's corridor into the heightfield (and optionally clears the
 * blur mask). Sample-centric so cost is O(samples × cells-per-corridor), not O(grid × samples).
 */
function stampCorridors(
  positions: Float32Array,
  blurMask: Uint8Array | null,
  track: Track,
  bounds: Bounds,
  cols: number,
  rows: number,
  padM: number,
  carveHeights: boolean,
): void {
  const stride = cols + 1;
  for (let i = 0; i < track.n; i++) {
    const p = track.points[i];
    const edge = track.barrierDistance(i) + CORRIDOR_MARGIN_M + padM;
    const floor = roadHeightAt(track, i) - RUNOFF_DROP;
    const edgeSq = edge * edge;
    const col0 = Math.max(0, Math.floor((p.x - edge - bounds.minX) / RESOLUTION_M));
    const col1 = Math.min(cols, Math.ceil((p.x + edge - bounds.minX) / RESOLUTION_M));
    const row0 = Math.max(0, Math.floor((p.z - edge - bounds.minZ) / RESOLUTION_M));
    const row1 = Math.min(rows, Math.ceil((p.z + edge - bounds.minZ) / RESOLUTION_M));
    for (let row = row0; row <= row1; row++) {
      for (let col = col0; col <= col1; col++) {
        const idx = row * stride + col;
        const x = bounds.minX + col * RESOLUTION_M;
        const z = bounds.minZ + row * RESOLUTION_M;
        const dx = x - p.x;
        const dz = z - p.z;
        if (dx * dx + dz * dz > edgeSq) continue;
        if (blurMask) blurMask[idx] = 0;
        if (carveHeights && positions[idx * 3 + 1] > floor) positions[idx * 3 + 1] = floor;
      }
    }
  }
}

/** A heightfield grid over the track bounds + margin, following track height near the road and rolling hills further out. */
export function buildTerrain(track: Track, textures: TextureSet): TerrainBuild {
  const bounds = computeBounds(track);
  const cols = Math.max(2, Math.ceil((bounds.maxX - bounds.minX) / RESOLUTION_M));
  const rows = Math.max(2, Math.ceil((bounds.maxZ - bounds.minZ) / RESOLUTION_M));
  const positions = new Float32Array((cols + 1) * (rows + 1) * 3);
  const uvs = new Float32Array((cols + 1) * (rows + 1) * 2);
  const blurMask = new Uint8Array((cols + 1) * (rows + 1));
  blurMask.fill(1);
  const probe = new Vector3();
  let p = 0;
  let u = 0;
  for (let row = 0; row <= rows; row++) {
    for (let col = 0; col <= cols; col++) {
      const x = bounds.minX + col * RESOLUTION_M;
      const z = bounds.minZ + row * RESOLUTION_M;
      // Seed each vertex from a global nearest so a row-scan hint cannot stick to the wrong loop.
      const seed = track.nearestIndexGlobal(probe.set(x, 0, z));
      const h = terrainHeightAt(track, x, z, seed);
      positions[p++] = x;
      positions[p++] = h.y;
      positions[p++] = z;
      uvs[u++] = x / 4000;
      uvs[u++] = z / 4000;
    }
  }
  // Protect every loop's corridor from the blur, then smooth hills, then carve (incl. grid pad)
  // so triangle interpolation cannot rise above the road between a flat corridor vertex and a hill.
  stampCorridors(positions, blurMask, track, bounds, cols, rows, BLUR_MARGIN_M, false);
  blurHeights(positions, blurMask, cols, rows);
  stampCorridors(positions, null, track, bounds, cols, rows, GRID_CARVE_PAD_M, true);
  const indices: number[] = [];
  const stride = cols + 1;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const a = row * stride + col;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new MeshStandardMaterial({ map: textures.terrainVariation, roughness: 1 });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'terrain';
  mesh.receiveShadow = true;
  return { mesh, disposables: { geometries: [geometry], materials: [material], textures: [] } };
}
