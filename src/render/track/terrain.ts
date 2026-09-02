import { BufferGeometry, Float32BufferAttribute, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { BRIDGE_HEIGHT, type Track } from '../../track/Track';
import { wrapIndex } from '../../core/math';
import { fbm } from './textures';
import type { TextureSet } from './textures';
import type { Disposables } from './types';

const MARGIN_M = 500;
/** Grid step; kept uniform since even the largest track stays well under the ~600k vertex budget at this step. */
const RESOLUTION_M = 5;
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
 * the road surface.
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

/** Height + local track-relative info at an arbitrary world (x,z), via Track's own spatial hash (not O(n^2)). */
export function terrainHeightAt(
  track: Track,
  x: number,
  z: number,
  hint: number,
): { y: number; hint: number } {
  const probe = new Vector3(x, 0, z);
  const q = track.query(probe, hint);
  probe.y = q.height;
  // Re-query at the first-guess height: this biases the match toward the LOWER road at bridge
  // crossovers (whose deck sits ~BRIDGE_HEIGHT above the point (x, 0, z) would otherwise land near).
  const q2 = track.query(probe, q.index);
  const minRoad = minRoadHeightNear(track, x, z, q2.index);
  const corridorHalfWidth = track.barrierDistance(q2.index) + CORRIDOR_MARGIN_M;
  const distBeyondCorridor = Math.max(0, Math.abs(q2.lateral) - corridorHalfWidth);
  const hillNoise = fbm(x / 400, z / 400, 91, 5) * 2 - 1;
  const hillY = minRoad + hillNoise * HILL_AMPLITUDE;
  const t = smoothstep(0, HILL_BLEND_M, distBeyondCorridor);
  const y = lerp(minRoad - RUNOFF_DROP, hillY, t);
  return { y, hint: q2.index };
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

/** A heightfield grid over the track bounds + margin, following track height near the road and rolling hills further out. */
export function buildTerrain(track: Track, textures: TextureSet): TerrainBuild {
  const bounds = computeBounds(track);
  const cols = Math.max(2, Math.ceil((bounds.maxX - bounds.minX) / RESOLUTION_M));
  const rows = Math.max(2, Math.ceil((bounds.maxZ - bounds.minZ) / RESOLUTION_M));
  const positions = new Float32Array((cols + 1) * (rows + 1) * 3);
  const uvs = new Float32Array((cols + 1) * (rows + 1) * 2);
  let hint = 0;
  let p = 0;
  let u = 0;
  for (let row = 0; row <= rows; row++) {
    for (let col = 0; col <= cols; col++) {
      const x = bounds.minX + col * RESOLUTION_M;
      const z = bounds.minZ + row * RESOLUTION_M;
      const h = terrainHeightAt(track, x, z, hint);
      hint = h.hint;
      positions[p++] = x;
      positions[p++] = h.y;
      positions[p++] = z;
      uvs[u++] = x / 4000;
      uvs[u++] = z / 4000;
    }
  }
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
