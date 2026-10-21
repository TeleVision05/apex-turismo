import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
} from 'three';
import { frameAtS, yawLookAt } from '../../furniture/common';
import { canvasTextTexture } from '../../textures';
import type { Disposables } from '../../types';
import type { AdBoardRunRegion, ApexBoardSpec, DressingContext, FlagRowRegion } from '../types';
import { STRIPE_COLORS, pick } from './palette';
import { landmarkFrame, newGroup, orientAt } from './shared';

const MIN_CLEARANCE_M = 4;

/** A large "APEX" board, the trackside equivalent of a sponsor board. */
export function buildApexBoard(
  ctx: DressingContext,
  spec: ApexBoardSpec,
): { group: Group; disposables: Disposables } {
  const group = newGroup('dressing-apex-board');
  const pf = landmarkFrame(ctx.track, spec.s, spec.side, spec.distance);
  const geo = new BoxGeometry(4.5, 1.6, 0.08);
  const texture = canvasTextTexture('APEX', {
    width: 720,
    height: 256,
    bg: '#101418',
    fg: '#ffffff',
    fontPx: 150,
  });
  const mat = new MeshStandardMaterial({ map: texture, side: DoubleSide, roughness: 0.6 });
  const board = new Mesh(geo, mat);
  board.castShadow = true;
  orientAt(board, pf, 2.4, spec.rotationDeg);
  group.add(board);
  return { group, disposables: { geometries: [geo], materials: [mat], textures: [texture] } };
}

/** A run of plain colour-striped advertising boards along the barrier (no real sponsor branding). */
export function buildAdBoardRun(
  ctx: DressingContext,
  region: AdBoardRunRegion,
): { group: Group; disposables: Disposables } {
  const group = newGroup('dressing-ad-board-run');
  const { track } = ctx;
  const sides: ('left' | 'right')[] = region.side === 'both' ? ['left', 'right'] : [region.side];
  const runLength = positiveRunLength(track.deltaS(region.sStart, region.sEnd), track.length);
  const perSide = Math.max(1, Math.floor(runLength / region.spacing));

  const geo = new BoxGeometry(1.9, 0.9, 0.06);
  const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
  const boards = new InstancedMesh(geo, mat, perSide * sides.length);
  const dummy = new Object3D();
  let i = 0;
  for (const side of sides) {
    for (let k = 0; k < perSide; k++) {
      const s = region.sStart + k * region.spacing;
      const frame = frameAtS(track, s);
      const sign = side === 'right' ? 1 : -1;
      const lateral =
        sign * (track.barrierDistance(frame.index) + Math.max(MIN_CLEARANCE_M, region.distance));
      dummy.position.set(
        frame.point.x + frame.right.x * lateral,
        frame.point.y + 0.6,
        frame.point.z + frame.right.z * lateral,
      );
      yawLookAt(dummy, dummy.position, frame.forward);
      dummy.updateMatrix();
      boards.setMatrixAt(i, dummy.matrix);
      boards.setColorAt(
        i,
        new Color(pick(region.colors.length ? region.colors : STRIPE_COLORS, i)),
      );
      i++;
    }
  }
  boards.instanceMatrix.needsUpdate = true;
  if (boards.instanceColor) boards.instanceColor.needsUpdate = true;
  group.add(boards);

  return { group, disposables: { geometries: [geo], materials: [mat], textures: [] } };
}

/** A row of evenly spaced flag poles with plain-coloured flags, e.g. lining the pit straight. */
export function buildFlagRow(
  ctx: DressingContext,
  region: FlagRowRegion,
): { group: Group; disposables: Disposables } {
  const group = newGroup('dressing-flag-row');
  const { track } = ctx;
  const sides: ('left' | 'right')[] = region.side === 'both' ? ['left', 'right'] : [region.side];
  const runLength = positiveRunLength(track.deltaS(region.sStart, region.sEnd), track.length);
  const perSide = Math.max(1, Math.floor(runLength / region.spacing));

  const poleGeo = new CylinderGeometry(0.045, 0.045, 4.6, 6);
  const poleMat = new MeshStandardMaterial({ color: 0xcfcfcf, roughness: 0.6, metalness: 0.3 });
  const poles = new InstancedMesh(poleGeo, poleMat, perSide * sides.length);
  const flagGeo = new PlaneGeometry(1.1, 0.7);
  const flagMat = new MeshStandardMaterial({
    vertexColors: true,
    side: DoubleSide,
    roughness: 0.8,
  });
  const flags = new InstancedMesh(flagGeo, flagMat, perSide * sides.length);
  const dummy = new Object3D();
  let i = 0;
  for (const side of sides) {
    for (let k = 0; k < perSide; k++) {
      const s = region.sStart + k * region.spacing;
      const frame = frameAtS(track, s);
      const sign = side === 'right' ? 1 : -1;
      const lateral =
        sign * (track.barrierDistance(frame.index) + Math.max(MIN_CLEARANCE_M, region.distance));
      const base = frame.point.clone().addScaledVector(frame.right, lateral);
      dummy.position.set(base.x, base.y + 2.3, base.z);
      dummy.updateMatrix();
      poles.setMatrixAt(i, dummy.matrix);
      dummy.position.set(base.x, base.y + 4, base.z);
      yawLookAt(dummy, dummy.position, frame.forward);
      dummy.updateMatrix();
      flags.setMatrixAt(i, dummy.matrix);
      flags.setColorAt(i, new Color(pick(STRIPE_COLORS, i)));
      i++;
    }
  }
  poles.instanceMatrix.needsUpdate = true;
  flags.instanceMatrix.needsUpdate = true;
  if (flags.instanceColor) flags.instanceColor.needsUpdate = true;
  group.add(poles, flags);

  return {
    group,
    disposables: { geometries: [poleGeo, flagGeo], materials: [poleMat, flagMat], textures: [] },
  };
}

function positiveRunLength(delta: number, trackLength: number): number {
  return delta >= 0 ? delta : delta + trackLength;
}
