import { DoubleSide, Mesh, MeshBasicMaterial } from 'three';
import type { RacingLine } from '../../../track/RacingLine';
import type { Track } from '../../../track/Track';
import { buildRibbon, computeArcLengths, type RibbonVertex } from '../geometryUtils';
import type { Disposables } from '../types';

const GROOVE_HALF_WIDTH = 1.1;
const LIFT = 0.006;

/** A faint dark ribbon tracing the racing line, suggesting the rubbered-in groove. */
export function buildRacingGroove(
  track: Track,
  racingLine: RacingLine,
): { mesh: Mesh; disposables: Disposables } {
  const arcLen = computeArcLengths(track);
  const lefts: RibbonVertex[] = [];
  const rights: RibbonVertex[] = [];
  for (let i = 0; i < track.n; i++) {
    const v = arcLen[i] / 8;
    const p = racingLine.points[i];
    const r = track.rights[i];
    lefts.push({
      pos: p
        .clone()
        .addScaledVector(r, -GROOVE_HALF_WIDTH)
        .setY(p.y + LIFT),
      v,
    });
    rights.push({
      pos: p
        .clone()
        .addScaledVector(r, GROOVE_HALF_WIDTH)
        .setY(p.y + LIFT),
      v,
    });
  }
  const geometry = buildRibbon(lefts, rights, true, false);
  const material = new MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'racing-groove';
  return { mesh, disposables: { geometries: [geometry], materials: [material], textures: [] } };
}
