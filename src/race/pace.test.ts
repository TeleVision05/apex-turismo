import { it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { Track } from '../track/Track';
import { RaceSession, type RaceEntry } from './RaceSession';
import { carById } from '../data/cars';
import { defaultTuning } from '../physics/Tuning';
import { emptyInput } from '../core/Input';
import { formatLapTime } from '../core/math';
import type { RaceConfig, TrackJson } from '../core/types';

it.skipIf(!existsSync('public/tracks/suzuka.json'))(
  'AI drives clean, plausible laps at Suzuka',
  () => {
    const json = JSON.parse(readFileSync('public/tracks/suzuka.json', 'utf8')) as TrackJson;
    const track = new Track(json);
    const out: string[] = [];
    for (const id of ['kaizen_rx7', 'aurelia_gt3']) {
      const spec = carById(id);
      const config: RaceConfig = {
        mode: 'race',
        trackId: 'suzuka',
        laps: 5,
        opponents: 1,
        difficulty: 'expert',
        timeOfDay: 'noon',
        weather: 'clear',
        playerCarId: '0',
        rollingStart: false,
        transmission: 'auto',
      };
      const entries: RaceEntry[] = [
        { spec, tuning: defaultTuning(spec), name: 'bot', isPlayer: false, skill: 0.96 },
        { spec, tuning: defaultTuning(spec), name: 'P', isPlayer: true, skill: 1 },
      ];
      const session = new RaceSession(
        track,
        config,
        entries,
        { abs: true, tcs: 1, stability: false, racingLine: false, autoBrake: false },
        'auto',
      );
      const input = emptyInput();
      const bot = session.participants[0];
      let offFrames = 0;
      let maxV = 0;
      const offSpots: number[] = [];
      let wasOff = false;
      for (let i = 0; i < 400 * 60; i++) {
        session.update(1 / 60, input);
        const v = bot.vehicle;
        maxV = Math.max(maxV, v.speedKmh);
        const off = v.offTrackWheels >= 4;
        if (off) offFrames++;
        if (off && !wasOff) offSpots.push(v.query.s | 0);
        wasOff = off;
      }
      out.push(
        `${id} laps=${bot.lap} best=${formatLapTime(bot.bestLapMs)} maxV=${maxV | 0} offFrames=${offFrames} offSpots=${offSpots.join(',')}`,
      );
      expect(bot.lap, out.join(' | ')).toBeGreaterThanOrEqual(2);
      expect(offFrames, out.join(' | ')).toBeLessThan(60);
      expect(bot.bestLapMs, out.join(' | ')).not.toBeNull();
      expect(bot.bestLapMs ?? Infinity).toBeLessThan(id === 'aurelia_gt3' ? 175000 : 215000);
    }
  },
  120000,
);
