import { Group, Mesh } from 'three';
import type { RacingLine } from '../../../track/RacingLine';
import type { Track } from '../../../track/Track';
import type { TextureSet } from '../textures';
import { mergeDisposables, newDisposables, type Disposables } from '../types';
import { buildRoadSurface } from './surface';
import { buildRacingGroove } from './groove';
import { buildEdgeLines } from './edgeLines';
import { buildGridBoxes, buildStartFinishLine } from './startGrid';

export interface RoadBuild {
  group: Group;
  roadMeshes: Mesh[];
  disposables: Disposables;
}

export function buildRoad(
  track: Track,
  textures: TextureSet,
  racingLine: RacingLine | null,
): RoadBuild {
  const group = new Group();
  group.name = 'road';
  const disposables = newDisposables();

  const surface = buildRoadSurface(track, textures);
  group.add(surface.mesh);

  const edges = buildEdgeLines(track);
  group.add(edges.mesh);

  const start = buildStartFinishLine(track);
  group.add(start.mesh);

  const grid = buildGridBoxes(track);
  group.add(grid.mesh);

  mergeDisposables(
    disposables,
    surface.disposables,
    edges.disposables,
    start.disposables,
    grid.disposables,
  );

  if (racingLine) {
    const groove = buildRacingGroove(track, racingLine);
    group.add(groove.mesh);
    mergeDisposables(disposables, groove.disposables);
  }

  return { group, roadMeshes: [surface.mesh], disposables };
}
