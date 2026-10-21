import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { InstancedMesh, Matrix4, Mesh, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Track } from '../../track/Track';
import { RacingLine } from '../../track/RacingLine';
import type { TrackJson } from '../../core/types';
import { buildTrackScene } from './TrackScene';

const here = path.dirname(fileURLToPath(import.meta.url));
const tracksDir = path.resolve(here, '../../../public/tracks');

/** Structures that may sit above the road (decks / gantries), but not in the car volume. */
const ALLOW_OVERHEAD = /bridge|gantry|parapet/i;
/** Surface / soft scenery excluded from the structural check. */
const SKIP =
  /road|runoff|curb|terrain|barrier|armco|tyre|catch|groove|edge|start-grid|racing-line|gravel|trees|forest/i;

function trackFiles(): string[] {
  return readdirSync(tracksDir)
    .filter((f) => f.endsWith('.json') && f !== 'index.json')
    .sort();
}

function ancestry(mesh: Mesh): string {
  const parts: string[] = [];
  let o: Mesh | null = mesh;
  while (o) {
    if (o.name) parts.push(o.name);
    o = o.parent as Mesh | null;
  }
  return parts.reverse().join('/');
}

function* worldSamples(mesh: Mesh): Generator<Vector3> {
  const pos = mesh.geometry.getAttribute('position');
  if (!pos) return;
  const v = new Vector3();
  const m = new Matrix4();
  if (mesh instanceof InstancedMesh) {
    const step = Math.max(1, Math.floor(mesh.count / 250));
    for (let i = 0; i < mesh.count; i += step) {
      mesh.getMatrixAt(i, m);
      v.set(0, 0.5, 0).applyMatrix4(m).applyMatrix4(mesh.matrixWorld);
      yield v.clone();
    }
    return;
  }
  const step = Math.max(1, Math.floor(pos.count / 64));
  for (let i = 0; i < pos.count; i += step) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    yield v.clone();
  }
}

/** Points of solid scenery that sit inside the driving volume (asphalt × car height). */
function driveVolumeHits(track: Track): string[] {
  const scene = buildTrackScene(track, {
    quality: 'low',
    timeOfDay: 'noon',
    racingLine: new RacingLine(track),
  });
  scene.group.updateMatrixWorld(true);
  const hits: string[] = [];
  const probe = new Vector3();

  scene.group.traverse((obj) => {
    if (!(obj instanceof Mesh)) return;
    const name = ancestry(obj);
    if (SKIP.test(name)) return;
    for (const p of worldSamples(obj)) {
      const q = track.query(probe.copy(p), null);
      if (Math.abs(q.lateral) > q.halfWidth * 0.95) continue;
      const dy = p.y - q.height;
      if (dy < -0.4 || dy > 4.5) continue;
      if (ALLOW_OVERHEAD.test(name) && dy > 4.0) continue;
      hits.push(`${name} @ s=${q.s.toFixed(0)} lat=${q.lateral.toFixed(1)} dy=${dy.toFixed(2)}`);
      break;
    }
  });

  scene.dispose();
  return hits;
}

describe('no scenery occupies the driving volume on any circuit', () => {
  for (const file of trackFiles()) {
    const trackId = file.replace(/\.json$/, '');
    it(`${trackId}: buildings / pillars / stands stay clear of the asphalt`, () => {
      const json = JSON.parse(readFileSync(path.join(tracksDir, file), 'utf-8')) as TrackJson;
      const hits = driveVolumeHits(new Track(json));
      expect(hits.slice(0, 15)).toEqual([]);
    }, 30_000);
  }
});
