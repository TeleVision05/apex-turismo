import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Track } from '../../track/Track';
import type { TrackJson } from '../../core/types';
import { buildTerrain, RESOLUTION_M, terrainHeightAt } from './terrain';
import { buildTextureSet } from './textures';

const here = path.dirname(fileURLToPath(import.meta.url));
const tracksDir = path.resolve(here, '../../../public/tracks');

/** Minimum clearance (m) the terrain must keep below the road/run-off surface everywhere it applies. */
const MIN_CLEARANCE_M = 0.3;
/** Extra lateral reach (m) beyond barrierDistance() checked alongside the road-covered laterals. */
const OUTER_CHECK_M = 6;
const MARGIN_M = 500;

function trackJsonFiles(): string[] {
  return readdirSync(tracksDir)
    .filter((f) => f.endsWith('.json') && f !== 'index.json')
    .sort();
}

function loadTrack(file: string): Track {
  const json = JSON.parse(readFileSync(path.join(tracksDir, file), 'utf-8')) as TrackJson;
  return new Track(json);
}

/** Bilinear sample of the built heightfield, matching the two-triangle split in buildTerrain. */
function meshHeightAt(
  positions: Float32Array,
  cols: number,
  rows: number,
  minX: number,
  minZ: number,
  x: number,
  z: number,
): number {
  const stride = cols + 1;
  const fx = (x - minX) / RESOLUTION_M;
  const fz = (z - minZ) / RESOLUTION_M;
  const c0 = Math.max(0, Math.min(cols - 1, Math.floor(fx)));
  const r0 = Math.max(0, Math.min(rows - 1, Math.floor(fz)));
  const tx = Math.max(0, Math.min(1, fx - c0));
  const tz = Math.max(0, Math.min(1, fz - r0));
  const y00 = positions[(r0 * stride + c0) * 3 + 1];
  const y10 = positions[(r0 * stride + c0 + 1) * 3 + 1];
  const y01 = positions[((r0 + 1) * stride + c0) * 3 + 1];
  const y11 = positions[((r0 + 1) * stride + c0 + 1) * 3 + 1];
  if (tx + tz <= 1) return y00 + (y10 - y00) * tx + (y01 - y00) * tz;
  return y11 + (y01 - y11) * (1 - tx) + (y10 - y11) * (1 - tz);
}

function continuousClearanceViolations(track: Track): string[] {
  let hint = 0;
  const violations: string[] = [];
  for (let i = 0; i < track.n; i += 3) {
    const hw = track.widths[i] / 2;
    const laterals = [-hw - OUTER_CHECK_M, -hw, -hw / 2, 0, hw / 2, hw, hw + OUTER_CHECK_M];
    const p = track.points[i];
    const r = track.rights[i];
    for (const lateral of laterals) {
      const x = p.x + r.x * lateral;
      const z = p.z + r.z * lateral;
      const result = terrainHeightAt(track, x, z, hint);
      hint = result.hint;
      if (result.y > p.y - MIN_CLEARANCE_M) {
        violations.push(
          `sample ${i} lateral ${lateral.toFixed(1)}m: terrain=${result.y.toFixed(3)} ` +
            `road=${p.y.toFixed(3)} clearance=${(p.y - result.y).toFixed(3)}`,
        );
      }
    }
  }
  return violations;
}

function meshClearanceViolations(track: Track): string[] {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of track.points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  minX -= MARGIN_M;
  maxX += MARGIN_M;
  minZ -= MARGIN_M;
  maxZ += MARGIN_M;
  const cols = Math.max(2, Math.ceil((maxX - minX) / RESOLUTION_M));
  const rows = Math.max(2, Math.ceil((maxZ - minZ) / RESOLUTION_M));

  const textures = buildTextureSet(32);
  const { mesh, disposables } = buildTerrain(track, textures);
  const positions = mesh.geometry.getAttribute('position').array as Float32Array;
  const violations: string[] = [];

  for (let i = 0; i < track.n; i += 2) {
    const hw = track.widths[i] / 2;
    const laterals = [-hw - OUTER_CHECK_M, -hw, 0, hw, hw + OUTER_CHECK_M];
    const p = track.points[i];
    const r = track.rights[i];
    for (const lateral of laterals) {
      const x = p.x + r.x * lateral;
      const z = p.z + r.z * lateral;
      const my = meshHeightAt(positions, cols, rows, minX, minZ, x, z);
      if (my > p.y - MIN_CLEARANCE_M) {
        violations.push(
          `sample ${i} lateral ${lateral.toFixed(1)}m: mesh=${my.toFixed(3)} ` +
            `road=${p.y.toFixed(3)} clearance=${(p.y - my).toFixed(3)}`,
        );
      }
    }
  }

  for (const g of disposables.geometries) g.dispose();
  for (const m of disposables.materials) m.dispose();
  for (const t of disposables.textures) t.dispose();
  for (const t of textures.all) t.dispose();
  return violations;
}

describe('terrain stays below the road and run-off on every real circuit', () => {
  for (const file of trackJsonFiles()) {
    const trackId = file.replace(/\.json$/, '');

    it(`${trackId}: continuous height <= road height - ${MIN_CLEARANCE_M}m at every sampled lateral`, () => {
      const track = loadTrack(file);
      const violations = continuousClearanceViolations(track);
      expect(violations.slice(0, 20)).toEqual([]);
    });

    it(`${trackId}: built mesh stays <= road height - ${MIN_CLEARANCE_M}m (catches figure-8 grid interp)`, () => {
      const violations = meshClearanceViolations(loadTrack(file));
      expect(violations.slice(0, 20)).toEqual([]);
    }, 20_000);
  }
});
