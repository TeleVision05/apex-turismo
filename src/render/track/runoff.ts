import { BufferGeometry, DoubleSide, Mesh, MeshStandardMaterial } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CURB_WIDTH } from '../../track/Track';
import type { Track } from '../../track/Track';
import { computeCurbSides } from './curbs';
import {
  buildRibbon,
  computeArcLengths,
  edgePoint,
  findRuns,
  type RibbonVertex,
} from './geometryUtils';
import type { TextureSet } from './textures';
import type { Disposables } from './types';

const GRAVEL_THRESHOLD = 0.012;
const TILE_M = 6;

interface SideRunoffPlan {
  gravelActive: boolean[];
  grassActive: boolean[];
  curb: boolean[];
}

function planSide(track: Track, curb: boolean[], gravelWhenPositive: boolean): SideRunoffPlan {
  const gravelActive: boolean[] = [];
  const grassActive: boolean[] = [];
  for (let i = 0; i < track.n; i++) {
    const k = track.curvatures[i];
    const gravel = gravelWhenPositive ? k > GRAVEL_THRESHOLD : k < -GRAVEL_THRESHOLD;
    gravelActive.push(gravel);
    grassActive.push(!gravel);
  }
  return { gravelActive, grassActive, curb };
}

function buildRuns(
  track: Track,
  arcLen: Float32Array,
  active: boolean[],
  curb: boolean[],
  sign: 1 | -1,
): BufferGeometry[] {
  const runs = findRuns(active);
  const geometries: BufferGeometry[] = [];
  for (const run of runs) {
    if (run.length < 2) continue;
    const inner: RibbonVertex[] = [];
    const outer: RibbonVertex[] = [];
    for (const i of run) {
      const half = track.widths[i] * 0.5;
      const innerLateral = curb[i] ? half + CURB_WIDTH : half;
      const outerLateral = track.barrierDistance(i);
      const v = arcLen[i] / TILE_M;
      inner.push({ pos: edgePoint(track, i, sign * innerLateral), v });
      outer.push({ pos: edgePoint(track, i, sign * outerLateral), v });
    }
    geometries.push(
      sign === -1 ? buildRibbon(outer, inner, false) : buildRibbon(inner, outer, false),
    );
  }
  return geometries;
}

/** Grass (and gravel on corner exteriors) run-off between the road/curb edge and the barrier. */
export function buildRunoff(
  track: Track,
  textures: TextureSet,
): { meshes: Mesh[]; disposables: Disposables } {
  const { left: leftCurb, right: rightCurb } = computeCurbSides(track);
  const arcLen = computeArcLengths(track);
  const leftPlan = planSide(track, leftCurb, true);
  const rightPlan = planSide(track, rightCurb, false);

  const grassParts = [
    ...buildRuns(track, arcLen, leftPlan.grassActive, leftCurb, -1),
    ...buildRuns(track, arcLen, rightPlan.grassActive, rightCurb, 1),
  ];
  const gravelParts = [
    ...buildRuns(track, arcLen, leftPlan.gravelActive, leftCurb, -1),
    ...buildRuns(track, arcLen, rightPlan.gravelActive, rightCurb, 1),
  ];

  const meshes: Mesh[] = [];
  const disposables: Disposables = { geometries: [], materials: [], textures: [] };

  if (grassParts.length) {
    const geometry = mergeGeometries(grassParts, false);
    for (const g of grassParts) g.dispose();
    const material = new MeshStandardMaterial({
      map: textures.grass,
      roughness: 1,
      side: DoubleSide,
    });
    const mesh = new Mesh(geometry, material);
    mesh.name = 'runoff-grass';
    mesh.receiveShadow = true;
    meshes.push(mesh);
    disposables.geometries.push(geometry);
    disposables.materials.push(material);
  }
  if (gravelParts.length) {
    const geometry = mergeGeometries(gravelParts, false);
    for (const g of gravelParts) g.dispose();
    const material = new MeshStandardMaterial({
      map: textures.gravel,
      roughness: 1,
      side: DoubleSide,
    });
    const mesh = new Mesh(geometry, material);
    mesh.name = 'runoff-gravel';
    mesh.receiveShadow = true;
    meshes.push(mesh);
    disposables.geometries.push(geometry);
    disposables.materials.push(material);
  }
  return { meshes, disposables };
}
