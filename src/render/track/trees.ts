import {
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
  Vector3,
} from 'three';
import type { Track } from '../../track/Track';
import { makeRng } from '../../core/math';
import { terrainHeightAt } from './terrain';
import type { Disposables } from './types';

const MIN_DISTANCE_M = 28;
const FIELD_MARGIN_M = 220;
const CLUSTER_COUNT = 14;
const CLUSTER_RADIUS = 90;
const SEED = 0x7e35a1;

interface Placement {
  x: number;
  z: number;
  variant: 0 | 1;
  scale: number;
  hint: number;
}

interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function trackBounds(track: Track): Bounds {
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
    minX: minX - FIELD_MARGIN_M,
    maxX: maxX + FIELD_MARGIN_M,
    minZ: minZ - FIELD_MARGIN_M,
    maxZ: maxZ + FIELD_MARGIN_M,
  };
}

function generatePlacements(track: Track, count: number): Placement[] {
  const rng = makeRng(SEED);
  const b = trackBounds(track);
  const clusters = Array.from({ length: CLUSTER_COUNT }, () => ({
    x: b.minX + rng() * (b.maxX - b.minX),
    z: b.minZ + rng() * (b.maxZ - b.minZ),
  }));
  const placements: Placement[] = [];
  const probe = new Vector3();
  let hint = 0;
  let attempts = 0;
  while (placements.length < count && attempts < count * 6) {
    attempts++;
    let x: number;
    let z: number;
    if (rng() < 0.7) {
      const c = clusters[Math.floor(rng() * clusters.length)];
      x = c.x + (rng() - 0.5) * CLUSTER_RADIUS * 2;
      z = c.z + (rng() - 0.5) * CLUSTER_RADIUS * 2;
    } else {
      x = b.minX + rng() * (b.maxX - b.minX);
      z = b.minZ + rng() * (b.maxZ - b.minZ);
    }
    probe.set(x, 0, z);
    const q = track.query(probe, hint);
    hint = q.index;
    if (Math.abs(q.lateral) < MIN_DISTANCE_M) continue;
    placements.push({ x, z, variant: rng() < 0.5 ? 0 : 1, scale: 0.75 + rng() * 0.6, hint });
  }
  return placements;
}

interface TreeMaterials {
  trunk: MeshStandardMaterial;
  canopyA: MeshStandardMaterial;
  canopyB: MeshStandardMaterial;
}

function makeTreeMaterials(): TreeMaterials {
  return {
    trunk: new MeshStandardMaterial({ color: 0x5b4632, roughness: 1 }),
    canopyA: new MeshStandardMaterial({ color: 0x2f6b34, roughness: 0.95 }),
    canopyB: new MeshStandardMaterial({ color: 0x3c7a3f, roughness: 0.95 }),
  };
}

function placeInstances(
  track: Track,
  placements: Placement[],
  trunks: InstancedMesh,
  canopiesA: InstancedMesh,
  canopiesB: InstancedMesh,
): void {
  const dummy = new Object3D();
  const rng = makeRng(SEED ^ 0x1234);
  let a = 0;
  let b = 0;
  placements.forEach((pl, i) => {
    const y = terrainHeightAt(track, pl.x, pl.z, pl.hint).y;
    dummy.position.set(pl.x, y + 1.1 * pl.scale, pl.z);
    dummy.rotation.set(0, rng() * Math.PI * 2, 0);
    dummy.scale.setScalar(pl.scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    trunks.setColorAt(i, new Color().setHSL(0.08, 0.3, 0.25 + rng() * 0.05));
    const target = pl.variant === 0 ? canopiesA : canopiesB;
    const idx = pl.variant === 0 ? a++ : b++;
    dummy.position.set(pl.x, y + (2.2 + 1.4) * pl.scale, pl.z);
    dummy.updateMatrix();
    target.setMatrixAt(idx, dummy.matrix);
    target.setColorAt(idx, new Color().setHSL(0.32 + rng() * 0.05, 0.4, 0.28 + rng() * 0.08));
  });
  canopiesA.count = a;
  canopiesB.count = b;
  for (const m of [trunks, canopiesA, canopiesB]) {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }
}

/** Low-poly instanced trees (trunk + stacked cones, 2 variants) scattered off the track on the terrain. */
export function buildTrees(
  track: Track,
  count: number,
): { group: Group; disposables: Disposables } {
  const group = new Group();
  group.name = 'trees';
  const placements = generatePlacements(track, count);
  const trunkGeo = new CylinderGeometry(0.18, 0.24, 2.2, 6);
  const canopyGeoA = new ConeGeometry(1.6, 3.2, 7);
  const canopyGeoB = new ConeGeometry(1.3, 2.6, 7);
  const mats = makeTreeMaterials();

  const trunks = new InstancedMesh(trunkGeo, mats.trunk, placements.length);
  const canopiesA = new InstancedMesh(canopyGeoA, mats.canopyA, placements.length);
  const canopiesB = new InstancedMesh(canopyGeoB, mats.canopyB, placements.length);
  trunks.castShadow = true;
  canopiesA.castShadow = true;
  canopiesB.castShadow = true;
  trunks.receiveShadow = true;

  placeInstances(track, placements, trunks, canopiesA, canopiesB);

  group.add(trunks, canopiesA, canopiesB);
  return {
    group,
    disposables: {
      geometries: [trunkGeo, canopyGeoA, canopyGeoB],
      materials: [mats.trunk, mats.canopyA, mats.canopyB],
      textures: [],
    },
  };
}
