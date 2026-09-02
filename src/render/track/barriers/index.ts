import { Group } from 'three';
import type { Track } from '../../../track/Track';
import type { TextureSet } from '../textures';
import { mergeDisposables, newDisposables, type Disposables, type QualityConfig } from '../types';
import { buildArmco } from './armco';
import { buildBarrierPosts } from './posts';
import { buildTyreWalls } from './tyreWalls';
import { buildCatchFence } from './catchFence';

export interface BarrierBuild {
  group: Group;
  disposables: Disposables;
}

export function buildBarriers(
  track: Track,
  textures: TextureSet,
  quality: QualityConfig,
): BarrierBuild {
  const group = new Group();
  group.name = 'barriers';
  const disposables = newDisposables();

  const armco = buildArmco(track, textures);
  for (const m of armco.meshes) group.add(m);
  mergeDisposables(disposables, armco.disposables);

  const posts = buildBarrierPosts(track);
  group.add(posts.mesh);
  mergeDisposables(disposables, posts.disposables);

  if (quality.tyreWalls) {
    const tyres = buildTyreWalls(track);
    if (tyres.mesh) group.add(tyres.mesh);
    mergeDisposables(disposables, tyres.disposables);
  }

  if (quality.catchFence) {
    const fence = buildCatchFence(track, textures);
    for (const m of fence.group) group.add(m);
    if (fence.posts) group.add(fence.posts);
    mergeDisposables(disposables, fence.disposables);
  }

  return { group, disposables };
}
