import { Mesh, MeshStandardMaterial } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Track } from '../../../track/Track';
import { buildRibbon, edgePoint, type RibbonVertex } from '../geometryUtils';
import type { Disposables } from '../types';

const LINE_WIDTH = 0.15;
const LIFT = 0.01;

/** 15cm white lines hugging the inside of both road edges. */
export function buildEdgeLines(track: Track): { mesh: Mesh; disposables: Disposables } {
  const leftOuter: RibbonVertex[] = [];
  const leftInner: RibbonVertex[] = [];
  const rightInner: RibbonVertex[] = [];
  const rightOuter: RibbonVertex[] = [];
  for (let i = 0; i < track.n; i++) {
    const half = track.widths[i] * 0.5;
    leftOuter.push({ pos: edgePoint(track, i, -half, LIFT), v: 0 });
    leftInner.push({ pos: edgePoint(track, i, -half + LINE_WIDTH, LIFT), v: 1 });
    rightInner.push({ pos: edgePoint(track, i, half - LINE_WIDTH, LIFT), v: 0 });
    rightOuter.push({ pos: edgePoint(track, i, half, LIFT), v: 1 });
  }
  const left = buildRibbon(leftOuter, leftInner, true, false);
  const right = buildRibbon(rightInner, rightOuter, true, false);
  const merged = mergeGeometries([left, right], false);
  left.dispose();
  right.dispose();
  const material = new MeshStandardMaterial({
    color: 0xf2f2f2,
    roughness: 0.6,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new Mesh(merged, material);
  mesh.name = 'edge-lines';
  return { mesh, disposables: { geometries: [merged], materials: [material], textures: [] } };
}
