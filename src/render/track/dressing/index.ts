import { Box3, Group, Vector3 } from 'three';
import type { Track } from '../../../track/Track';
import { mergeDisposables, newDisposables, type Disposables } from '../types';
import type { TrackSceneOptions } from '../types';
import type { DressingContext, Landmark, Region } from './types';
import { getSpec } from './specs';
import { buildGrandstand } from './builders/grandstand';
import { buildPitComplex } from './builders/pitComplex';
import { buildPaddock } from './builders/paddock';
import { buildFerrisWheel } from './builders/ferrisWheel';
import { buildBullStatue } from './builders/bullStatue';
import { buildMountainCone, buildRidgeLine, buildRollingHills } from './builders/mountain';
import { buildCitySkyline } from './builders/citySkyline';
import { buildBridge } from './builders/bridge';
import { buildMarshalPost } from './builders/marshalPost';
import { buildCameraTower } from './builders/cameraTower';
import { buildApexBoard, buildAdBoardRun, buildFlagRow } from './builders/signage';
import { buildHelipad, buildCarPark } from './builders/helipadCarpark';
import { buildForestBelt } from './builders/forestBelt';
import { buildGravelTrap } from './builders/gravelTrap';

export interface DressingBuild {
  group: Group;
  disposables: Disposables;
}

/** Builds the per-track "dressing": grandstands, buildings, landmarks, backdrops and signage, from a declarative spec. */
/** True when a landmark's footprint centre lies inside any part of the track corridor. */
function intrudesCorridor(track: Track, group: Group): boolean {
  const box = new Box3().setFromObject(group);
  if (box.isEmpty()) return false;
  const c = box.getCenter(new Vector3());
  const q = track.query(c, null);
  const half = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * 0.5;
  return Math.abs(q.lateral) < track.barrierDistance(q.index) + 2 && half < 60;
}

export function buildDressing(track: Track, options: TrackSceneOptions): DressingBuild {
  const group = new Group();
  group.name = 'dressing';
  const disposables = newDisposables();
  const spec = getSpec(track.id);
  if (!spec) return { group, disposables };

  const ctx: DressingContext = { track, options };
  const rot = spec.startRotationM ?? 0;
  const L = track.length;
  // entries near the start line follow the pit straight; everything else stays at its real place
  const shift = (s: number): number =>
    Math.abs(s) <= 300 || rot === 0 ? s : (((s - rot) % L) + L) % L;
  for (const raw of spec.landmarks) {
    const landmark = { ...raw, s: shift(raw.s) };
    const built = buildLandmark(ctx, landmark);
    if (intrudesCorridor(track, built.group)) continue;
    group.add(built.group);
    mergeDisposables(disposables, built.disposables);
  }
  for (const rawRegion of spec.regions) {
    const startArea = Math.abs(rawRegion.sStart) <= 300 && Math.abs(rawRegion.sEnd) <= 300;
    const region = startArea
      ? rawRegion
      : { ...rawRegion, sStart: shift(rawRegion.sStart), sEnd: shift(rawRegion.sEnd) };
    const built = buildRegion(ctx, region);
    group.add(built.group);
    mergeDisposables(disposables, built.disposables);
  }
  return { group, disposables };
}

function buildLandmark(ctx: DressingContext, landmark: Landmark): DressingBuild {
  switch (landmark.kind) {
    case 'grandstand':
      return buildGrandstand(ctx, landmark);
    case 'pitComplex':
      return buildPitComplex(ctx, landmark);
    case 'paddock':
      return buildPaddock(ctx, landmark);
    case 'ferrisWheel':
      return buildFerrisWheel(ctx, landmark);
    case 'bullStatue':
      return buildBullStatue(ctx, landmark);
    case 'mountainCone':
      return buildMountainCone(ctx, landmark);
    case 'ridgeLine':
      return buildRidgeLine(ctx, landmark);
    case 'rollingHills':
      return buildRollingHills(ctx, landmark);
    case 'citySkyline':
      return buildCitySkyline(ctx, landmark);
    case 'bridge':
      return buildBridge(ctx, landmark);
    case 'marshalPost':
      return buildMarshalPost(ctx, landmark);
    case 'cameraTower':
      return buildCameraTower(ctx, landmark);
    case 'apexBoard':
      return buildApexBoard(ctx, landmark);
    case 'helipad':
      return buildHelipad(ctx, landmark);
    case 'carPark':
      return buildCarPark(ctx, landmark);
    default:
      return assertNever(landmark);
  }
}

function buildRegion(ctx: DressingContext, region: Region): DressingBuild {
  switch (region.kind) {
    case 'forestBelt':
      return buildForestBelt(ctx, region);
    case 'adBoardRun':
      return buildAdBoardRun(ctx, region);
    case 'flagRow':
      return buildFlagRow(ctx, region);
    case 'gravelTrap':
      return buildGravelTrap(ctx, region);
    default:
      return assertNever(region);
  }
}

function assertNever(x: never): never {
  throw new Error(`unhandled dressing kind: ${JSON.stringify(x)}`);
}
