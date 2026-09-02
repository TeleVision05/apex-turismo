import { AdditiveBlending, DoubleSide, Mesh, MeshBasicMaterial } from 'three';
import type { RacingLine } from '../../track/RacingLine';
import type { Track } from '../../track/Track';
import { buildRibbon, computeArcLengths, type RibbonVertex } from './geometryUtils';
import type { Disposables } from './types';

const HALF_WIDTH = 0.3;
const LIFT = 0.04;
const LOOKAHEAD_SAMPLES = 6;

/** red = braking ahead, yellow = steady, cyan = accelerating ahead. */
function speedColor(racingLine: RacingLine, i: number): [number, number, number] {
  const n = racingLine.points.length;
  const ahead = racingLine.speed[(i + LOOKAHEAD_SAMPLES) % n];
  const now = racingLine.speed[i];
  const delta = ahead - now;
  if (delta < -1) return [0.9, 0.1, 0.1];
  if (delta > 1) return [0.2, 0.85, 0.95];
  return [0.9, 0.85, 0.15];
}

/** A 0.6m ribbon along the racing line, coloured by the speed profile, hidden by default. */
export function buildRacingLineRibbon(
  track: Track,
  racingLine: RacingLine,
): { mesh: Mesh; disposables: Disposables } {
  const arcLen = computeArcLengths(track);
  const lefts: RibbonVertex[] = [];
  const rights: RibbonVertex[] = [];
  for (let i = 0; i < racingLine.points.length; i++) {
    const p = racingLine.points[i];
    const r = track.rights[i];
    const v = arcLen[i] / 8;
    const color = speedColor(racingLine, i);
    lefts.push({
      pos: p
        .clone()
        .addScaledVector(r, -HALF_WIDTH)
        .setY(p.y + LIFT),
      v,
      color,
    });
    rights.push({
      pos: p
        .clone()
        .addScaledVector(r, HALF_WIDTH)
        .setY(p.y + LIFT),
      v,
      color,
    });
  }
  const geometry = buildRibbon(lefts, rights, true, true);
  const material = new MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.75,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'racing-line';
  mesh.visible = false;
  return { mesh, disposables: { geometries: [geometry], materials: [material], textures: [] } };
}
