import { Box3, BufferAttribute, Group, Mesh, Vector3 } from 'three';
import type { Track } from '../../track/Track';
import { buildRoad } from './road';
import { buildCurbs } from './curbs';
import { buildRunoff } from './runoff';
import { buildBarriers } from './barriers';
import { buildTerrain } from './terrain';
import { buildBridgeSupports } from './bridgeSupports';
import { buildTrees } from './trees';
import { buildFurniture } from './furniture';
import { buildDressing } from './dressing';
import { buildRacingLineRibbon } from './racingLine';
import { buildMinimap } from './minimap';
import { buildTextureSet } from './textures';
import {
  mergeDisposables,
  newDisposables,
  qualityConfig,
  type Disposables,
  type TrackScene,
  type TrackSceneOptions,
} from './types';

const LOD_DISTANCE_M = 260;

export type { TrackScene, TrackSceneOptions };

interface SceneParts {
  group: Group;
  roadMeshes: Mesh[];
  racingLineMesh: Mesh | null;
  disposables: Disposables;
  setStartLights(count: number): void;
  animatedFlags: Mesh[];
  lodBoards: Mesh[];
}

function buildParts(track: Track, options: TrackSceneOptions): SceneParts {
  const quality = qualityConfig(options.quality);
  const textures = buildTextureSet(quality.textureSize);
  const disposables = newDisposables();
  mergeDisposables(disposables, { geometries: [], materials: [], textures: textures.all });

  const group = new Group();
  group.name = 'track-scene';

  const road = buildRoad(track, textures, options.racingLine);
  const curbs = buildCurbs(track);
  const runoff = buildRunoff(track, textures);
  const barriers = buildBarriers(track, textures, quality);
  const terrain = buildTerrain(track, textures);
  const bridges = buildBridgeSupports(track);
  const trees = buildTrees(track, quality.treeCount);
  const furniture = buildFurniture(track, options);
  const dressing = buildDressing(track, options);

  group.add(
    road.group,
    curbs.mesh,
    ...runoff.meshes,
    barriers.group,
    terrain.mesh,
    bridges.group,
    trees.group,
    furniture.group,
    dressing.group,
  );
  mergeDisposables(
    disposables,
    road.disposables,
    curbs.disposables,
    runoff.disposables,
    barriers.disposables,
    terrain.disposables,
    bridges.disposables,
    trees.disposables,
    furniture.disposables,
    dressing.disposables,
  );

  let racingLineMesh: Mesh | null = null;
  if (options.racingLine) {
    const built = buildRacingLineRibbon(track, options.racingLine);
    racingLineMesh = built.mesh;
    group.add(built.mesh);
    mergeDisposables(disposables, built.disposables);
  }

  return {
    group,
    roadMeshes: road.roadMeshes,
    racingLineMesh,
    disposables,
    setStartLights: furniture.setStartLights,
    animatedFlags: furniture.animatedFlags,
    lodBoards: furniture.lodBoards,
  };
}

/** Builds the full procedural visual environment for a track: road, curbs, run-off, barriers, terrain, trees and furniture. */
export function buildTrackScene(track: Track, options: TrackSceneOptions): TrackScene {
  const parts = buildParts(track, options);
  const minimap = buildMinimap(track);
  parts.group.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(parts.group);
  const flagWaves = parts.animatedFlags.map((flag) => makeFlagWave(flag));
  let clock = 0;

  return {
    group: parts.group,
    roadMeshes: parts.roadMeshes,
    setRacingLineVisible: (v: boolean) => {
      if (parts.racingLineMesh) parts.racingLineMesh.visible = v;
    },
    recolorRacingLine: (from, count, colour) => {
      const mesh = parts.racingLineMesh;
      if (!mesh) return;
      const attr = mesh.geometry.getAttribute('color') as BufferAttribute;
      const steps = attr.count / 6;
      for (let k = 0; k < count; k++) {
        const i = (((from + k) % steps) + steps) % steps;
        const [r, g, b] = colour(i);
        for (let v = 0; v < 6; v++) attr.setXYZ(i * 6 + v, r, g, b);
      }
      attr.needsUpdate = true;
    },
    setStartLights: parts.setStartLights,
    update: (dt: number, cameraPos: Vector3) => {
      clock += dt;
      for (const wave of flagWaves) wave(clock);
      for (const board of parts.lodBoards)
        board.visible = board.position.distanceTo(cameraPos) < LOD_DISTANCE_M;
    },
    minimap,
    bounds,
    dispose: () => {
      for (const g of parts.disposables.geometries) g.dispose();
      for (const m of parts.disposables.materials) m.dispose();
      for (const t of parts.disposables.textures) t.dispose();
    },
  };
}

const FLAG_WAVE_SPEED = 3.2;
const FLAG_WAVE_AMPLITUDE = 0.18;

/** Returns a per-frame updater that bends a flag's plane geometry into a travelling sine wave. */
function makeFlagWave(flag: Mesh): (t: number) => void {
  const position = flag.geometry.attributes.position;
  const baseX = Float32Array.from({ length: position.count }, (_, i) => position.getX(i));
  return (t: number) => {
    for (let i = 0; i < position.count; i++) {
      const x = baseX[i];
      position.setZ(i, Math.sin(x * 3 + t * FLAG_WAVE_SPEED) * FLAG_WAVE_AMPLITUDE * (x + 0.7));
    }
    position.needsUpdate = true;
    flag.geometry.computeVertexNormals();
  };
}
