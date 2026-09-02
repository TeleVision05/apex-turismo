import {
  BoxGeometry,
  BufferGeometry,
  DoubleSide,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Track } from '../../../track/Track';
import {
  buildRibbon,
  computeArcLengths,
  edgePoint,
  findRuns,
  outsideCornerSides,
  type RibbonVertex,
} from '../geometryUtils';
import type { TextureSet } from '../textures';
import type { Disposables } from '../types';

const THRESHOLD = 0.01;
const HEIGHT = 3;
const SET_BACK_M = 1.2; // behind the Armco, away from the track
const POST_SPACING_M = 5;

function buildMeshRuns(
  track: Track,
  active: boolean[],
  sign: 1 | -1,
  arcLen: Float32Array,
): BufferGeometry[] {
  const geometries: BufferGeometry[] = [];
  for (const run of findRuns(active)) {
    if (run.length < 2) continue;
    const bottoms: RibbonVertex[] = [];
    const tops: RibbonVertex[] = [];
    for (const i of run) {
      const lateral = sign * (track.barrierDistance(i) + SET_BACK_M);
      const v = arcLen[i] / 4;
      bottoms.push({ pos: edgePoint(track, i, lateral, 0), v });
      tops.push({ pos: edgePoint(track, i, lateral, HEIGHT), v });
    }
    geometries.push(buildRibbon(bottoms, tops, false));
  }
  return geometries;
}

function countPosts(track: Track, active: boolean[]): number {
  let count = 0;
  for (const run of findRuns(active))
    count += Math.max(1, Math.floor((run.length * track.spacing) / POST_SPACING_M));
  return count;
}

function placePosts(
  track: Track,
  active: boolean[],
  sign: 1 | -1,
  mesh: InstancedMesh,
  startIndex: number,
): number {
  const dummy = new Object3D();
  let instance = startIndex;
  for (const run of findRuns(active)) {
    let acc = 0;
    for (const i of run) {
      acc += track.spacing;
      if (acc < POST_SPACING_M) continue;
      acc = 0;
      const lateral = sign * (track.barrierDistance(i) + SET_BACK_M);
      const p = edgePoint(track, i, lateral, HEIGHT / 2);
      dummy.position.copy(p);
      dummy.updateMatrix();
      mesh.setMatrixAt(instance++, dummy.matrix);
    }
  }
  return instance;
}

/** A semi-transparent catch fence with thin posts, behind the barrier on fast corner exteriors. */
export function buildCatchFence(
  track: Track,
  textures: TextureSet,
): { group: Mesh[]; posts: InstancedMesh | null; disposables: Disposables } {
  const { left, right } = outsideCornerSides(track, THRESHOLD);
  const arcLen = computeArcLengths(track);
  const meshParts = [
    ...buildMeshRuns(track, left, -1, arcLen),
    ...buildMeshRuns(track, right, 1, arcLen),
  ];
  const disposables: Disposables = { geometries: [], materials: [], textures: [] };
  const meshes: Mesh[] = [];
  if (meshParts.length) {
    const geometry = mergeGeometries(meshParts, false);
    for (const g of meshParts) g.dispose();
    const material = new MeshStandardMaterial({
      map: textures.catchFence,
      transparent: true,
      opacity: 0.85,
      side: DoubleSide,
      roughness: 0.9,
    });
    const mesh = new Mesh(geometry, material);
    mesh.name = 'catch-fence';
    meshes.push(mesh);
    disposables.geometries.push(geometry);
    disposables.materials.push(material);
  }
  const postCount = countPosts(track, left) + countPosts(track, right);
  let posts: InstancedMesh | null = null;
  if (postCount > 0) {
    const postGeometry = new BoxGeometry(0.06, HEIGHT, 0.06);
    const postMaterial = new MeshStandardMaterial({ color: 0x555555, roughness: 0.8 });
    posts = new InstancedMesh(postGeometry, postMaterial, postCount);
    posts.name = 'catch-fence-posts';
    const used = placePosts(track, left, -1, posts, 0);
    placePosts(track, right, 1, posts, used);
    posts.count = postCount;
    posts.instanceMatrix.needsUpdate = true;
    disposables.geometries.push(postGeometry);
    disposables.materials.push(postMaterial);
  }
  return { group: meshes, posts, disposables };
}
