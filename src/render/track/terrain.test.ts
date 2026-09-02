import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Track } from '../../track/Track';
import type { TrackJson } from '../../core/types';
import { terrainHeightAt } from './terrain';

const here = path.dirname(fileURLToPath(import.meta.url));
const tracksDir = path.resolve(here, '../../../public/tracks');

/** Minimum clearance (m) the terrain must keep below the road/run-off surface everywhere it applies. */
const MIN_CLEARANCE_M = 0.3;
/** Extra lateral reach (m) beyond barrierDistance() checked alongside the road-covered laterals. */
const OUTER_CHECK_M = 6;

function trackJsonFiles(): string[] {
  return readdirSync(tracksDir)
    .filter((f) => f.endsWith('.json') && f !== 'index.json')
    .sort();
}

function loadTrack(file: string): Track {
  const json = JSON.parse(readFileSync(path.join(tracksDir, file), 'utf-8')) as TrackJson;
  return new Track(json);
}

describe('terrain stays below the road and run-off on every real circuit', () => {
  for (const file of trackJsonFiles()) {
    const trackId = file.replace(/\.json$/, '');

    it(`${trackId}: terrain height <= road height - ${MIN_CLEARANCE_M}m at every sampled lateral`, () => {
      const track = loadTrack(file);
      let hint = 0;
      let checked = 0;
      const violations: string[] = [];

      // Stride through the circuit rather than every single sample (some tracks have 1000+
      // samples at 4m spacing); every 3rd sample is still a dense check along the whole lap.
      for (let i = 0; i < track.n; i += 3) {
        const hw = track.widths[i] / 2;
        const laterals = [-hw - OUTER_CHECK_M, -hw, -hw / 2, 0, hw / 2, hw, hw + OUTER_CHECK_M];
        const p = track.points[i];
        const r = track.rights[i];
        // The road/run-off surface height at this sample: for a bridge sample this is the upper
        // deck (what a car actually drives on there); the terrain corridor rule targets the lower
        // road, so bridge samples are checked against the deck they must stay clear of too.
        const roadHeight = p.y;

        for (const lateral of laterals) {
          const x = p.x + r.x * lateral;
          const z = p.z + r.z * lateral;
          const result = terrainHeightAt(track, x, z, hint);
          hint = result.hint;
          checked++;
          if (result.y > roadHeight - MIN_CLEARANCE_M) {
            violations.push(
              `sample ${i} lateral ${lateral.toFixed(1)}m: terrain=${result.y.toFixed(3)} ` +
                `road=${roadHeight.toFixed(3)} clearance=${(roadHeight - result.y).toFixed(3)}`,
            );
          }
        }
      }

      expect(checked).toBeGreaterThan(0);
      expect(violations.slice(0, 20)).toEqual([]);
    });
  }
});
