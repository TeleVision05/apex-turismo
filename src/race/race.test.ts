import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { Track } from '../track/Track';
import { RaceSession } from './RaceSession';
import { buildEntries } from './RaceFactory';
import { carById } from '../data/cars';
import { defaultTuning } from '../physics/Tuning';
import { emptyInput } from '../core/Input';
import type { RaceConfig, TrackJson } from '../core/types';

const file = 'public/tracks/suzuka.json';

describe('RaceSession on Suzuka', () => {
  it.skipIf(!existsSync(file))(
    'AI cars complete most of a lap cleanly in 150 s',
    () => {
      const json = JSON.parse(readFileSync(file, 'utf8')) as TrackJson;
      const track = new Track(json);
      const config: RaceConfig = {
        mode: 'race',
        trackId: 'suzuka',
        laps: 2,
        opponents: 7,
        difficulty: 'normal',
        timeOfDay: 'noon',
        weather: 'clear',
        playerCarId: '0',
        opponentClass: 'N300',
        rollingStart: false,
        transmission: 'auto',
      };
      const spec = carById('kaizen_rx7');
      const entries = buildEntries(
        config,
        { specId: spec.id, tuning: defaultTuning(spec), odometerM: 0 },
        spec,
        'Tester',
      );
      const session = new RaceSession(
        track,
        config,
        entries,
        { abs: true, tcs: 1, stability: false, racingLine: false, autoBrake: false },
        'auto',
      );
      const input = emptyInput();
      const dt = 1 / 60;
      let maxSpeed = 0;
      let wallHits = 0;
      for (let i = 0; i < 150 * 60; i++) {
        session.update(dt, input);
        for (const p of session.participants) {
          if (!p.ai) continue;
          maxSpeed = Math.max(maxSpeed, p.vehicle.speedKmh);
          if (p.vehicle.wallContact > 2) wallHits++;
          expect(isFinite(p.vehicle.pos.x)).toBe(true);
        }
      }
      const bots = session.participants.filter((p) => p.ai);
      const distances = bots.map((p) => p.distance);
      // 150 s at a modest pace should cover well over half of the 5.8 km lap
      for (const d of distances) expect(d).toBeGreaterThan(3000);
      expect(maxSpeed).toBeGreaterThan(150);
      expect(maxSpeed).toBeLessThan(330);
      // wall hits per bot-frame should be rare
      expect(wallHits / (bots.length * 150 * 60)).toBeLessThan(0.02);
      const laps = bots.map((p) => p.lap);
      console.log(
        'distances',
        distances.map((d) => Math.round(d)),
        'laps',
        laps,
        'maxSpeed',
        maxSpeed.toFixed(0),
        'wallHits',
        wallHits,
      );
    },
    120000,
  );
});
