import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { CARS, carById, STARTER_CAR_ID } from './cars';
import { defaultTuning, performancePoints } from '../physics/Tuning';
import { Track } from '../track/Track';
import { Vehicle, PHYSICS_DT } from '../physics/Vehicle';
import { ovalJson } from '../physics/testUtils';
import { emptyInput } from '../core/Input';
import type { CarClass } from '../core/types';

const CLASSES: CarClass[] = ['N100', 'N200', 'N300', 'N500', 'Gr.4', 'Gr.3', 'Gr.1'];

/**
 * PP bands measured from `performancePoints(spec, defaultTuning(spec))` on
 * the original 9-car roster plus this expansion (2026-09-04), not the
 * task brief's illustrative numbers - those didn't match this game's own
 * calibration (`Tuning.ts`: "a 130 hp coupe is ~335 PP, a GT3 car ~650").
 * Anchors: sakura_86 (N100) 335, hakone_type_r/kaizen_rx7 (N300) 425-427,
 * shinsei_gtr/bavaria_m4/stallion_gt/vantage_sf (N500) 475-638, aurelia_gt3
 * (Gr.3) 650, lyon_lmp (Gr.1) 1097. N200 and Gr.4 have no pre-existing
 * anchor and are interpolated between their neighbours.
 */
const PP_BANDS: Record<CarClass, [number, number]> = {
  N100: [260, 430],
  N200: [340, 480],
  N300: [400, 580],
  N500: [450, 700],
  'Gr.4': [530, 680],
  'Gr.3': [620, 760],
  'Gr.1': [800, 1400],
};

describe('car roster', () => {
  it('has at least 45 cars with unique ids', () => {
    expect(CARS.length).toBeGreaterThanOrEqual(45);
    const ids = new Set(CARS.map((c) => c.id));
    expect(ids.size).toBe(CARS.length);
  });

  it('every class has at least 4 cars', () => {
    for (const cls of CLASSES) {
      const count = CARS.filter((c) => c.carClass === cls).length;
      expect(count, `${cls} has ${count} cars`).toBeGreaterThanOrEqual(4);
    }
  });

  it('carById resolves every id, and the starter car exists', () => {
    for (const c of CARS) expect(carById(c.id).id).toBe(c.id);
    expect(() => carById(STARTER_CAR_ID)).not.toThrow();
  });

  it('every model file exists on disk and has an index.json entry', () => {
    const indexPath = 'public/models/cars/index.json';
    expect(existsSync(indexPath)).toBe(true);
    const index = JSON.parse(readFileSync(indexPath, 'utf8')) as { file: string }[];
    const indexed = new Set(index.map((e) => e.file));
    for (const c of CARS) {
      expect(existsSync(`public/models/cars/${c.model}`), `${c.id}: ${c.model}`).toBe(true);
      expect(indexed.has(c.model), `${c.id}: ${c.model} not in index.json`).toBe(true);
    }
  });

  it('every car falls within its class PP band', () => {
    for (const c of CARS) {
      const pp = performancePoints(c, defaultTuning(c));
      const [lo, hi] = PP_BANDS[c.carClass];
      expect(pp, `${c.id} (${c.carClass}) PP=${pp}, want [${lo},${hi}]`).toBeGreaterThanOrEqual(lo);
      expect(pp, `${c.id} (${c.carClass}) PP=${pp}, want [${lo},${hi}]`).toBeLessThanOrEqual(hi);
    }
  });

  it('has sane physical and mechanical values', () => {
    for (const c of CARS) {
      const info = c.id;
      expect(c.massKg, info).toBeGreaterThanOrEqual(600);
      expect(c.massKg, info).toBeLessThanOrEqual(2000);
      expect(c.lengthM, info).toBeGreaterThan(0);
      expect(c.widthM, info).toBeGreaterThan(0);
      expect(c.heightM, info).toBeGreaterThan(0);
      expect(c.wheelbaseM, info).toBeGreaterThan(0);
      expect(c.trackM, info).toBeGreaterThan(0);
      expect(c.wheelRadiusM, info).toBeGreaterThan(0);
      expect(c.wheelbaseM, info).toBeLessThan(c.lengthM);
      expect(c.redlineRpm, info).toBeGreaterThan(c.idleRpm);
      expect(c.brakeBias, info).toBeGreaterThanOrEqual(0.5);
      expect(c.brakeBias, info).toBeLessThanOrEqual(0.72);

      for (let i = 1; i < c.gearRatios.length; i++) {
        expect(c.gearRatios[i], `${info} gear ${i + 1}`).toBeLessThan(c.gearRatios[i - 1]);
      }

      const curve = c.torqueCurve;
      expect(curve.length, info).toBeGreaterThanOrEqual(3);
      for (let i = 1; i < curve.length; i++) {
        expect(curve[i].rpm, `${info} torque point ${i}`).toBeGreaterThan(curve[i - 1].rpm);
      }
      // The curve must start near idle and reach at least the redline -
      // see the existing 9 cars, whose first point sits 1.0-1.33x idle.
      expect(curve[0].rpm, info).toBeGreaterThanOrEqual(c.idleRpm * 0.9);
      expect(curve[0].rpm, info).toBeLessThanOrEqual(c.idleRpm * 1.5);
      expect(curve[curve.length - 1].rpm, info).toBeGreaterThanOrEqual(c.redlineRpm);
    }
  });
});

describe('car roster drives', () => {
  const track = new Track(ovalJson(14, 2500, 1200));
  const assists = {
    abs: true,
    tcs: 1 as const,
    stability: false,
    racingLine: false,
    autoBrake: false,
  };

  for (const spec of CARS) {
    it(`${spec.id}: drives cleanly at full throttle for 10s`, () => {
      const v = new Vehicle(spec, defaultTuning(spec), track, assists, 'auto');
      v.placeAt(20, 0);
      const input = emptyInput();
      // Settle onto the suspension before flooring it, same as
      // vehicle.test.ts and gearbox.test.ts - launching mid-drop is not a
      // fair test of straight-line stability.
      const settleSteps = Math.round(1 / PHYSICS_DT);
      for (let i = 0; i < settleSteps; i++) {
        v.setControls(input, PHYSICS_DT);
        v.step(PHYSICS_DT);
      }
      input.throttle = 1;
      const steps = Math.round(10 / PHYSICS_DT);
      for (let i = 0; i < steps; i++) {
        // A tiny centering correction, not a driving line - the same
        // proportional+derivative nudge src/physics/gearbox.test.ts uses to
        // keep a flat-out, unassisted car tracking straight over many
        // seconds. Pure steer=0 lets any small yaw asymmetry (normal for a
        // 4WD/MR car under full power) integrate into metres of drift by
        // the time a fast car covers real distance in 10s; a human foot
        // flat on the floor still has hands making this same correction.
        input.steer = -v.query.lateral * 0.03 - v.vel.dot(v.query.right) * 0.02;
        v.setControls(input, PHYSICS_DT);
        v.step(PHYSICS_DT);
        expect(Number.isFinite(v.pos.x) && Number.isFinite(v.pos.z), `${spec.id} step ${i}`).toBe(
          true,
        );
        expect(Number.isFinite(v.vel.x) && Number.isFinite(v.vel.z), `${spec.id} step ${i}`).toBe(
          true,
        );
      }
      expect(v.speedKmh, spec.id).toBeGreaterThan(60);
      expect(
        v.wheels.every((w) => w.contact),
        spec.id,
      ).toBe(true);
      expect(Math.abs(v.query.lateral), spec.id).toBeLessThan(1.5);
    });
  }
});
