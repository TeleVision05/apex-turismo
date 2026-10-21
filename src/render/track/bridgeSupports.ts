import {
  BoxGeometry,
  BufferGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BRIDGE_HEIGHT, type Track } from '../../track/Track';
import { buildRibbon, edgePoint, findRuns, type RibbonVertex } from './geometryUtils';
import type { Disposables } from './types';

const PILLAR_SPACING_M = 20;
const PARAPET_HEIGHT = 0.8;
const PARAPET_THICKNESS = 0.15;

function groundHeightUnder(track: Track, i: number): number {
  return track.points[i].y - BRIDGE_HEIGHT;
}

function buildParapetSide(track: Track, run: number[], sign: 1 | -1): BufferGeometry {
  const bottoms: RibbonVertex[] = [];
  const tops: RibbonVertex[] = [];
  for (const i of run) {
    const lateral = sign * (track.widths[i] * 0.5 + PARAPET_THICKNESS);
    bottoms.push({ pos: edgePoint(track, i, lateral, -0.05), v: 0 });
    tops.push({ pos: edgePoint(track, i, lateral, PARAPET_HEIGHT), v: 1 });
  }
  return buildRibbon(bottoms, tops, false);
}

function countPillars(track: Track, run: number[]): number {
  return Math.max(1, Math.floor((run.length * track.spacing) / PILLAR_SPACING_M));
}

/** Concrete pillars and low parapets under/along bridge sections (track.bridge[i]). */
export function buildBridgeSupports(track: Track): { group: Group; disposables: Disposables } {
  const group = new Group();
  group.name = 'bridge-supports';
  const active = Array.from(track.bridge, (b) => b === 1);
  const runs = findRuns(active).filter((r) => r.length > 1);
  const disposables: Disposables = { geometries: [], materials: [], textures: [] };
  if (runs.length === 0) return { group, disposables };

  const parapetParts: BufferGeometry[] = [];
  let totalPillars = 0;
  for (const run of runs) {
    parapetParts.push(buildParapetSide(track, run, -1), buildParapetSide(track, run, 1));
    totalPillars += countPillars(track, run);
  }
  const parapetGeometry = mergeGeometries(parapetParts, false);
  for (const g of parapetParts) g.dispose();
  const parapetMaterial = new MeshStandardMaterial({ color: 0xb8b4ad, roughness: 0.9 });
  const parapet = new Mesh(parapetGeometry, parapetMaterial);
  parapet.name = 'bridge-parapet';
  parapet.castShadow = true;
  parapet.receiveShadow = true;
  group.add(parapet);
  disposables.geometries.push(parapetGeometry);
  disposables.materials.push(parapetMaterial);

  const pillarGeometry = new BoxGeometry(1.1, 1, 1.1);
  const pillarMaterial = new MeshStandardMaterial({ color: 0x9a968e, roughness: 0.95 });
  // Two legs per station (left + right of the deck).
  const pillars = new InstancedMesh(pillarGeometry, pillarMaterial, Math.max(2, totalPillars * 2));
  pillars.name = 'bridge-pillars';
  pillars.castShadow = true;
  pillars.receiveShadow = true;
  placePillars(track, runs, pillars);
  group.add(pillars);
  disposables.geometries.push(pillarGeometry);
  disposables.materials.push(pillarMaterial);

  return { group, disposables };
}

function placePillars(track: Track, runs: number[][], pillars: InstancedMesh): void {
  const dummy = new Object3D();
  let instance = 0;
  for (const run of runs) {
    let acc = 0;
    for (const i of run) {
      acc += track.spacing;
      if (acc < PILLAR_SPACING_M) continue;
      acc = 0;
      const top = track.points[i].y - 0.3;
      const ground = groundHeightUnder(track, i);
      const height = Math.max(1, top - ground);
      // Legs sit outside the barriers, never on the driving line.
      const offset = track.barrierDistance(i) + 1.5;
      for (const sign of [-1, 1] as const) {
        const p = track.points[i];
        const r = track.rights[i];
        dummy.position.set(
          p.x + r.x * sign * offset,
          ground + height / 2,
          p.z + r.z * sign * offset,
        );
        dummy.scale.set(1, height, 1);
        dummy.updateMatrix();
        pillars.setMatrixAt(instance++, dummy.matrix);
      }
    }
  }
  pillars.count = instance;
  pillars.instanceMatrix.needsUpdate = true;
}
