import { it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { Track } from '../track/Track';
import { RaceSession, type RaceEntry } from './RaceSession';
import { carById } from '../data/cars';
import { defaultTuning } from '../physics/Tuning';
import { emptyInput } from '../core/Input';
import type { RaceConfig, TrackJson } from '../core/types';

/**
 * Regression for the "step in the road" bug: tracing kinks at Remus (Red Bull
 * Ring) and the Bus Stop (Spa) used to fold the road and launch cars into the
 * air. An expert AI now drives two laps of each and must stay planted.
 */
for (const trackId of ['red_bull_ring', 'spa']) {
  it.skipIf(!existsSync(`public/tracks/${trackId}.json`))(
    `the AI is never launched off the road at ${trackId}`,
    () => {
      const json = JSON.parse(readFileSync(`public/tracks/${trackId}.json`, 'utf8')) as TrackJson;
      const track = new Track(json);
      const spec = carById('aurelia_gt3');
      const config: RaceConfig = {
        mode: 'race',
        trackId,
        laps: 3,
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
      const v = bot.vehicle;
      // vertical speed the road itself imposes is speed x grade; anything beyond
      // that is the car leaving the surface
      let maxHop = 0;
      let maxHopAt = 0;
      let airborne = 0;
      let worstAirborne = 0;
      let worstAirborneAt = 0;
      let minUp = 1;
      for (let i = 0; i < 60 * 480 && bot.lap < 3; i++) {
        session.update(1 / 60, input);
        if (i < 60 * 3) continue; // grid launch
        const k = v.query.index;
        const grade =
          (track.points[(k + 1) % track.n].y - track.points[(k + track.n - 1) % track.n].y) /
          (2 * track.spacing);
        const hop = Math.abs(v.vel.y - v.speed * grade);
        if (hop > maxHop) {
          maxHop = hop;
          maxHopAt = v.query.s | 0;
        }
        if (v.wheels.every((w) => !w.contact)) {
          airborne++;
          if (airborne > worstAirborne) {
            worstAirborne = airborne;
            worstAirborneAt = v.query.s | 0;
          }
        } else airborne = 0;
        minUp = Math.min(minUp, v.up.y);
      }
      const info = `${trackId}: laps=${bot.lap} maxHop=${maxHop.toFixed(2)}m/s@s=${maxHopAt} airborne=${worstAirborne}frames@s=${worstAirborneAt} minUp=${minUp.toFixed(3)}`;
      expect(bot.lap, info).toBeGreaterThanOrEqual(3);
      expect(maxHop, info).toBeLessThan(2.5);
      expect(worstAirborne, info).toBeLessThan(12);
      expect(minUp, info).toBeGreaterThan(0.85);
    },
    180000,
  );
}
