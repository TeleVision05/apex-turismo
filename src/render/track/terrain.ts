import { BufferGeometry, Float32BufferAttribute, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { BRIDGE_HEIGHT, type Track } from '../../track/Track';
import { fbm } from './textures';
import type { TextureSet } from './textures';
import type { Disposables } from './types';

const MARGIN_M = 500;
const RESOLUTION_M = 10;
const HILL_AMPLITUDE = 25;
const RUNOFF_DROP = 0.4;
const HILL_FADE_M = 60;

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
  const q2 = track.query(probe, q.index);
  let trackY = q2.height;
  if (track.bridge[q2.index]) trackY -= BRIDGE_HEIGHT;
  const distBeyondEdge = Math.max(0, Math.abs(q2.lateral) - track.barrierDistance(q2.index));
  const hillNoise = fbm(x / 400, z / 400, 91, 5) * 2 - 1;
  const hillY = trackY + hillNoise * HILL_AMPLITUDE;
  const t = smoothstep(0, HILL_FADE_M, distBeyondEdge);
  const y = lerp(trackY - RUNOFF_DROP, hillY, t);
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
