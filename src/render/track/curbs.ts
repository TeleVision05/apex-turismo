import { BufferGeometry, DoubleSide, Mesh, MeshStandardMaterial } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CURB_WIDTH } from '../../track/Track';
import type { Track } from '../../track/Track';
import { buildRibbon, edgePoint, findRuns, type RibbonVertex } from './geometryUtils';
import type { Disposables } from './types';

const CURVATURE_THRESHOLD = 0.004;
const EXIT_EXTENSION_SAMPLES = 8;
const CURB_RAISE = 0.03;
const BLOCK_LENGTH_M = 2;
const RED: [number, number, number] = [0.75, 0.08, 0.08];
const WHITE: [number, number, number] = [0.92, 0.92, 0.92];

/** true on the inside of a corner (curvature over threshold), left=negative curvature, right=positive. */
export function computeCurbSides(track: Track): { left: boolean[]; right: boolean[] } {
  const left = new Array<boolean>(track.n).fill(false);
  const right = new Array<boolean>(track.n).fill(false);
  const inCorner = new Array<boolean>(track.n).fill(false);
  for (let i = 0; i < track.n; i++) {
    const k = track.curvatures[i];
    inCorner[i] = Math.abs(k) > CURVATURE_THRESHOLD;
    if (k > CURVATURE_THRESHOLD) right[i] = true;
    else if (k < -CURVATURE_THRESHOLD) left[i] = true;
  }
  extendExits(track, inCorner, left, right);
  return { left, right };
}

/** At each corner exit, marks the OUTSIDE edge for a few extra samples. */
function extendExits(track: Track, inCorner: boolean[], left: boolean[], right: boolean[]): void {
  const n = track.n;
  for (let i = 0; i < n; i++) {
    const prev = (i - 1 + n) % n;
    if (!(inCorner[prev] && !inCorner[i])) continue;
    const outsideIsLeft = right[prev]; // was turning right => inside was right => outside is left
    for (let k = 0; k < EXIT_EXTENSION_SAMPLES; k++) {
      const idx = (i + k) % n;
      if (inCorner[idx]) break;
      if (outsideIsLeft) left[idx] = true;
      else right[idx] = true;
    }
  }
}

function buildSideGeometry(track: Track, active: boolean[], onLeft: boolean): BufferGeometry[] {
  const runs = findRuns(active);
  const geometries: BufferGeometry[] = [];
  // A colour block spans at least one sample: with samples coarser than BLOCK_LENGTH_M
  // (e.g. Suzuka's 4m spacing vs. a 2m block), rounding down to zero would make every
  // sample land on the same even block and the curb would render as a solid colour.
  const blockSamples = Math.max(1, Math.round(BLOCK_LENGTH_M / track.spacing));
  for (const run of runs) {
    if (run.length < 2) continue;
    const inner: RibbonVertex[] = [];
    const outer: RibbonVertex[] = [];
    for (const i of run) {
      const half = track.widths[i] * 0.5;
      const block = Math.floor(i / blockSamples) % 2;
      const color = block === 0 ? RED : WHITE;
      const raise = block === 0 ? CURB_RAISE : 0;
      const sign = onLeft ? -1 : 1;
      inner.push({ pos: edgePoint(track, i, sign * half), v: 0, color });
      outer.push({ pos: edgePoint(track, i, sign * (half + CURB_WIDTH), raise), v: 1, color });
    }
    geometries.push(
      onLeft ? buildRibbon(outer, inner, false, true) : buildRibbon(inner, outer, false, true),
    );
  }
  return geometries;
}

/** Alternating red/white sawtooth curbs on the inside of corners, extended onto the outside at corner exits. */
export function buildCurbs(track: Track): { mesh: Mesh; disposables: Disposables } {
  const { left, right } = computeCurbSides(track);
  const parts = [
    ...buildSideGeometry(track, left, true),
    ...buildSideGeometry(track, right, false),
  ];
  const geometry = parts.length ? mergeGeometries(parts, false) : new BufferGeometry();
  for (const g of parts) g.dispose();
  const material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.8,
    side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'curbs';
  mesh.receiveShadow = true;
  return { mesh, disposables: { geometries: [geometry], materials: [material], textures: [] } };
}
